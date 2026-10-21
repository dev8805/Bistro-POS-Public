import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClients, Client } from '../../hooks/useClients';
import { useDebts } from '../../hooks/useDebts';
import { useCashRegister } from '../../hooks/useCashRegister';
import { useBusinessSettings } from '../../hooks/useBusinessSettings';
import { formatCurrency } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { AppButton } from '../ui/AppButton';
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';

interface QuickTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'client' | 'supplier';
}

const formatWithThousands = (value: string): string => {
    const clean = value.replace(/[^0-9]/g, '');
    if (!clean) return '';
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const parseCleanNumber = (formatted: string): string => {
    return formatted.replace(/[^0-9]/g, '');
};

export default function QuickTransactionModal({ isOpen, onClose, type }: QuickTransactionModalProps) {
    const { clients, addPayment: addClientPayment } = useClients();
    const { activeDebts, addCreditorPayment } = useDebts();
    const { addCashIn, recordPurchase, activeShift, loading: shiftLoading } = useCashRegister();
    const { paymentMethods } = useBusinessSettings();
    const { showToast } = useToast();

    const evidenceUpload = useImageUpload(null, 'debt-evidence');

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const amountInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens or type changes
    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setSelectedEntity(null);
            setAmount('');
            setNote('');
            setLoading(false);
            setSelectedPaymentMethod('');
            setHighlightedIndex(0);
        }
    }, [isOpen, type]);

    // Reiniciar el índice resaltado cuando cambia la búsqueda
    useEffect(() => {
        setHighlightedIndex(0);
    }, [searchTerm]);

    // Derive creditors list: deudas activas + suppliers del caché como fallback offline
    const creditors = useMemo(() => {
        const uniqueCreditors = new Map<string, number>();

        // 1. Poblar desde deudas activas (con saldo pendiente)
        activeDebts.forEach(debt => {
            const current = uniqueCreditors.get(debt.creditor_name) || 0;
            uniqueCreditors.set(debt.creditor_name, current + (debt.total_amount - debt.paid_amount));
        });

        // 2. Fallback offline: incluir suppliers del caché localStorage aunque no tengan deuda activa en memoria
        if (!navigator.onLine) {
            try {
                const allKeys = Object.keys(localStorage);
                const supplierKey = allKeys.find(k => k.startsWith('bistro_suppliers_'));
                if (supplierKey) {
                    const cached = JSON.parse(localStorage.getItem(supplierKey) || '[]');
                    cached.forEach((s: { name: string }) => {
                        if (!uniqueCreditors.has(s.name)) {
                            uniqueCreditors.set(s.name, 0);
                        }
                    });
                }
            } catch { }
        }

        return Array.from(uniqueCreditors.entries()).map(([name, totalDebt]) => ({
            id: name,
            name,
            current_debt: totalDebt
        }));
    }, [activeDebts]);

    // Filter results based on search
    const filteredResults = useMemo(() => {
        const term = searchTerm.toLowerCase();
        if (type === 'client') {
            return clients
                .filter(c =>
                    c.name.toLowerCase().includes(term) ||
                    c.phone?.includes(term) ||
                    c.id_number?.includes(term)
                )
                .slice(0, 5); // Limit to 5 results
        } else {
            return creditors
                .filter(c => c.name.toLowerCase().includes(term))
                .slice(0, 5);
        }
    }, [type, clients, creditors, searchTerm]);

    const handleSelect = (entity: any) => {
        setSelectedEntity(entity);
        setSearchTerm(''); // Clear search to show selection clearly
        // Auto-focus al campo de monto justo después de seleccionar
        setTimeout(() => amountInputRef.current?.focus(), 50);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!searchTerm || filteredResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(i => Math.min(i + 1, filteredResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = filteredResults[highlightedIndex];
            if (item) handleSelect(item);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEntity) return;

        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) {
            showToast('El monto debe ser mayor a 0', 'error');
            return;
        }

        if (selectedEntity.current_debt > 0 && val > selectedEntity.current_debt) {
            showToast('El abono no puede ser mayor a la deuda', 'error');
            return;
        }

        setLoading(true);
        try {
            if (type === 'client') {
                const methodMap: Record<string, string> = {
                    'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                    'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                };
                const dbMethod = methodMap[selectedPaymentMethod] || selectedPaymentMethod.toLowerCase() || 'cash';
                await addClientPayment(selectedEntity.id, val, note, dbMethod, activeShift?.id || undefined);
                if (navigator.onLine && activeShift) {
                    await addCashIn(val, `Abono de: ${selectedEntity.name}${note ? ' · ' + note : ''}`, dbMethod);
                }
                showToast('Abono registrado correctamente', 'success');
            } else {
                await addCreditorPayment(selectedEntity.name, val, selectedPaymentMethod || undefined, note, activeShift?.id || undefined, evidenceUpload.imageUrl);
                evidenceUpload.markAsSaved();
                evidenceUpload.resetImage();
                showToast('Abono a proveedor registrado correctamente', 'success');
                if (navigator.onLine && activeShift) {
                    const methodMap: Record<string, string> = {
                        'efectivo': 'cash', 'cash': 'cash',
                        'tarjeta': 'card', 'card': 'card',
                        'nequi': 'nequi',
                        'daviplata': 'daviplata',
                        'transferencia': 'transfer', 'transfer': 'transfer',
                        'otro': 'other', 'other': 'other',
                    };
                    const cleanMethod = (selectedPaymentMethod || '').toLowerCase().trim();
                    const dbMethod = methodMap[cleanMethod] || (cleanMethod || 'cash');
                    if (dbMethod === 'cash') {
                        await recordPurchase(val, `Abono proveedor: ${selectedEntity.name}${note ? ' · ' + note : ''}`, 'cash');
                    }
                }
            }
            onClose();
        } catch (error: any) {
            console.error(error);
            showToast(error.message || 'Error al registrar el abono', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const title = type === 'client' ? 'Registrar Abono de Cliente' : 'Registrar Abono a Proveedor';
    const placeholder = type === 'client' ? 'Buscar cliente...' : 'Buscar proveedor...';

    return createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end md:items-center md:justify-center md:p-4">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] md:bg-black/60" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>

            {/* Panel: sidebar derecho en móvil, modal centrado en desktop */}
            <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark shadow-2xl flex flex-col max-md:h-full max-md:animate-[slideInRight_0.3s_ease-out] max-md:border-l max-md:border-gray-200 max-md:dark:border-gray-800 md:max-h-[88vh] md:rounded-2xl md:border md:border-gray-200 dark:md:border-gray-800 md:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] md:animate-modalIn md:origin-center">

                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-surface-dark shrink-0 md:rounded-t-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined text-[19px]">{type === 'client' ? 'person' : 'local_shipping'}</span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[15px] font-semibold text-text-main dark:text-white leading-tight truncate">
                                {title}
                            </h3>
                            <p className="text-[11px] text-text-secondary dark:text-gray-400 mt-0.5">
                                Completa la información del abono
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-8 rounded-lg text-text-secondary hover:text-text-main dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center shrink-0 outline-none focus:outline-none"
                        title="Cerrar modal"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-5">

                        {!activeShift && !shiftLoading && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                                <svg className="size-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    {type === 'client'
                                        ? <>Sin turno activo — el abono quedará registrado en la deuda del cliente pero <strong>no entrará a la caja</strong>. Abre un turno antes de abonar si necesitas cuadrar el efectivo.</>
                                        : <>Sin turno activo — el abono quedará en la deuda pero <strong>no generará egreso de caja</strong>. Abre un turno antes de abonar para mantener el cuadre.</>}
                                </p>
                            </div>
                        )}

                        {/* Entity Search/Selection */}
                        {!selectedEntity ? (
                            <div className="animate-fadeIn">
                                <label className="block text-xs font-bold text-text-secondary dark:text-gray-400 uppercase tracking-wide mb-2">
                                    {type === 'client' ? 'Seleccionar Cliente' : 'Seleccionar Proveedor'}
                                </label>
                                <div className="relative group z-20">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <span className="material-symbols-outlined text-gray-400 group-focus-within:text-primary transition-colors text-[20px]">search</span>
                                    </div>
                                    <input
                                        type="text"
                                        className="block w-full pl-11 pr-4 h-11 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-text-main dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
                                        placeholder={placeholder}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={handleSearchKeyDown}
                                        autoFocus
                                    />

                                    {/* Results List */}
                                    {searchTerm && (
                                        <ul className="absolute top-[calc(100%+6px)] left-0 right-0 max-h-56 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 animate-fadeIn divide-y divide-gray-100 dark:divide-gray-700">
                                            {filteredResults.length > 0 ? (
                                                filteredResults.map((item, idx) => (
                                                    <li
                                                        key={item.id}
                                                        className={`cursor-pointer px-4 py-3 transition-colors flex items-center gap-3 ${highlightedIndex === idx ? 'bg-primary/10 dark:bg-primary/15' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                                        onClick={() => handleSelect(item)}
                                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                                    >
                                                        <div className="size-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-text-secondary shrink-0">
                                                            <span className="material-symbols-outlined text-[18px]">
                                                                {type === 'client' ? 'person' : 'storefront'}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-center mb-0.5">
                                                                <span className="font-bold text-sm text-text-main dark:text-white truncate pr-2">{item.name}</span>
                                                                <span className="font-black text-sm text-status-error whitespace-nowrap">
                                                                    {formatCurrency(item.current_debt)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[11px] text-text-secondary dark:text-gray-400 uppercase font-medium">
                                                                    {type === 'client' ? 'Cliente' : 'Proveedor'}
                                                                </span>
                                                                <span className="text-[10px] text-text-secondary dark:text-gray-400 font-medium bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Deuda Actual</span>
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))
                                            ) : (
                                                <li className="py-8 px-4 text-center">
                                                    <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">search_off</span>
                                                    <p className="text-sm font-medium text-text-secondary dark:text-gray-400">No se encontraron resultados</p>
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-xl flex justify-between items-center shadow-sm animate-fadeIn">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="bg-blue-100 dark:bg-blue-900/40 size-10 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                                        <span className="material-symbols-outlined text-[20px]">
                                            check_circle
                                        </span>
                                    </div>
                                    <div className="min-w-0 overflow-hidden">
                                        <p className="font-bold text-sm text-blue-900 dark:text-blue-100 leading-snug truncate">{selectedEntity.name}</p>
                                        <p className="text-xs text-blue-600/80 dark:text-blue-300/80 mt-0.5 font-medium flex items-center gap-1">
                                            <span>Deuda total:</span>
                                            <span className="text-status-error font-bold">{formatCurrency(selectedEntity.current_debt)}</span>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedEntity(null)}
                                    className="ml-3 shrink-0 h-8 px-3 text-[11px] uppercase tracking-wider font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-white dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-100 flex items-center shadow-sm"
                                >
                                    Cambiar
                                </button>
                            </div>
                        )}

                        <div className="h-px w-full bg-border-light dark:bg-border-dark hidden"></div>

                        {/* Amount Input */}
                        <div className={`transition-opacity duration-300 ${!selectedEntity ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                            <label className="block text-[11px] font-bold text-text-secondary dark:text-gray-400 mb-2 uppercase tracking-wider">
                                Monto a Abonar
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <span className="text-gray-400 font-black text-xl group-focus-within:text-status-success transition-colors">$</span>
                                </div>
                                <input
                                    ref={amountInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={formatWithThousands(amount)}
                                    onChange={(e) => setAmount(parseCleanNumber(e.target.value))}
                                    className="block w-full pl-10 pr-14 h-12 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-xl font-bold text-text-main dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-0 focus:border-gray-400 dark:focus:border-gray-500 transition-colors disabled:bg-gray-50"
                                    placeholder="0"
                                    disabled={!selectedEntity}
                                />
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                    <span className="text-gray-400 font-bold text-xs uppercase px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">COP</span>
                                </div>
                            </div>
                        </div>

                        {/* Payment Methods — skeleton mientras carga para evitar el salto de layout */}
                        {(shiftLoading || activeShift) && (
                            <div className={`transition-opacity duration-300 ${!selectedEntity ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                                <label className="block text-[11px] font-bold text-text-secondary dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    Medio de Pago
                                </label>
                                {shiftLoading ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {Array.from({ length: paymentMethods.length || 5 }).map((_, i) => (
                                            <div key={i} className="h-10 rounded-xl skeleton-shimmer" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                                        {paymentMethods.map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setSelectedPaymentMethod(m)}
                                                className={`h-10 px-2 rounded-xl border text-[11px] sm:text-xs font-bold transition-all truncate flex items-center justify-center ${selectedPaymentMethod === m
                                                    ? 'border-[#009459] bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-text-secondary hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Note Input */}
                        <div className={`transition-opacity duration-300 ${!selectedEntity ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                            <label className="block text-[11px] font-bold text-text-secondary dark:text-gray-400 mb-2 uppercase tracking-wider">
                                Nota (Opcional)
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={2}
                                className="block w-full px-4 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-text-main dark:text-white placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-400 dark:focus:border-gray-500 transition-colors resize-none"
                                placeholder="Escribe detalles adicionales..."
                                disabled={!selectedEntity}
                            />
                        </div>

                        {type === 'supplier' && (
                            <EvidenceUploader compact
                                previewUrl={evidenceUpload.previewUrl}
                                uploading={evidenceUpload.uploading}
                                statusText={evidenceUpload.statusText}
                                showCropper={evidenceUpload.showCropper}
                                cropperImageSrc={evidenceUpload.cropperImageSrc}
                                onCropComplete={evidenceUpload.onCropComplete}
                                onCropCancel={evidenceUpload.onCropCancel}
                                showInAppCamera={evidenceUpload.showInAppCamera}
                                onCameraCapture={evidenceUpload.onCameraCapture}
                                onCameraClose={evidenceUpload.onCameraClose}
                                triggerCamera={evidenceUpload.triggerCamera}
                                triggerGallery={evidenceUpload.triggerGallery}
                                deleteImage={evidenceUpload.deleteImage}
                            />
                        )}

                    </div>

                    {/* Footer */}
                    <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 flex-row-reverse bg-white dark:bg-surface-dark shrink-0 md:rounded-b-2xl">
                        <AppButton
                            type="submit"
                            disabled={!selectedEntity || !amount || (activeShift ? !selectedPaymentMethod : false)}
                            isLoading={loading}
                            variant="primary"
                            className="flex-1 h-11 text-sm"
                        >
                            Registrar Abono
                        </AppButton>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-11 px-5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800 text-text-main dark:text-gray-300 font-semibold text-sm transition-colors outline-none focus:outline-none"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}

