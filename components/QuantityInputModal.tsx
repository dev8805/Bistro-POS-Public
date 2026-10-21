import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';

interface QuantityInputModalProps {
    product: Product;
    currentQuantity: number;
    onConfirm: (newQuantity: number) => void;
    onClose: () => void;
}

export const QuantityInputModal: React.FC<QuantityInputModalProps> = ({
    product,
    currentQuantity,
    onConfirm,
    onClose,
}) => {
    const [qtyStr, setQtyStr] = useState(currentQuantity > 0 ? String(currentQuantity) : '');
    const inputRef = useRef<HTMLInputElement>(null);
    const [isMobile, setIsMobile] = useState(false);

    const [translateY, setTranslateY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const currentY = useRef(0);

    useEffect(() => {
        const checkIsMobile = () => {
            const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            return isTouch || window.innerWidth < 768;
        };
        const currentIsMobile = checkIsMobile();
        setIsMobile(currentIsMobile);

        if (!currentIsMobile) {
            setTimeout(() => {
                const input = inputRef.current;
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
        } else {
            // Cerrar el teclado virtual forzosamente en múltiples frames
            const blurAll = () => {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                const dummy = document.createElement('input');
                dummy.setAttribute('type', 'text');
                dummy.setAttribute('readonly', 'true');
                dummy.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
                document.body.appendChild(dummy);
                dummy.focus();
                dummy.blur();
                document.body.removeChild(dummy);
            };
            blurAll();
            setTimeout(blurAll, 50);
            setTimeout(blurAll, 150);
        }
    }, []);

    const handleTouchStart = (e: React.TouchEvent) => {
        startY.current = e.touches[0].clientY;
        currentY.current = e.touches[0].clientY;
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        currentY.current = e.touches[0].clientY;
        const deltaY = currentY.current - startY.current;
        if (deltaY > 0) {
            setTranslateY(deltaY);
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        if (translateY > 100) {
            onClose();
        } else {
            setTranslateY(0);
        }
    };

    const parsedQty = parseInt(qtyStr, 10);
    const isValidQty = !isNaN(parsedQty) && parsedQty >= 0;

    const handleConfirm = () => {
        if (isValidQty) {
            onConfirm(parsedQty);
        }
        onClose();
    };

    const handleNumpadPress = (key: string) => {
        if (key === 'C') {
            setQtyStr('');
        } else if (key === 'backspace') {
            setQtyStr(prev => prev.slice(0, -1));
        } else if (key === 'check' || key === '=') {
            handleConfirm();
        } else if (/^\d$/.test(key)) {
            setQtyStr(prev => {
                if (prev === '0') return key;
                return prev + key;
            });
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (document.activeElement === inputRef.current && !isMobile) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                handleNumpadPress('backspace');
            } else if (e.key === 'Delete' || e.key.toLowerCase() === 'c') {
                e.preventDefault();
                handleNumpadPress('C');
            } else if (/^\d$/.test(e.key)) {
                e.preventDefault();
                handleNumpadPress(e.key);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const numpadButtons = [
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: 'backspace', value: 'backspace', icon: 'backspace' },
        { label: '4', value: '4' },
        { label: '5', value: '5' },
        { label: '6', value: '6' },
        { label: 'C', value: 'C' },
        { label: '7', value: '7' },
        { label: '8', value: '8' },
        { label: '9', value: '9' },
        { label: 'check', value: 'check', icon: 'check', isSubmit: true },
        { label: '', value: '', isEmpty: true },
        { label: '0', value: '0' },
        { label: '', value: '', isEmpty: true },
        { label: '', value: '', isEmpty: true },
    ];

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4 animate-[fadeIn_0.15s_ease-out]"
            onClick={onClose}
        >
            <div
                className={`bg-white dark:bg-surface-dark rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-[340px] overflow-hidden animate-[slideUp_0.2s_ease-out] ${isDragging ? '' : 'transition-transform duration-300 ease-out'}`}
                style={{ transform: `translateY(${translateY}px)` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Handle móvil */}
                <div
                    className="md:hidden w-full flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                </div>

                {/* Header */}
                <div className="px-5 pt-3 md:pt-5 pb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-text-main dark:text-white truncate">Cantidad exacta</h3>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Input */}
                <div className="px-5 pb-4">
                    <div className="text-xs font-bold text-gray-500 mb-2 truncate">
                        {product.name}
                    </div>
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode={isMobile ? 'none' : 'numeric'}
                            readOnly={isMobile}
                            value={qtyStr}
                            onChange={(e) => {
                                if (isMobile) return;
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setQtyStr(val);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirm();
                                if (e.key === 'Escape') onClose();
                            }}
                            placeholder="0"
                            className="w-full h-14 px-4 text-center text-3xl font-black tabular-nums text-text-main dark:text-white bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-primary focus:ring-0 outline-none transition-colors placeholder:text-gray-300 caret-primary"
                        />
                    </div>
                </div>

                {/* Desktop: botones */}
                {!isMobile && (
                    <div className="px-5 pb-5 grid grid-cols-2 gap-3">
                        <button
                            onClick={onClose}
                            className="h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:scale-[0.98]"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="h-11 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-sm shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-lg">check</span>
                            Confirmar
                        </button>
                    </div>
                )}

                {/* Móvil/Tablet: Numpad */}
                {isMobile && (
                    <div className="px-4 pb-6 pt-2">
                        <div className="grid grid-cols-4 gap-2.5 max-w-sm mx-auto">
                            {numpadButtons.map((btn, idx) => {
                                if (btn.isEmpty) return <div key={`empty-${idx}`} />;

                                const isNumber = /^\d+$/.test(btn.value);
                                const isClear = btn.value === 'C';
                                const isBackspace = btn.value === 'backspace';
                                const isSubmit = (btn as any).isSubmit;

                                return (
                                    <button
                                        key={`btn-${idx}`}
                                        onClick={() => handleNumpadPress(btn.value)}
                                        className={`h-14 rounded-2xl flex items-center justify-center text-lg font-bold transition-all duration-100 active:scale-95 touch-manipulation select-none
                                        ${isNumber ? 'bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-white' : ''}
                                        ${isClear ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 text-base' : ''}
                                        ${isBackspace ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white' : ''}
                                        ${isSubmit ? 'bg-primary text-[#102218] shadow-lg shadow-primary/20 row-span-1' : ''}
                                        `}
                                    >
                                        {btn.icon ? (
                                            <span className="material-symbols-outlined text-[22px]">{btn.icon}</span>
                                        ) : (
                                            btn.label
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
