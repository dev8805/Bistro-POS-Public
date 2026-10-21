import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Employee, useEmployeesDirectory } from '../../hooks/useEmployeesDirectory';
import { useToast } from '../../context/ToastContext';
import { EmployeeRoleDropdown } from '../payroll/EmployeeRoleDropdown';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeToEdit?: Employee | null;
    onSuccess?: (employee?: Employee) => void;
    existingProfiles?: { id: string; full_name: string; role?: string }[];
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
    isOpen,
    onClose,
    employeeToEdit,
    onSuccess,
    existingProfiles = [],
}) => {
    const { showToast } = useToast();
    const { createEmployee, updateEmployee } = useEmployeesDirectory();

    const [fullName, setFullName] = useState('');
    const [documentType, setDocumentType] = useState('CC');
    const [documentNumber, setDocumentNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [profileId, setProfileId] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (employeeToEdit) {
                setFullName(employeeToEdit.full_name || '');
                setDocumentType(employeeToEdit.document_type || 'CC');
                setDocumentNumber(employeeToEdit.document_number || '');
                setPhone(employeeToEdit.phone || '');
                setJobTitle(employeeToEdit.job_title || '');
                setProfileId(employeeToEdit.profile_id || '');
                setNotes(employeeToEdit.notes || '');
            } else {
                setFullName('');
                setDocumentType('CC');
                setDocumentNumber('');
                setPhone('');
                setJobTitle('');
                setProfileId('');
                setNotes('');
            }
        }
    }, [isOpen, employeeToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName.trim()) {
            showToast('El nombre del colaborador es obligatorio', 'error');
            return;
        }
        if (!jobTitle.trim()) {
            showToast('Selecciona o crea un cargo o función para el colaborador', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload: Partial<Employee> = {
                full_name: fullName.trim(),
                document_type: documentType,
                document_number: documentNumber.trim() || undefined,
                phone: phone.trim() || undefined,
                job_title: jobTitle.trim(),
                profile_id: profileId ? profileId : null,
                notes: notes.trim() || undefined,
            };

            let savedEmployee: Employee | undefined = undefined;
            if (employeeToEdit) {
                await updateEmployee(employeeToEdit.id, payload);
                savedEmployee = { ...employeeToEdit, ...payload } as Employee;
                showToast('Colaborador actualizado', 'success');
            } else {
                const created = await createEmployee(payload);
                savedEmployee = created as Employee;
                showToast('Colaborador registrado con éxito', 'success');
            }

            if (onSuccess) onSuccess(savedEmployee);
            onClose();
        } catch (err: any) {
            showToast(err.message || 'Error al guardar colaborador', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl">person_add</span>
                        </div>
                        <div>
                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                                {employeeToEdit ? 'Editar Colaborador' : 'Nuevo Colaborador'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Sin necesidad de cuenta de inicio de sesión
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        aria-label="Cerrar"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
                    {/* Nombre */}
                    <div>
                        <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                            NOMBRE COMPLETO <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            placeholder="Ej: Carlos Gómez"
                            className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-primary"
                        />
                    </div>

                    {/* Cargo / Función con creación en BD y placeholder Elegir */}
                    <div>
                        <EmployeeRoleDropdown
                            selectedRole={jobTitle}
                            onSelectRole={setJobTitle}
                            placeholder="Elegir"
                            required
                        />
                    </div>

                    {/* Documento */}
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                TIPO DOC
                            </label>
                            <select
                                value={documentType}
                                onChange={e => setDocumentType(e.target.value)}
                                className="w-full h-11 px-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-800 dark:text-white outline-none"
                            >
                                <option value="CC">C.C.</option>
                                <option value="CE">C.E.</option>
                                <option value="TI">T.I.</option>
                                <option value="PPT">PPT</option>
                                <option value="PAS">Pasaporte</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                NÚMERO (OPCIONAL)
                            </label>
                            <input
                                type="text"
                                value={documentNumber}
                                onChange={e => setDocumentNumber(e.target.value)}
                                placeholder="1020304050"
                                className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-800 dark:text-white outline-none"
                            />
                        </div>
                    </div>

                    {/* Teléfono */}
                    <div>
                        <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                            TELÉFONO (OPCIONAL)
                        </label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="3001234567"
                            className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-800 dark:text-white outline-none"
                        />
                    </div>

                    {/* Vinculación opcional con Usuario POS si existe */}
                    {existingProfiles.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                VINCULAR CON USUARIO DEL POS (OPCIONAL)
                            </label>
                            <select
                                value={profileId}
                                onChange={e => setProfileId(e.target.value)}
                                className="w-full h-11 px-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-800 dark:text-white outline-none"
                            >
                                <option value="">Sin usuario de acceso al sistema</option>
                                {existingProfiles.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.full_name} ({p.role || 'Usuario'})
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">
                                Solo si este colaborador ya tiene una cuenta con la que inicia sesión en la tablet.
                            </p>
                        </div>
                    )}

                    {/* Notas */}
                    <div>
                        <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                            NOTAS / OBSERVACIONES
                        </label>
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Ej: Fines de semana, turno nocturno, etc."
                            className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-800 dark:text-white outline-none"
                        />
                    </div>

                    {/* Submit Button - Habilitado cuando estén elegidos el nombre y el cargo como mínimo */}
                    <div className="pt-3">
                        <button
                            type="submit"
                            disabled={isSubmitting || !fullName.trim() || !jobTitle.trim()}
                            className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-gray-950 dark:text-gray-950 font-black text-sm uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-lg text-gray-950 dark:text-gray-950">save</span>
                            <span>{isSubmitting ? 'Guardando...' : employeeToEdit ? 'Actualizar Colaborador' : 'Registrar Colaborador'}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
