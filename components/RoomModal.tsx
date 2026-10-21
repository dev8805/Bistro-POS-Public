import React, { useState, useEffect } from 'react';

interface RoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    initialName?: string;
    mode: 'create' | 'edit';
}

export const RoomModal: React.FC<RoomModalProps> = ({ isOpen, onClose, onSave, initialName = '', mode }) => {
    const [name, setName] = useState(initialName);

    useEffect(() => {
        setName(initialName);
    }, [initialName, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onSave(name.trim());
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[scaleIn_0.2s_ease-out]">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        {mode === 'create' ? 'Nueva Sala' : 'Editar Sala'}
                    </h2>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nombre de la Sala
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                placeholder="Ej. Terraza, Principal, VIP"
                                autoFocus
                                required
                            />
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!name.trim()}
                                className="px-5 py-2.5 rounded-xl font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Guardar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
