import React, { useState } from 'react';
import { CartItem } from '../types';
import { formatCurrency } from '../lib/formatters';

interface MobileScannerItemModalProps {
    item: CartItem;
    onSave: (newQuantity: number, discountValue: number, isPercent: boolean) => void;
    onClose: () => void;
}

export const MobileScannerItemModal: React.FC<MobileScannerItemModalProps> = ({
    item,
    onSave,
    onClose
}) => {
    const [qtyStr, setQtyStr] = useState(String(item.quantity) || '1');
    const isStandardPercent = item.discountPercent && [5, 10, 15, 20, 50].includes(item.discountPercent);
    const [discountPreset, setDiscountPreset] = useState<string>(
        isStandardPercent
            ? `${item.discountPercent}%`
            : item.discountPercent
                ? 'customPercent'
                : item.discount
                    ? 'custom'
                    : '0'
    );
    const [customDiscountStr, setCustomDiscountStr] = useState(
        item.discount ? String(item.discount) : ''
    );
    const [customPercentStr, setCustomPercentStr] = useState(
        item.discountPercent && !isStandardPercent ? String(item.discountPercent) : ''
    );

    // Focus principal ('qty', 'customDiscount' o 'customPercent') para el pad numérico
    const [activeField, setActiveField] = useState<'qty' | 'customDiscount' | 'customPercent'>('qty');
    const [isFirstKeypress, setIsFirstKeypress] = useState(true);

    const handleNumpadPress = (key: string) => {
        if (activeField === 'qty') {
            if (key === 'backspace') {
                setQtyStr(prev => prev.slice(0, -1));
                setIsFirstKeypress(false);
            } else if (key === ',') {
                setQtyStr(prev => {
                    if (prev.includes(',')) return prev;
                    if (isFirstKeypress || prev === '') return '0,';
                    return prev + ',';
                });
                setIsFirstKeypress(false);
            } else if (/^\d+$/.test(key)) {
                setQtyStr(prev => {
                    const isZeroKey = key === '00' ? '0' : key;
                    if (isFirstKeypress) return isZeroKey;
                    if (prev === '0') return isZeroKey;
                    return prev + key;
                });
                setIsFirstKeypress(false);
            }
        } else if (activeField === 'customDiscount') {
            if (key === 'backspace') {
                setCustomDiscountStr(prev => prev.slice(0, -1));
            } else if (/^\d+$/.test(key)) {
                setCustomDiscountStr(prev => {
                    if (prev === '0') return key === '00' ? '0' : key;
                    return prev + key;
                });
            }
        } else if (activeField === 'customPercent') {
            if (key === 'backspace') {
                setCustomPercentStr(prev => prev.slice(0, -1));
            } else if (key === ',') {
                setCustomPercentStr(prev => {
                    if (prev.includes(',')) return prev;
                    if (prev === '') return '0,';
                    return prev + ',';
                });
            } else if (/^\d+$/.test(key)) {
                setCustomPercentStr(prev => {
                    const next = prev === '0' ? key : prev + key;
                    const parsed = parseFloat(next.replace(',', '.'));
                    if (parsed > 100) return '100';
                    return next;
                });
            }
        }
    };

    const parsedQty = parseFloat(qtyStr.replace(',', '.')) || 0;
    const itemTotalGross = item.price * parsedQty;

    let currentDiscountAmt = 0;
    if (discountPreset.endsWith('%')) {
        const pct = parseFloat(discountPreset.replace('%', ''));
        currentDiscountAmt = (itemTotalGross * pct) / 100;
    } else if (discountPreset === 'customPercent') {
        const pct = Math.min(100, Math.max(0, parseFloat(customPercentStr.replace(',', '.')) || 0));
        currentDiscountAmt = (itemTotalGross * pct) / 100;
    } else if (discountPreset === 'custom') {
        currentDiscountAmt = parseFloat(customDiscountStr) || 0;
    }

    const finalTotal = Math.max(0, itemTotalGross - currentDiscountAmt);

    const handleSave = () => {
        if (parsedQty <= 0) return;

        let discountVal = 0;
        let isPct = false;

        if (discountPreset.endsWith('%')) {
            discountVal = parseFloat(discountPreset.replace('%', ''));
            isPct = true;
        } else if (discountPreset === 'customPercent') {
            discountVal = Math.min(100, Math.max(0, parseFloat(customPercentStr.replace(',', '.')) || 0));
            isPct = true;
        } else if (discountPreset === 'custom') {
            discountVal = parseFloat(customDiscountStr) || 0;
            isPct = false;
        }

        onSave(parsedQty, discountVal, isPct);
    };

    const numpadButtons = [
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: 'backspace', value: 'backspace', icon: 'backspace' },
        { label: '4', value: '4' },
        { label: '5', value: '5' },
        { label: '6', value: '6' },
        { label: '', value: 'empty1', isEmpty: true },
        { label: '7', value: '7' },
        { label: '8', value: '8' },
        { label: '9', value: '9' },
        { label: '', value: 'empty2', isEmpty: true },
        { label: ',', value: ',' },
        { label: '0', value: '0' },
        { label: '00', value: '00' },
        { label: '', value: 'empty4', isEmpty: true },
    ];

    return (
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-surface-dark flex flex-col md:max-w-md md:mx-auto md:h-full shadow-2xl animate-[slideUp_0.15s_ease-out]">
            {/* Header como foto: fondo azul oscuro (#3B4A5D aprox) */}
            <div className="bg-[#3B4A5D] px-4 py-3 shrink-0 flex items-start justify-between relative shadow-sm">
                <div className="flex-1 min-w-0 pr-8">
                    <h2 className="text-white text-lg font-semibold leading-tight truncate">{item.name}</h2>
                    <p className="text-[#a8b8d0] text-sm mt-0.5">Se vende por {item.unit || 'unidad'}</p>
                </div>
                <button className="absolute top-3 right-3 text-white/50 hover:text-white" onClick={onClose}>
                    <span className="material-symbols-outlined text-[26px]">help</span>
                </button>
            </div>

            <div className="flex-1 flex flex-col overflow-y-auto">
                <div className="p-4 flex flex-col gap-5">

                    {/* Caja de Cálculos */}
                    <div className="flex items-center gap-2 justify-between">
                        {/* Box Unidades */}
                        <div
                            className={`flex flex-col items-center justify-center flex-1 py-2 rounded-xl transition-colors cursor-pointer border-2
                                ${activeField === 'qty'
                                    ? 'bg-[#F39C12] border-[#D68910] shadow-[0_4px_12px_rgba(243,156,18,0.3)]'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                            onClick={() => setActiveField('qty')}
                        >
                            <span className={`text-sm font-semibold ${activeField === 'qty' ? 'text-white' : 'text-gray-500'}`}>Unidades</span>
                            <div className={`mt-1 font-bold text-xl px-2 py-0.5 rounded shadow-inner min-w-[40px] text-center
                                ${activeField === 'qty' ? 'bg-[#D68910] text-white' : 'bg-gray-100 dark:bg-gray-700 text-text-main dark:text-white'}`}
                            >
                                {qtyStr || '0'}
                            </div>
                        </div>

                        <span className="text-gray-400 font-bold text-sm">X</span>

                        {/* Box Precio */}
                        <div className="flex flex-col items-center justify-center flex-1 py-2 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl">
                            <span className="text-sm font-semibold text-gray-500">Precio</span>
                            <span className="mt-1 font-bold text-lg text-text-main dark:text-white">${formatCurrency(item.price)}</span>
                        </div>

                        <span className="text-gray-400 font-bold text-sm">=</span>

                        {/* Box Total */}
                        <div className="flex flex-col items-center justify-center flex-[1.2] py-2 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl shadow-sm">
                            <span className="text-sm font-semibold text-gray-500">Total</span>
                            <span className="mt-1 font-black text-xl text-primary-dark dark:text-primary">${formatCurrency(finalTotal)}</span>
                        </div>
                    </div>

                    {/* Descuento Box */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                            ¿Quieres aplicar un descuento a este producto?
                        </label>
                        <select
                            value={discountPreset}
                            onChange={(e) => {
                                const val = e.target.value;
                                setDiscountPreset(val);
                                if (val === 'custom') {
                                    setActiveField('customDiscount');
                                } else if (val === 'customPercent') {
                                    setActiveField('customPercent');
                                } else {
                                    setActiveField('qty');
                                }
                            }}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-text-main dark:text-white font-semibold outline-none focus:ring-2 focus:ring-primary/50 shadow-sm"
                        >
                            <option value="0">Descuento - Ninguno</option>
                            <option value="customPercent">Porcentaje Manual (%)</option>
                            <option value="5%">5% de Descuento</option>
                            <option value="10%">10% de Descuento</option>
                            <option value="15%">15% de Descuento</option>
                            <option value="20%">20% de Descuento</option>
                            <option value="50%">50% de Descuento</option>
                            <option value="custom">Valor Manual ($)</option>
                        </select>

                        {/* Custom Percent Input */}
                        {discountPreset === 'customPercent' && (
                            <div
                                className={`mt-3 w-full h-12 flex items-center justify-between px-4 rounded-lg cursor-pointer border-2 transition-colors
                                ${activeField === 'customPercent' ? 'bg-[#F39C12] border-[#D68910] text-white shadow-sm' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
                                onClick={() => setActiveField('customPercent')}
                            >
                                <span className="font-semibold text-sm">Porcentaje %</span>
                                <span className="font-black text-lg">
                                    {customPercentStr ? `${customPercentStr}%` : '0%'}
                                </span>
                            </div>
                        )}

                        {/* Custom Discount Input */}
                        {discountPreset === 'custom' && (
                            <div
                                className={`mt-3 w-full h-12 flex items-center justify-between px-4 rounded-lg cursor-pointer border-2 transition-colors
                                ${activeField === 'customDiscount' ? 'bg-[#F39C12] border-[#D68910] text-white shadow-sm' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
                                onClick={() => setActiveField('customDiscount')}
                            >
                                <span className="font-semibold text-sm">Valor $</span>
                                <span className="font-black text-lg">
                                    ${customDiscountStr ? formatCurrency(parseFloat(customDiscountStr) || 0) : '0'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Acciones */}
                <div className="px-4 pb-2 flex items-center gap-3 mt-auto">
                    <button
                        onClick={onClose}
                        className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={parsedQty <= 0}
                        className="flex-[1.5] flex items-center justify-center gap-2 h-12 rounded-xl bg-[#F39C12] hover:bg-[#D68910] text-white font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[20px]">check</span>
                        GUARDAR
                    </button>
                </div>

                {/* Numpad de Calculadora */}
                <div className="bg-gray-100 dark:bg-gray-900 px-3 pb-6 pt-3 shrink-0 rounded-t-3xl border-t border-gray-200 dark:border-gray-800">
                    <div className="grid grid-cols-4 gap-2">
                        {numpadButtons.map((btn, idx) => {
                            if (btn.isEmpty) {
                                return <div key={`empty-${idx}`} className="h-14"></div>;
                            }
                            const isBackspace = btn.label === 'backspace';
                            return (
                                <button
                                    key={`btn-${idx}`}
                                    onClick={() => handleNumpadPress(btn.value)}
                                    className={`h-14 rounded-xl flex items-center justify-center font-bold text-2xl transition-all active:scale-[0.9] select-none touch-manipulation shadow-sm border border-gray-200 dark:border-gray-700
                                    ${isBackspace ? 'bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'}`}
                                >
                                    {btn.icon ? (
                                        <span className="material-symbols-outlined text-[24px]">{btn.icon}</span>
                                    ) : (
                                        btn.label
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
