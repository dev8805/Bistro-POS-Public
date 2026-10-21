import React, { useState, useMemo } from 'react';
import { useClients, Client } from '../hooks/useClients';
import { CreateClientModal, ClientData } from './CreateClientModal';

interface DeliveryClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectClient: (client: Client) => void;
    selectedClient?: Client | null;
    onRemoveClient?: () => void;
}

export const DeliveryClientModal: React.FC<DeliveryClientModalProps> = ({
    isOpen,
    onClose,
    onSelectClient,
    selectedClient,
    onRemoveClient
}) => {
    const { clients, loading, createClient } = useClients();
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);

    const filteredClients = useMemo(() => {
        if (!searchQuery.trim()) return clients;
        const query = searchQuery.toLowerCase();
        return clients.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.phone?.includes(query) ||
            c.id_number?.toLowerCase().includes(query)
        );
    }, [clients, searchQuery]);

    const handleCreateClient = async (data: ClientData) => {
        try {
            const created = await createClient({
                name: data.name.trim(),
                phone: data.phone.trim(),
                address: data.address.trim()
            });
            if (created) {
                onSelectClient(created);
                handleClose();
            }
        } catch (err) {
            console.error('Error creating client:', err);
        }
    };

    const handleClose = () => {
        setSearchQuery('');
        setShowCreateForm(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-surface-light dark:bg-surface-dark rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl relative">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-text-main dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">person_search</span>
                            Seleccionar Cliente
                        </h2>
                        <button
                            onClick={handleClose}
                            className="size-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {selectedClient && onRemoveClient ? (
                        <div className="w-full h-12 px-4 bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-xl flex items-center justify-between animate-[fadeIn_0.2s_ease-out]">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="size-6 bg-primary rounded-full flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[#102218] text-[16px]">person</span>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-medium text-primary-dark dark:text-primary-light uppercase tracking-wide leading-none mb-0.5">Cliente Seleccionado</span>
                                    <span className="text-sm font-bold text-text-main dark:text-white truncate leading-none">{selectedClient.name}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => onRemoveClient()}
                                className="size-8 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center"
                                title="Desasignar cliente"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                search
                            </span>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, teléfono o documento..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-text-main dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full size-8 border-b-2 border-primary"></div>
                        </div>
                    ) : filteredClients.length > 0 ? (
                        <div className="space-y-2">
                            {filteredClients.map((client) => (
                                <button
                                    key={client.id}
                                    onClick={() => {
                                        onSelectClient(client);
                                        handleClose();
                                    }}
                                    className="w-full p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-primary dark:hover:border-primary hover:shadow-md transition-all text-left group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-primary">person</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-text-main dark:text-white truncate">
                                                {client.name}
                                            </h4>
                                            {client.phone && (
                                                <p className="text-sm text-text-secondary flex items-center gap-1 mt-0.5">
                                                    <span className="material-symbols-outlined text-sm">call</span>
                                                    {client.phone}
                                                </p>
                                            )}
                                            {client.address && (
                                                <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                                                    <span className="material-symbols-outlined text-xs align-middle mr-1">location_on</span>
                                                    {client.address}
                                                </p>
                                            )}
                                        </div>
                                        <span className="material-symbols-outlined text-gray-300 group-hover:text-primary transition-colors">
                                            chevron_right
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                            <span className="material-symbols-outlined text-5xl mb-3 opacity-30">person_off</span>
                            <p className="font-medium">No se encontraron clientes</p>
                            <p className="text-sm opacity-70 mt-1">Crea uno nuevo para continuar</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="w-full h-12 bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="material-symbols-outlined">person_add</span>
                        Crear Cliente Nuevo
                    </button>
                </div>
            </div>

            {/* Create Client Modal Overlay */}
            {showCreateForm && (
                <CreateClientModal
                    onClose={() => setShowCreateForm(false)}
                    onSave={handleCreateClient}
                />
            )}
        </div>
    );
};
