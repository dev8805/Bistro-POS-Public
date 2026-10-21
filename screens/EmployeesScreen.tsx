import React, { useState, useEffect } from 'react';
import { Screen } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { ScreenLoader } from '../components/ScreenLoader';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from '../components/modals/UpgradeProModal';
import { PayrollStaffView } from '../components/payroll/PayrollStaffView';

interface EmployeesScreenProps {
    onNavigate: (screen: Screen) => void;
    isOnline?: boolean;
}

interface Role {
    id: string;
    name: string;
    description: string | null;
    permissions: Record<string, boolean>;
    is_system_role: boolean;
    employee_count?: number;
}

interface Employee {
    id: string;
    full_name: string;
    phone: string | null;
    role: string;
    role_id: string | null;
    avatar_url: string | null;
    custom_permissions: Record<string, boolean> | null;
    is_active: boolean;
}

const PERMISSION_GROUPS = [
    {
        category: 'Punto de Venta',
        items: [
            { id: 'pos_view', label: 'Acceso al POS', desc: 'Puede ingresar al módulo de ventas' },
            { id: 'pos_sell', label: 'Finalizar Ventas', desc: 'Puede cobrar y cerrar ventas (si se desactiva, solo toma pedidos y envía comandas)' },
            { id: 'pos_open', label: 'Abrir Turno', desc: 'Puede abrir un turno de caja para empezar a vender' },
            { id: 'pos_discount', label: 'Aplicar Descuentos', desc: 'Puede cambiar precios o dar descuentos' },
            { id: 'pos_cancel', label: 'Anular Facturas', desc: 'Puede anular ventas ya realizadas' },
            { id: 'pos_refund', label: 'Devoluciones', desc: 'Puede registrar devoluciones de ventas anteriores' },
            { id: 'pos_close', label: 'Cierre de Caja', desc: 'Puede realizar el arqueo y cierre' },
        ]
    },
    {
        category: 'Inventario',
        items: [
            { id: 'inv_view', label: 'Ver Productos', desc: 'Consultar lista y precios' },
            { id: 'inv_create', label: 'Crear/Editar Productos', desc: 'Gestionar catálogo de items' },
            { id: 'inv_stock', label: 'Ajustar Stock', desc: 'Modificar cantidades manualmente' },
            { id: 'inv_purchase', label: 'Registrar Gastos', desc: 'Compra de inventario, gastos y mermas' },
        ]
    },
    {
        category: 'Finanzas',
        items: [
            { id: 'clients_view', label: 'Cuentas por Cobrar', desc: 'Ver clientes y fiados' },
            { id: 'debts_view', label: 'Cuentas por Pagar', desc: 'Ver deudas a proveedores' },
        ]
    },
    {
        category: 'Administración',
        items: [
            { id: 'admin_users', label: 'Gestionar Empleados', desc: 'Crear usuarios y asignar roles' },
            { id: 'admin_reports', label: 'Ver Reportes', desc: 'Acceso a estadísticas y ganancias' },
            { id: 'admin_settings', label: 'Configuración', desc: 'Editar datos de la empresa' },
        ]
    }
];

// --- Opción A: herencia de permisos visible ---
// Algunos permisos NO se guardan explícitamente; en runtime "heredan" de otros.
// Estos helpers hacen que la UI muestre el valor EFECTIVO (lo que realmente pasa)
// y marquen esos permisos como "Automático" cuando aplican por herencia.
//
// Cada entrada define de qué depende el permiso cuando NO está fijado a mano:
//   pos_sell / pos_open  → heredan de "Acceso al POS" (pos_view)
//   clients_view (Cuentas por Cobrar) → pos_view o inv_view
//   debts_view  (Cuentas por Pagar)   → admin_reports o pos_close
const INHERITED_PERMS: Record<string, (p: Record<string, boolean>) => boolean> = {
    pos_sell: (p) => p['pos_view'] === true,
    pos_open: (p) => p['pos_view'] === true,
    clients_view: (p) => p['pos_view'] === true || p['inv_view'] === true,
    debts_view: (p) => p['admin_reports'] === true || p['pos_close'] === true,
};

// Etiqueta y texto de ayuda para permisos que están activos automáticamente (no fijados a mano).
const AUTO_BADGE_LABEL = 'Automático';
const AUTO_HELP_TEXT = 'Se activa automáticamente según el rol. Tócalo para fijarlo o cambiarlo.';

const getEffectivePerm = (perms: Record<string, boolean>, id: string): boolean => {
    if (typeof perms[id] === 'boolean') return perms[id];
    const inherit = INHERITED_PERMS[id];
    return inherit ? inherit(perms) : false;
};

const isInheritedPerm = (perms: Record<string, boolean>, id: string): boolean => {
    return typeof perms[id] !== 'boolean'
        && !!INHERITED_PERMS[id]
        && INHERITED_PERMS[id](perms);
};

const AVATAR_COLORS = [
    'bg-purple-100 text-purple-600',
    'bg-blue-100 text-blue-600',
    'bg-orange-100 text-orange-600',
    'bg-green-100 text-green-600',
    'bg-pink-100 text-pink-600',
    'bg-teal-100 text-teal-600',
];

