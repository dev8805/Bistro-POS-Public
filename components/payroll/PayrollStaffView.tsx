import React, { useState } from 'react';
import { Employee, useEmployeesDirectory } from '../../hooks/useEmployeesDirectory';
import { formatCurrency } from '../../lib/formatters';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useToast } from '../../context/ToastContext';
import { EmployeeModal } from '../modals/EmployeeModal';
import { PayrollPaymentModal } from '../modals/PayrollPaymentModal';
import { EmployeeAdvancesListModal } from '../modals/EmployeeAdvancesListModal';

interface PayrollStaffViewProps {
    existingProfiles?: { id: string; full_name: string; role?: string }[];
}

export const PayrollStaffView: React.FC<PayrollStaffViewProps> = ({ existingProfiles = [] }) => {
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const {
        employees,
        loading,
        fetchEmployees,
        deleteEmployee,
    } = useEmployeesDirectory();

    const [searchTerm, setSearchTerm] = useState('');

    // Modales
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);

    const [selectedEmployeeForPayment, setSelectedEmployeeForPayment] = useState<Employee | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    const [selectedEmployeeForAdvances, setSelectedEmployeeForAdvances] = useState<Employee | null>(null);
    const [showAdvancesModal, setShowAdvancesModal] = useState(false);

    const filteredEmployees = employees.filter(emp =>
        emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.job_title && emp.job_title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.document_number && emp.document_number.includes(searchTerm))
    );

    // Totales estadísticos
    const totalActive = employees.length;

    const handleOpenPayment = (employee: Employee) => {
        setSelectedEmployeeForPayment(employee);
        setShowPaymentModal(true);
    };

    const handleOpenAdvancesHistory = (employee: Employee) => {
        setSelectedEmployeeForAdvances(employee);
        setShowAdvancesModal(true);
    };

    const handleEditEmployee = (employee: Employee) => {
        setEmployeeToEdit(employee);
        setShowEmployeeModal(true);
    };

    const handleDelete = async (employee: Employee) => {
        const confirmed = await confirmAction({
            title: '¿Desactivar colaborador?',
            message: `¿Deseas retirar a ${employee.full_name} del directorio activo? Sus registros de pago e historial se conservarán.`,
            confirmText: 'Desactivar',
            variant: 'danger'
        });

        if (!confirmed) return;
        try {
            await deleteEmployee(employee.id);
            showToast('Colaborador desactivado', 'success');
        } catch {
            showToast('Error al desactivar colaborador', 'error');
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header y Tarjetas de resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total personal */}
                <div className="p-5 rounded-3xl bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl">badge</span>
                    </div>
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            PERSONAL ACTIVO
                        </span>
                        <h4 className="text-xl font-black text-gray-900 dark:text-white">
                            {totalActive} {totalActive === 1 ? 'Colaborador' : 'Colaboradores'}
                        </h4>
                    </div>
                </div>

                {/* Botón nuevo colaborador */}
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => {
                            setEmployeeToEdit(null);
                            setShowEmployeeModal(true);
                        }}
                        className="w-full h-full min-h-[72px] p-4 rounded-3xl bg-primary hover:bg-primary-hover text-[#102218] font-black text-sm uppercase tracking-wider shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                        <span className="material-symbols-outlined text-2xl">person_add</span>
                        <span>+ Registrar Colaborador</span>
                    </button>
                </div>
            </div>

            {/* Barra de búsqueda */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nombre, cargo o cédula..."
                        className="w-full h-11 pl-10 pr-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-800 dark:text-white outline-none focus:border-primary shadow-sm"
                    />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                        search
                    </span>
                </div>

                <div className="text-xs text-gray-500 font-bold">
                    {filteredEmployees.length} {filteredEmployees.length === 1 ? 'colaborador listado' : 'colaboradores listados'}
                </div>
            </div>

            {/* Grid de Colaboradores */}
            {loading ? (
                <div className="py-20 text-center text-gray-400 text-xs font-bold">
                    Cargando directorio de personal...
                </div>
            ) : filteredEmployees.length === 0 ? (
                <div className="py-20 bg-white dark:bg-gray-800/40 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center p-8">
                    <div className="size-16 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                        <span className="material-symbols-outlined text-3xl">groups</span>
                    </div>
                    <h3 className="text-base font-extrabold text-gray-800 dark:text-white mb-1">
                        No hay colaboradores registrados
                    </h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                        Registra a tu equipo (lavaplatos, cocina, meseros) para llevar el control de turnos, nómina y vales sin exigirles cuenta de acceso.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setEmployeeToEdit(null);
                            setShowEmployeeModal(true);
                        }}
                        className="px-5 py-2.5 rounded-2xl bg-primary hover:bg-primary-hover text-[#102218] font-black text-xs uppercase tracking-wider shadow-sm inline-flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-base">person_add</span>
                        Crear Primer Colaborador
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredEmployees.map(employee => {
                        const hasPendingAdvances = (employee.pending_advances_total || 0) > 0;
                        return (
                            <div
                                key={employee.id}
                                className="bg-white dark:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/70 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                            >
                                <div>
                                    {/* Header de la tarjeta */}
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="size-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-2xl">person</span>
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-black text-gray-900 dark:text-white truncate">
                                                    {employee.full_name}
                                                </h4>
                                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 mt-0.5">
                                                    {employee.job_title || 'General'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleEditEmployee(employee)}
                                                className="size-8 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                                                title="Editar datos"
                                                aria-label="Editar"
                                            >
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(employee)}
                                                className="size-8 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors"
                                                title="Desactivar"
                                                aria-label="Desactivar"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Info básica: Solo se muestra si tiene al menos un dato */}
                                    {(employee.document_number || employee.phone || (employee.base_rate && employee.base_rate > 0)) ? (
                                        <div className="text-xs space-y-1 text-gray-500 dark:text-gray-400 mb-4 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-2xl">
                                            {employee.document_number && (
                                                <div className="flex justify-between">
                                                    <span className="font-bold">Doc:</span>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                        {employee.document_type || 'CC'} {employee.document_number}
                                                    </span>
                                                </div>
                                            )}
                                            {employee.phone && (
                                                <div className="flex justify-between">
                                                    <span className="font-bold">Tel:</span>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200">{employee.phone}</span>
                                                </div>
                                            )}
                                            {employee.base_rate && employee.base_rate > 0 ? (
                                                <div className="flex justify-between">
                                                    <span className="font-bold">Tarifa turno:</span>
                                                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                                                        ${formatCurrency(employee.base_rate)} COP
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>

                                {/* Botones de acción rápida */}
                                <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPayment(employee)}
                                        className="w-full h-10 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
                                    >
                                        <span className="material-symbols-outlined text-base">payments</span>
                                        <span>Registrar Pago</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleOpenAdvancesHistory(employee)}
                                        className="w-full h-9 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
                                    >
                                        <span className="material-symbols-outlined text-base">history</span>
                                        <span>Historial de Pagos</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal para Crear / Editar Colaborador */}
            <EmployeeModal
                isOpen={showEmployeeModal}
                onClose={() => setShowEmployeeModal(false)}
                employeeToEdit={employeeToEdit}
                onSuccess={fetchEmployees}
                existingProfiles={existingProfiles}
            />

            {/* Modal para Registrar Pago */}
            <PayrollPaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                employee={selectedEmployeeForPayment}
                onSuccess={fetchEmployees}
            />

            {/* Modal Historial de Vales */}
            <EmployeeAdvancesListModal
                isOpen={showAdvancesModal}
                onClose={() => setShowAdvancesModal(false)}
                employee={selectedEmployeeForAdvances}
                onOpenPaymentModal={handleOpenPayment}
            />
        </div>
    );
};
