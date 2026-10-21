import React, { useState } from 'react';
import { AppButton } from './ui/AppButton';
import { PhoneInput } from './PhoneInput';

export interface ClientData {
    name: string;
    idNumber: string;
    phone: string;
    email: string;
    address: string;
}

interface CreateClientModalProps {
    onClose: () => void;
    onSave: (clientData: ClientData) => Promise<void> | void;
}

export const CreateClientModal: React.FC<CreateClientModalProps> = ({ onClose, onSave }) => {
    const [formData, setFormData] = useState<ClientData>({
        name: '',
        idNumber: '',
        phone: '',
        email: '',
        address: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (field: keyof ClientData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const hasPhone = formData.phone.replace(/\D/g, '').length > 3;
        if (formData.name && formData.idNumber && hasPhone && !isSubmitting) {
            setIsSubmitting(true);
            try {
                await onSave(formData);
                onClose();
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>
            <div className="relative w-full max-w-lg bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-surface-dark shrink-0">
                    <h2 className="text-lg font-extrabold text-text-main dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[24px] text-text-main dark:text-white">person_add</span>
                        Nuevo Cliente
                    </h2>
                    <button onClick={onClose} className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-text-secondary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-text-secondary uppercase mb-1.5 ml-1">Nombre Completo <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <span className="material-symbols-outlined text-[20px]">badge</span>
                                </span>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none font-medium text-text-main dark:text-white transition-all placeholder:text-gray-400"
                                    placeholder="Ej. Juan Pérez"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-1.5 ml-1">No. Identificación <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                        <span className="material-symbols-outlined text-[20px]">id_card</span>
                                    </span>
                                    <input
                                        type="text"
                                        required
                                        value={formData.idNumber}
                                        onChange={e => handleChange('idNumber', e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none font-medium text-text-main dark:text-white transition-all placeholder:text-gray-400"
                                        placeholder="Ej. 12345678"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-1.5 ml-1">Teléfono <span className="text-red-500">*</span></label>
                                <PhoneInput
                                    value={formData.phone}
                                    onChange={val => handleChange('phone', val)}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-text-secondary uppercase mb-1.5 ml-1">Correo Electrónico</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <span className="material-symbols-outlined text-[20px]">mail</span>
                                </span>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => handleChange('email', e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none font-medium text-text-main dark:text-white transition-all placeholder:text-gray-400"
                                    placeholder="Ej. cliente@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-text-secondary uppercase mb-1.5 ml-1">Dirección</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <span className="material-symbols-outlined text-[20px]">location_on</span>
                                </span>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={e => handleChange('address', e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none font-medium text-text-main dark:text-white transition-all placeholder:text-gray-400"
                                    placeholder="Ej. Calle 123 # 45 - 67"
                                />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-surface-light dark:bg-surface-dark shrink-0">
                    <AppButton
                        onClick={handleSubmit}
                        disabled={!formData.name || !formData.idNumber || formData.phone.replace(/\D/g, '').length <= 3}
                        isLoading={isSubmitting}
                        className="w-full h-12 text-base shadow-lg"
                    >
                        <span className="material-symbols-outlined">save</span>
                        Guardar Cliente
                    </AppButton>
                </div>

            </div>
        </div>
    );
};