export const EmployeesScreen: React.FC<EmployeesScreenProps> = ({ onNavigate, isOnline = true }) => {
    const { profile } = useAuth();
    const { confirmAction } = useConfirmDialog();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'employees' | 'roles' | 'payroll'>('employees');
    const { maxEmployees, isStandard } = usePlanFeatures();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Data state
    const [roles, setRoles] = useState<Role[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [newEmployeeName, setNewEmployeeName] = useState('');
    const [newEmployeePhone, setNewEmployeePhone] = useState('');
    const [newEmployeeRoleId, setNewEmployeeRoleId] = useState('');
    const [savingEmployee, setSavingEmployee] = useState(false);
    const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

    // Role editing state
    const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
    const [editingPermissions, setEditingPermissions] = useState<Record<string, boolean>>({});
    const [savingRole, setSavingRole] = useState(false);

    // New role form
    const [showNewRoleForm, setShowNewRoleForm] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDescription, setNewRoleDescription] = useState('');

    // Mobile form visibility state
    const [showEmployeeForm, setShowEmployeeForm] = useState(false);

    // Mobile permissions sidebar
    const [showPermissionsSidebar, setShowPermissionsSidebar] = useState(false);

    // Employee permissions modal
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [employeePermissions, setEmployeePermissions] = useState<Record<string, boolean>>({});
    const [savingEmployeePerms, setSavingEmployeePerms] = useState(false);

    // Permisos personalizados en la creación de nuevo empleado
    const [newEmployeePermsOverrides, setNewEmployeePermsOverrides] = useState<Record<string, boolean> | null>(null);
    const [showNewEmployeePermsModal, setShowNewEmployeePermsModal] = useState(false);
    const [newEmployeeTempPerms, setNewEmployeeTempPerms] = useState<Record<string, boolean>>({});

    // Owner protection - prevent deleting the business owner
    const [businessOwnerId, setBusinessOwnerId] = useState<string | null>(null);

    const fetchData = async (showLoader = true) => {
        if (!profile?.business_id) return;
        if (showLoader) setLoading(true);
        try {
            const [rolesResult, employeesResult, businessResult] = await Promise.all([
                supabase.from('roles').select('*').order('name'),
                supabase.from('profiles')
                    .select('id, full_name, phone, role, role_id, avatar_url, custom_permissions, is_active')
                    .eq('business_id', profile.business_id)
                    .eq('is_deleted', false)
                    .order('created_at'),
                supabase.from('businesses').select('owner_id').single()
            ]);

            if (rolesResult.error) throw rolesResult.error;
            if (employeesResult.error) throw employeesResult.error;

            if (businessResult.data?.owner_id) {
                setBusinessOwnerId(businessResult.data.owner_id);
            }

            const rolesWithCount = (rolesResult.data || [])
                .map(role => ({
                    ...role,
                    employee_count: (employeesResult.data || []).filter(e => e.role_id === role.id).length
                }));

            setRoles(rolesWithCount);
            setEmployees(employeesResult.data || []);

            if (rolesWithCount.length > 0 && !selectedRoleId) {
                setSelectedRoleId(rolesWithCount[0].id);
                setEditingPermissions(rolesWithCount[0].permissions || {});
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            if (isOnline) {
                showToast('Error al cargar datos', 'error');
            }
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [profile?.business_id]);

    useEffect(() => {
        if (isOnline && profile?.business_id) {
            fetchData(false);
        }
    }, [isOnline]);

    // Update editing permissions when role changes
    useEffect(() => {
        const role = roles.find(r => r.id === selectedRoleId);
        if (role) {
            setEditingPermissions(role.permissions || {});
        }
    }, [selectedRoleId, roles]);

    const handleOpenNewEmployee = () => {
        if (!isOnline) {
            showToast('Necesitas internet para gestionar empleados', 'warning');
            return;
        }
        const activeCount = employees.filter(e => e.is_active).length;
        if (activeCount >= maxEmployees) {
            setShowUpgradeModal(true);
            return;
        }
        setNewEmployeeName('');
        setNewEmployeePhone('');
        setNewEmployeeRoleId('');
        setEditingEmployeeId(null);
        setNewEmployeePermsOverrides(null);
        setShowEmployeeForm(true);
    };

    const handleEditEmployee = (employee: Employee) => {
        if (!isOnline) {
            showToast('Necesitas internet para editar empleados', 'warning');
            return;
        }
        setNewEmployeeName(employee.full_name || '');
        setNewEmployeePhone(employee.phone || '');
        setNewEmployeeRoleId(employee.role_id || '');
        setEditingEmployeeId(employee.id);
        setShowEmployeeForm(true);
    };

    const handleSaveEmployee = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!navigator.onLine) {
            showToast('Necesitas conexión a internet para gestionar empleados', 'warning');
            return;
        }

        if (!editingEmployeeId) {
            const activeCount = employees.filter(emp => emp.is_active).length;
            if (activeCount >= maxEmployees) {
                setShowUpgradeModal(true);
                return;
            }
        }

        if (!newEmployeeName || !newEmployeePhone || !newEmployeeRoleId) {
            showToast('Por favor completa todos los campos', 'error');
            return;
        }

        setSavingEmployee(true);
        try {
            if (!profile?.business_id) {
                showToast('Error: No se identificó el negocio', 'error');
                return;
            }

            let formattedPhone = newEmployeePhone.replace(/\s/g, '');
            if (!formattedPhone.startsWith('+')) {
                formattedPhone = '+57' + formattedPhone;
            }

            const isEditing = !!editingEmployeeId;
            const originalEmployee = isEditing ? employees.find(e => e.id === editingEmployeeId) : null;
            const roleChanged = isEditing && originalEmployee && originalEmployee.role_id !== newEmployeeRoleId;
            const functionName = isEditing ? 'update-employee' : 'create-employee';

            const payload = isEditing ? {
                employee_id: editingEmployeeId,
                full_name: newEmployeeName,
                phone: formattedPhone,
                role_id: newEmployeeRoleId,
            } : {
                email: `${formattedPhone.replace('+', '')}@bistro.temp`,
                password: '1234',
                phone: formattedPhone,
                full_name: newEmployeeName,
                role_id: newEmployeeRoleId,
                business_id: profile.business_id
            };

            const { data, error } = await invokeEdgeFunction(functionName, payload);

            if (error) {
                showToast(error, 'error');
                return;
            }

            // Si hay overrides de permisos, aplicarlos al perfil recién creado (solo en creacion)
            if (!isEditing && newEmployeePermsOverrides && Object.keys(newEmployeePermsOverrides).length > 0 && data?.user?.id) {
                await supabase
                    .from('profiles')
                    .update({ custom_permissions: newEmployeePermsOverrides })
                    .eq('id', data.user.id);
            }

            // Limpiar custom_permissions si cambió el rol al editar
            if (roleChanged && editingEmployeeId) {
                await supabase
                    .from('profiles')
                    .update({ custom_permissions: null })
                    .eq('id', editingEmployeeId);
            }

            showToast(isEditing ? 'Empleado actualizado exitosamente' : 'Empleado creado exitosamente', 'success');

            setNewEmployeeName('');
            setNewEmployeePhone('');
            setNewEmployeeRoleId('');
            setNewEmployeePermsOverrides(null);
            setEditingEmployeeId(null);
            setShowEmployeeForm(false);

            await fetchData(false);

        } catch (error: any) {
            console.error('Error saving employee:', error);
            showToast('No se pudo completar la operación. Intenta de nuevo.', 'error');
        } finally {
            setSavingEmployee(false);
        }
    };

    const handleToggleEmployeeStatus = async (employee: Employee) => {
        if (employee.id === businessOwnerId) {
            showToast('No puedes desactivar al dueño del negocio', 'error');
            return;
        }

        const isDeactivating = employee.is_active;
        const confirmed = await confirmAction({
            title: isDeactivating ? '¿Desactivar este empleado?' : '¿Reactivar este empleado?',
            message: isDeactivating
                ? 'El empleado perderá acceso inmediatamente y cerrará sesión.'
                : 'El empleado podrá volver a iniciar sesión.',
            confirmText: isDeactivating ? 'Desactivar' : 'Reactivar',
            variant: isDeactivating ? 'danger' : 'info'
        });
        if (!confirmed) return;

        try {
            const { data, error } = await invokeEdgeFunction('delete-employee', {
                employee_id: employee.id,
                action: isDeactivating ? 'deactivate' : 'reactivate'
            });

            if (error) {
                showToast(error, 'error');
                return;
            }

            setEmployees(employees.map(e =>
                e.id === employee.id ? { ...e, is_active: !isDeactivating } : e
            ));
            showToast(
                isDeactivating ? 'Empleado desactivado' : 'Empleado reactivado',
                'success'
            );
        } catch (error: any) {
            console.error('Error toggling employee status:', error);
            showToast('No se pudo cambiar el estado del empleado. Intenta de nuevo.', 'error');
        }
    };

    const handleDeleteEmployee = async (employee: Employee) => {
        if (employee.id === businessOwnerId) {
            showToast('No puedes eliminar al dueño del negocio', 'error');
            return;
        }

        const confirmed = await confirmAction({
            title: '¿Eliminar Empleado?',
            message: 'El empleado perderá acceso permanentemente y no se podrá recuperar. Sus ventas y operaciones se conservarán. ¿Estás seguro de eliminar a ' + (employee.full_name || 'este empleado') + '?',
            confirmText: 'Sí, Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            const { data, error } = await invokeEdgeFunction('delete-employee', {
                employee_id: employee.id,
                action: 'delete'
            });

            if (error) {
                showToast(error, 'error');
                return;
            }

            setEmployees(employees.filter(e => e.id !== employee.id));
            showToast('Empleado eliminado permanentemente', 'success');
        } catch (error: any) {
            console.error('Error deleting employee:', error);
            showToast('No se pudo eliminar el empleado. Intenta de nuevo.', 'error');
        }
    };

    const handleSavePermissions = async () => {
        if (!selectedRoleId) return;

        const role = roles.find(r => r.id === selectedRoleId);
        const affectedCount = role?.employee_count || 0;
        const confirmed = await confirmAction({
            title: '¿Guardar cambios de permisos?',
            message: affectedCount > 0
                ? `Esto afectará a ${affectedCount} empleado${affectedCount !== 1 ? 's' : ''} con el rol "${role?.name}" de inmediato.`
                : `Se actualizarán los permisos del rol "${role?.name}".`,
            confirmText: 'Guardar',
            variant: 'warning'
        });
        if (!confirmed) return;

        setSavingRole(true);
        try {
            const { error } = await supabase
                .from('roles')
                .update({ permissions: editingPermissions })
                .eq('id', selectedRoleId);

            if (error) throw error;

            // Update local state
            setRoles(roles.map(r =>
                r.id === selectedRoleId
                    ? { ...r, permissions: editingPermissions }
                    : r
            ));

            showToast('Permisos guardados correctamente', 'success');
        } catch (error) {
            console.error('Error saving permissions:', error);
            showToast('Error al guardar permisos', 'error');
        } finally {
            setSavingRole(false);
        }
    };

    const handleCreateRole = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newRoleName) {
            showToast('El nombre del rol es requerido', 'error');
            return;
        }

        setSavingRole(true);
        try {
            if (!profile?.business_id) {
                throw new Error('No se encontró el ID del negocio en tu perfil');
            }

            const insertData = {
                name: newRoleName,
                description: newRoleDescription || null,
                permissions: {},
                is_system_role: false,
                business_id: profile.business_id
            };

            const { data, error } = await supabase
                .from('roles')
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;

            setRoles([...roles, { ...data, employee_count: 0 }]);
            setShowNewRoleForm(false);
            setNewRoleName('');
            setNewRoleDescription('');
            setSelectedRoleId(data.id);
            showToast('Rol creado correctamente', 'success');
        } catch (error: any) {
            console.error('Error creating role:', error);
            if (error.code === '23505') {
                showToast('Ya existe un rol con ese nombre', 'error');
            } else if (error.code === '42501') {
                showToast('No tienes permisos para crear roles', 'error');
            } else {
                showToast('Error al crear rol', 'error');
            }
        } finally {
            setSavingRole(false);
        }
    };

    const handleDeleteRole = async (roleId: string) => {
        const role = roles.find(r => r.id === roleId);
        if (!role) return;

        if (role.is_system_role) {
            showToast('No se pueden eliminar roles del sistema', 'error');
            return;
        }

        if ((role.employee_count || 0) > 0) {
            showToast('No se puede eliminar un rol con empleados asignados', 'error');
            return;
        }

        try {
            const { error } = await supabase
                .from('roles')
                .delete()
                .eq('id', roleId);

            if (error) throw error;

            setRoles(roles.filter(r => r.id !== roleId));
            if (selectedRoleId === roleId) {
                const remainingRoles = roles.filter(r => r.id !== roleId);
                setSelectedRoleId(remainingRoles[0]?.id || null);
            }
            showToast('Rol eliminado correctamente', 'success');
        } catch (error: any) {
            console.error('Error deleting role:', error);
            if (error.code === '42501') {
                showToast('No tienes permisos para eliminar roles', 'error');
            } else {
                showToast('Error al eliminar rol', 'error');
            }
        }
    };

    const togglePermission = (permId: string) => {
        setEditingPermissions(prev => ({
            ...prev,
            [permId]: !getEffectivePerm(prev, permId)
        }));
    };

    const handleOpenEmployeePermissions = (employee: Employee) => {
        const baseRole = roles.find(r => r.id === employee.role_id);
        const rolePerms = baseRole?.permissions || {};
        const customPerms = employee.custom_permissions || {};
        setEmployeePermissions({ ...rolePerms, ...customPerms });
        setEditingEmployee(employee);
    };

    const handleSaveEmployeePermissions = async () => {
        if (!editingEmployee) return;
        if (!navigator.onLine) {
            showToast('Necesitas conexión a internet para guardar permisos', 'warning');
            return;
        }
        setSavingEmployeePerms(true);
        try {
            const baseRole = roles.find(r => r.id === editingEmployee.role_id);
            const rolePerms = baseRole?.permissions || {};

            // Solo guardar los overrides (keys que difieren del rol base)
            const overrides: Record<string, boolean> = {};
            for (const key of Object.keys(employeePermissions)) {
                if (employeePermissions[key] !== rolePerms[key]) {
                    overrides[key] = employeePermissions[key];
                }
            }
            const customPerms = Object.keys(overrides).length > 0 ? overrides : null;

            const { error } = await supabase
                .from('profiles')
                .update({ custom_permissions: customPerms })
                .eq('id', editingEmployee.id);

            if (error) throw error;

            setEmployees(employees.map(e =>
                e.id === editingEmployee.id
                    ? { ...e, custom_permissions: customPerms }
                    : e
            ));
            showToast('Permisos guardados', 'success');
            setEditingEmployee(null);
        } catch (err) {
            console.error(err);
            showToast('Error al guardar permisos', 'error');
        } finally {
            setSavingEmployeePerms(false);
        }
    };

    const handleResetEmployeePermissions = async () => {
        if (!editingEmployee) return;
        setSavingEmployeePerms(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ custom_permissions: null })
                .eq('id', editingEmployee.id);

            if (error) throw error;

            const baseRole = roles.find(r => r.id === editingEmployee.role_id);
            const rolePerms = baseRole?.permissions || {};
            setEmployees(employees.map(e =>
                e.id === editingEmployee.id ? { ...e, custom_permissions: null } : e
            ));
            setEmployeePermissions({ ...rolePerms });
            showToast('Permisos restablecidos al rol', 'success');
        } catch (err) {
            console.error(err);
            showToast('Error al restablecer', 'error');
        } finally {
            setSavingEmployeePerms(false);
        }
    };

    const toggleEmployeePermission = (permId: string) => {
        setEmployeePermissions(prev => ({ ...prev, [permId]: !getEffectivePerm(prev, permId) }));
    };

    const getAvatarColor = (index: number) => {
        return AVATAR_COLORS[index % AVATAR_COLORS.length];
    };

    const selectedRole = roles.find(r => r.id === selectedRoleId);

    // -- Lógica para modal temporal (Nuevo Empleado) --
    const handleOpenNewEmployeePerms = () => {
        if (!newEmployeeRoleId) return;
        const baseRole = roles.find(r => r.id === newEmployeeRoleId);
        if (!baseRole) return;

        // Si ya había overrides guardados temporalmente, los fusionamos con los del rol. Si no, solo los del rol.
        if (newEmployeePermsOverrides) {
            setNewEmployeeTempPerms({ ...baseRole.permissions, ...newEmployeePermsOverrides });
        } else {
            setNewEmployeeTempPerms({ ...baseRole.permissions });
        }
        setShowNewEmployeePermsModal(true);
    };

    const handleSaveNewEmployeePerms = () => {
        const baseRole = roles.find(r => r.id === newEmployeeRoleId);
        if (!baseRole) return;

        const overrides: Record<string, boolean> = {};
        for (const key of Object.keys(newEmployeeTempPerms)) {
            if (newEmployeeTempPerms[key] !== baseRole.permissions[key]) {
                overrides[key] = newEmployeeTempPerms[key];
            }
        }

        setNewEmployeePermsOverrides(Object.keys(overrides).length > 0 ? overrides : null);
        setShowNewEmployeePermsModal(false);
    };

    const handleResetNewEmployeePerms = () => {
        const baseRole = roles.find(r => r.id === newEmployeeRoleId);
        if (!baseRole) return;
        setNewEmployeeTempPerms({ ...baseRole.permissions });
        setNewEmployeePermsOverrides(null);
    };

    const toggleNewEmployeePermission = (permId: string) => {
        setNewEmployeeTempPerms(prev => ({ ...prev, [permId]: !getEffectivePerm(prev, permId) }));
    };
    // ------------------------------------------------


    const selectedEmployeeBaseRole = editingEmployee ? roles.find(r => r.id === editingEmployee.role_id) : null;
    const newEmployeeBaseRole = newEmployeeRoleId ? roles.find(r => r.id === newEmployeeRoleId) : null;

    if (!isOnline) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                        La gestión de personal requiere internet para cargar empleados y roles.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) return <ScreenLoader />;

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden animate-fadeIn">

            {/* Employee Permissions Modal */}
            {editingEmployee && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setEditingEmployee(null)} onKeyDown={(e) => e.key === 'Escape' && setEditingEmployee(null)} aria-label="Cerrar" />
                    <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-[fadeIn_0.2s_ease-out]">
                        {/* Modal Header */}
                        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white text-base">
                                    Permisos: {editingEmployee.full_name}
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Rol base: <span className="font-semibold text-gray-700 dark:text-gray-300">{selectedEmployeeBaseRole?.name || editingEmployee.role || 'Sin rol'}</span>
                                    {editingEmployee.custom_permissions && Object.keys(editingEmployee.custom_permissions).length > 0 && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                            Personalizado
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button onClick={() => setEditingEmployee(null)} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Permissions List */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                            {PERMISSION_GROUPS.map((group, idx) => {
                                return (
                                    <div key={group.category}>
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                                            {group.category}
                                        </h4>
                                        <div className="space-y-2">
                                            {group.items.map(perm => {
                                                const checked = getEffectivePerm(employeePermissions, perm.id);
                                                const inherited = isInheritedPerm(employeePermissions, perm.id);
                                                return (
                                                    <div
                                                        key={perm.id}
                                                        onClick={() => toggleEmployeePermission(perm.id)}
                                                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer active:scale-[0.99]"
                                                    >
                                                        <div className="pt-0.5 shrink-0">
                                                            <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'
                                                                }`}>
                                                                {checked && (
                                                                    <span className="material-symbols-outlined text-[#102218] text-sm">check</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{perm.label}</p>
                                                                {inherited && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                                        {AUTO_BADGE_LABEL}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5">{inherited ? AUTO_HELP_TEXT : perm.desc}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                            <button
                                onClick={handleResetEmployeePermissions}
                                disabled={savingEmployeePerms || !editingEmployee.custom_permissions}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 flex items-center gap-1 transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">restart_alt</span>
                                Restablecer a rol
                            </button>
                            <button
                                onClick={handleSaveEmployeePermissions}
                                disabled={savingEmployeePerms}
                                className="bg-primary hover:bg-primary-hover text-[#102218] px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {savingEmployeePerms && <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Permisos Temporales (Nuevo Empleado) */}
            {showNewEmployeePermsModal && newEmployeeBaseRole && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowNewEmployeePermsModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewEmployeePermsModal(false)} aria-label="Cerrar" />
                    <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-[fadeIn_0.2s_ease-out]">
                        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white text-base">
                                    Ajustar Permisos Iniciales
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Rol base: <span className="font-semibold text-gray-700 dark:text-gray-300">{newEmployeeBaseRole.name}</span>
                                    {newEmployeePermsOverrides && Object.keys(newEmployeePermsOverrides).length > 0 && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                            Personalizado
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button onClick={() => setShowNewEmployeePermsModal(false)} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                            {PERMISSION_GROUPS.map((group, idx) => {
                                return (
                                    <div key={group.category}>
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                                            {group.category}
                                        </h4>
                                        <div className="space-y-2">
                                            {group.items.map(perm => {
                                                const checked = getEffectivePerm(newEmployeeTempPerms, perm.id);
                                                const inherited = isInheritedPerm(newEmployeeTempPerms, perm.id);
                                                return (
                                                    <div
                                                        key={perm.id}
                                                        onClick={() => toggleNewEmployeePermission(perm.id)}
                                                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer active:scale-[0.99]"
                                                    >
                                                        <div className="pt-0.5 shrink-0">
                                                            <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'
                                                                }`}>
                                                                {checked && (
                                                                    <span className="material-symbols-outlined text-[#102218] text-sm">check</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{perm.label}</p>
                                                                {inherited && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                                        {AUTO_BADGE_LABEL}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5">{inherited ? AUTO_HELP_TEXT : perm.desc}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={handleResetNewEmployeePerms}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 flex items-center gap-1 transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">restart_alt</span>
                                Deshacer cambios
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNewEmployeePerms}
                                className="bg-primary hover:bg-primary-hover text-[#102218] px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
                            >
                                Aplicar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Header con las pestañas */}
            <header className="h-14 shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-4 lg:px-6 flex items-center z-10">
                <div className="bg-gray-100 dark:bg-gray-800/60 rounded-lg p-0.5 inline-flex border border-gray-200 dark:border-gray-800">
                    <button
                        onClick={() => setActiveTab('employees')}
                        className={`px-3 py-1 text-[13px] font-semibold rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'employees' ? 'bg-primary text-[#102218] shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                        <span className="material-symbols-outlined text-[16px]">lock_person</span>
                        Acceso al POS
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={`px-3 py-1 text-[13px] font-semibold rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'roles' ? 'bg-primary text-[#102218] shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                        <span className="material-symbols-outlined text-[16px]">verified_user</span>
                        Roles y Permisos
                    </button>
                    <button
                        onClick={() => setActiveTab('payroll')}
                        className={`px-3 py-1 text-[13px] font-semibold rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'payroll' ? 'bg-primary text-[#102218] shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                        <span className="material-symbols-outlined text-[16px]">badge</span>
                        Personal y Nómina
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 bg-gray-50 dark:bg-black/20 custom-scrollbar">

                {activeTab === 'payroll' ? (
                    <div className="max-w-7xl mx-auto">
                        <PayrollStaffView existingProfiles={employees} />
                    </div>
                ) : activeTab === 'employees' ? (
                    /* --- EMPLOYEES VIEW --- */
                    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start animate-[fadeIn_0.3s_ease-out]">

                        {/* Left Column: Form */}
                        <div className="lg:col-span-5">

                            {/* Plan Estándar limit banner */}
                            {isStandard && (
                                <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center justify-between gap-2 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="size-8 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-lg">badge</span>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                                                Plan Estándar ({employees.filter(e => e.is_active).length}/3 usuarios)
                                            </p>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                Usuarios ilimitados en Plan Pro
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowUpgradeModal(true)}
                                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-900 font-extrabold text-[11px] flex items-center gap-1 shadow-sm shrink-0 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">star</span>
                                        <span>Mejorar</span>
                                    </button>
                                </div>
                            )}

                            {/* Mobile Toggle Button */}
                            <button
                                onClick={handleOpenNewEmployee}
                                className={`w-full py-3 bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm text-gray-700 dark:text-gray-200 font-bold flex items-center justify-center gap-2 lg:hidden active:scale-[0.98] transition-all duration-300 mb-4 ${showEmployeeForm ? 'opacity-0 scale-95 h-0 overflow-hidden mb-0 py-0 border-0' : 'opacity-100 scale-100'}`}
                            >
                                <span className="material-symbols-outlined">person_add</span>
                                Nuevo Empleado
                            </button>

                            <div className={`bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden sticky top-4 transition-all duration-300 ease-out lg:opacity-100 lg:scale-100 lg:max-h-none lg:block ${showEmployeeForm ? 'opacity-100 scale-100 max-h-[600px]' : 'opacity-0 scale-95 max-h-0 lg:max-h-none pointer-events-none lg:pointer-events-auto'}`}>
                                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-gray-500">{editingEmployeeId ? 'edit' : 'person_add'}</span>
                                        {editingEmployeeId ? 'Editar Empleado' : 'Nuevo Empleado'}
                                    </h3>
                                    {/* Mobile Close Button */}
                                    <button
                                        onClick={() => { setShowEmployeeForm(false); setEditingEmployeeId(null); }}
                                        className="lg:hidden p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                <form className="p-6 space-y-5" onSubmit={handleSaveEmployee}>
                                    <div className="space-y-1.5">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                            Nombre Completo <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                                                <span className="material-symbols-outlined text-xl">person</span>
                                            </span>
                                            <input
                                                type="text"
                                                value={newEmployeeName}
                                                onChange={(e) => setNewEmployeeName(e.target.value)}
                                                className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                                                placeholder="Ej: Juan Pérez"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                            Teléfono <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                                                <span className="material-symbols-outlined text-xl">call</span>
                                            </span>
                                            <input
                                                type="tel"
                                                value={newEmployeePhone}
                                                onChange={(e) => setNewEmployeePhone(e.target.value)}
                                                className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                                                placeholder="Ej: 300 123 4567"
                                            />
                                        </div>
                                    </div>

                                    {!editingEmployeeId && (
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl flex items-start gap-2">
                                            <span className="material-symbols-outlined text-blue-500 dark:text-blue-400 text-[20px]">info</span>
                                            <p className="text-blue-700 dark:text-blue-300 text-xs">
                                                El PIN por defecto será <strong>1234</strong>. El empleado podrá cambiarlo desde su perfil.
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                            Rol <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                                                <span className="material-symbols-outlined text-xl">badge</span>
                                            </span>
                                            <select
                                                value={newEmployeeRoleId}
                                                onChange={(e) => {
                                                    setNewEmployeeRoleId(e.target.value);
                                                    setNewEmployeePermsOverrides(null); // Reset overrides on role change
                                                }}
                                                className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors cursor-pointer"
                                            >
                                                <option value="">Seleccionar rol...</option>
                                                {roles.map(role => (
                                                    <option key={role.id} value={role.id}>{role.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {newEmployeeRoleId && !editingEmployeeId && (
                                            <div className="flex justify-end mt-2">
                                                <button
                                                    type="button"
                                                    onClick={handleOpenNewEmployeePerms}
                                                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1 font-bold transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">tune</span>
                                                    Ajustar permisos de este empleado
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            type="submit"
                                            disabled={savingEmployee || !newEmployeeName.trim() || !newEmployeePhone.trim() || !newEmployeeRoleId}
                                            className="w-full h-11 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg font-bold shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
                                        >
                                            {savingEmployee ? (
                                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined">save</span>
                                            )}
                                            {editingEmployeeId ? 'Actualizar Empleado' : 'Guardar Empleado'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Right Column: List */}
                        <div className="lg:col-span-7">
                            {/* Mobile Card Layout */}
                            <div className="xl:hidden space-y-3">
                                {employees.map((employee, index) => (
                                    <div
                                        key={employee.id}
                                        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex items-start sm:items-center gap-3 min-w-0 sm:flex-1">
                                            <div className={`size-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${getAvatarColor(index)}`}>
                                                {employee.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '??'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className={`font-bold text-sm truncate ${employee.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{employee.full_name || 'Sin nombre'}</p>
                                                    {employee.id === businessOwnerId && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                                                            Dueño
                                                        </span>
                                                    )}
                                                    {!employee.is_active && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                                                            Desactivado
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 truncate">
                                                        {employee.role || 'Sin rol'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {employee.id !== businessOwnerId && (
                                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 w-full sm:w-[200px] sm:border-t-0 sm:pt-0 sm:ml-4 sm:flex-shrink-0">
                                                <button
                                                    onClick={() => handleEditEmployee(employee)}
                                                    className="w-full h-9 flex items-center justify-center rounded-lg text-xs font-bold text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleOpenEmployeePermissions(employee)}
                                                    className="w-full h-9 flex items-center justify-center rounded-lg text-xs font-bold text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 transition-colors"
                                                >
                                                    Permisos
                                                </button>
                                                {employee.id !== profile?.id && (
                                                    <>
                                                        <button
                                                            onClick={() => handleToggleEmployeeStatus(employee)}
                                                            className={`w-full h-9 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${employee.is_active
                                                                ? 'text-gray-600 bg-gray-100 hover:text-orange-700 hover:bg-orange-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-orange-900/20 dark:hover:text-orange-400'
                                                                : 'text-gray-600 bg-gray-100 hover:text-green-700 hover:bg-green-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-green-900/20 dark:hover:text-green-400'
                                                                }`}
                                                        >
                                                            {employee.is_active ? 'Pausar' : 'Activar'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteEmployee(employee)}
                                                            className="w-full h-9 flex items-center justify-center rounded-lg text-xs font-bold transition-colors text-white bg-red-600 hover:bg-red-700 dark:bg-red-900/80 dark:hover:bg-red-800"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {employees.length === 0 && (
                                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-500">
                                        <span className="material-symbols-outlined text-4xl mb-2 block">group_off</span>
                                        No hay empleados registrados
                                    </div>
                                )}
                            </div>

                            {/* Desktop Table Layout */}
                            <div className="hidden xl:block bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400 font-bold tracking-wider">
                                            <th className="px-6 py-4">Empleado</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                        {employees.map((employee, index) => (
                                            <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`size-10 rounded-full flex items-center justify-center font-bold text-sm ${getAvatarColor(index)}`}>
                                                            {employee.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '??'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className={`font-bold text-sm ${employee.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{employee.full_name || 'Sin nombre'}</p>
                                                                {employee.id === businessOwnerId && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                                        Dueño
                                                                    </span>
                                                                )}
                                                                {!employee.is_active && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                                                        Desactivado
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                                                    {employee.role || 'Sin rol'}
                                                                </span>
                                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[14px]">call</span>
                                                                    {employee.phone || 'Sin teléfono'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {employee.id !== businessOwnerId && (
                                                        <div className="grid grid-cols-2 gap-2 w-[180px] ml-auto transition-opacity">
                                                            <button
                                                                onClick={() => handleEditEmployee(employee)}
                                                                className="w-full px-2 h-8 flex items-center justify-center rounded-lg text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
                                                            >
                                                                Editar
                                                            </button>
                                                            <button
                                                                onClick={() => handleOpenEmployeePermissions(employee)}
                                                                className="w-full px-2 h-8 flex items-center justify-center rounded-lg text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 transition-colors"
                                                            >
                                                                Permisos
                                                            </button>
                                                            {employee.id !== profile?.id && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleToggleEmployeeStatus(employee)}
                                                                        className={`w-full px-2 h-8 flex items-center justify-center rounded-lg text-[11px] font-bold transition-colors ${employee.is_active
                                                                            ? 'text-gray-600 bg-gray-100 hover:text-orange-700 hover:bg-orange-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-orange-900/20 dark:hover:text-orange-400'
                                                                            : 'text-gray-600 bg-gray-100 hover:text-green-700 hover:bg-green-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-green-900/20 dark:hover:text-green-400'
                                                                            }`}
                                                                    >
                                                                        {employee.is_active ? 'Pausar' : 'Activar'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteEmployee(employee)}
                                                                        className="w-full px-2 h-8 flex items-center justify-center rounded-lg text-[11px] font-bold transition-colors text-white bg-red-600 hover:bg-red-700 dark:bg-red-900/80 dark:hover:bg-red-800"
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {employees.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-12 text-center text-gray-500">
                                                    <span className="material-symbols-outlined text-4xl mb-2 block">group_off</span>
                                                    No hay empleados registrados
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                ) : (
                    /* --- ROLES & PERMISSIONS VIEW --- */
                    <div className="max-w-7xl mx-auto animate-[fadeIn_0.3s_ease-out]">

                        {/* Mobile Permissions Sidebar Overlay */}
                        {showPermissionsSidebar && selectedRole && (
                            <div className="lg:hidden fixed inset-0 z-[60] flex justify-end">
                                {/* Backdrop */}
                                <div
                                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                                    onClick={() => setShowPermissionsSidebar(false)}
                                />
                                {/* Sidebar Panel */}
                                <div className="relative w-full max-w-sm h-full bg-surface-light dark:bg-surface-dark flex flex-col shadow-2xl animate-[slideInRight_0.3s_ease-out]">
                                    {/* Sidebar Header */}
                                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-3">
                                        <button
                                            onClick={() => setShowPermissionsSidebar(false)}
                                            className="size-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <span className="material-symbols-outlined">arrow_back</span>
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 dark:text-white text-base truncate">{selectedRole.name}</h3>
                                            <p className="text-xs text-gray-500">Configura los permisos de este rol</p>
                                        </div>
                                        <button
                                            onClick={handleSavePermissions}
                                            disabled={savingRole}
                                            className="bg-primary hover:bg-primary-hover text-[#102218] px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                        >
                                            {savingRole ? <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> : <span className="material-symbols-outlined text-lg">save</span>}
                                            Guardar
                                        </button>
                                    </div>
                                    {/* Sidebar Permissions */}
                                    <div className="flex-1 overflow-y-auto p-5 pb-12 space-y-6 custom-scrollbar safe-area-inset-bottom">
                                        {PERMISSION_GROUPS.map((group, idx) => (
                                            <div key={group.category}>
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                                                    {group.category}
                                                </h4>
                                                <div className="space-y-2">
                                                    {group.items.map((perm) => (
                                                        <div
                                                            key={perm.id}
                                                            onClick={() => togglePermission(perm.id)}
                                                            className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer active:scale-[0.99]"
                                                        >
                                                            <div className="pt-0.5 shrink-0">
                                                                <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${getEffectivePerm(editingPermissions, perm.id) ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'}`}>
                                                                    {getEffectivePerm(editingPermissions, perm.id) && (
                                                                        <span className="material-symbols-outlined text-[#102218] text-sm">check</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{perm.label}</p>
                                                                    {isInheritedPerm(editingPermissions, perm.id) && (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{AUTO_BADGE_LABEL}</span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{isInheritedPerm(editingPermissions, perm.id) ? AUTO_HELP_TEXT : perm.desc}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Desktop: two columns / Mobile: only role list */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

                            {/* Left Column: Role Selector */}
                            <div className="lg:col-span-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Roles del Sistema</h2>
                                    <button
                                        onClick={() => setShowNewRoleForm(true)}
                                        className="bg-primary hover:bg-primary-hover text-[#102218] text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-lg shadow-md transition-all active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span> Nuevo
                                    </button>
                                </div>

                                {/* New Role Form */}
                                {showNewRoleForm && (
                                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-primary/50 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                                        <form onSubmit={handleCreateRole} className="p-4 space-y-3">
                                            <input
                                                type="text"
                                                value={newRoleName}
                                                onChange={(e) => setNewRoleName(e.target.value)}
                                                placeholder="Nombre del rol"
                                                className="w-full h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                                autoFocus
                                            />
                                            <input
                                                type="text"
                                                value={newRoleDescription}
                                                onChange={(e) => setNewRoleDescription(e.target.value)}
                                                placeholder="Descripción (opcional)"
                                                className="w-full h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    type="submit"
                                                    disabled={savingRole}
                                                    className="flex-1 h-9 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg font-bold text-sm transition-all disabled:opacity-50"
                                                >
                                                    Crear
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowNewRoleForm(false); setNewRoleName(''); setNewRoleDescription(''); }}
                                                    className="h-9 px-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-bold text-sm transition-all"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                                        {roles.map((role) => (
                                            <button
                                                key={role.id}
                                                onClick={() => {
                                                    setSelectedRoleId(role.id);
                                                    setShowPermissionsSidebar(true);
                                                }}
                                                className={`w-full text-left p-4 transition-colors flex items-center justify-between group ${selectedRoleId === role.id ? 'bg-blue-50/80 dark:bg-blue-900/20 border-l-4 border-primary' : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-l-4 border-transparent'}`}
                                            >
                                                <div>
                                                    <h4 className={`font-semibold text-sm ${selectedRoleId === role.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
                                                        {role.name}
                                                        {role.is_system_role && (
                                                            <span className="ml-2 text-xs text-gray-400 font-normal">(Sistema)</span>
                                                        )}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 mt-0.5">{role.description || 'Sin descripción'}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{role.employee_count || 0}</span>
                                                    {!role.is_system_role && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                                                            className="size-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">delete</span>
                                                        </button>
                                                    )}
                                                    <span className="material-symbols-outlined text-gray-400 text-lg">chevron_right</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Permissions Editor - Desktop only */}
                            <div className="hidden lg:block lg:col-span-8 space-y-4">
                                {selectedRole && (
                                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                                        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 sticky top-0 z-10">
                                            <div className="flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-lg">
                                                        <span className="material-symbols-outlined text-gray-500 text-xl">lock_person</span>
                                                        <span className="truncate">Permisos: {selectedRole.name}</span>
                                                    </h3>
                                                    <p className="text-xs text-gray-500 mt-1">Configura qué puede hacer este rol.</p>
                                                </div>
                                                <button
                                                    onClick={handleSavePermissions}
                                                    disabled={savingRole}
                                                    className="bg-primary hover:bg-primary-hover text-[#102218] px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                                                >
                                                    {savingRole && <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>}
                                                    Guardar
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-6 space-y-6">
                                            {PERMISSION_GROUPS.map((group, idx) => (
                                                <div key={group.category}>
                                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                                                        {group.category}
                                                    </h4>
                                                    <div className="space-y-2">
                                                        {group.items.map((perm) => (
                                                            <div
                                                                key={perm.id}
                                                                onClick={() => togglePermission(perm.id)}
                                                                className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer active:scale-[0.99]"
                                                            >
                                                                <div className="pt-0.5 shrink-0">
                                                                    <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${getEffectivePerm(editingPermissions, perm.id) ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'}`}>
                                                                        {getEffectivePerm(editingPermissions, perm.id) && (
                                                                            <span className="material-symbols-outlined text-[#102218] text-sm">check</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{perm.label}</p>
                                                                        {isInheritedPerm(editingPermissions, perm.id) && (
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{AUTO_BADGE_LABEL}</span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{isInheritedPerm(editingPermissions, perm.id) ? AUTO_HELP_TEXT : perm.desc}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                )}
            </div>

            <UpgradeProModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                featureName="Usuarios y Personal Ilimitado"
                featureDescription="El Plan Estándar incluye hasta 3 usuarios. Actualiza al Plan Pro para crear empleados, cajeros, meseros y cocineros ilimitados con permisos personalizados."
                onUpgrade={() => onNavigate(Screen.SUBSCRIPTION_PLANS)}
            />
        </div>
    );
};
