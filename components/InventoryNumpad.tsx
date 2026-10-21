import React, { useRef, useState, useEffect } from 'react';

interface InventoryNumpadProps {
    onPress: (key: string) => void;
    onClose: () => void;
    className?: string;
    children?: React.ReactNode;
}

export const InventoryNumpad: React.FC<InventoryNumpadProps> = ({ onPress, onClose, className = '', children }) => {
    const [translateY, setTranslateY] = useState(300);
    const [isDragging, setIsDragging] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const startY = useRef(0);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setTranslateY(0));
        return () => cancelAnimationFrame(frame);
    }, []);

    const handleClose = () => {
        setIsClosing(true);
        setTranslateY(300);
        setTimeout(onClose, 150);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        startY.current = e.touches[0].clientY;
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const deltaY = e.touches[0].clientY - startY.current;
        if (deltaY > 0) setTranslateY(deltaY);
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        if (translateY > 100) {
            handleClose();
        } else {
            setTranslateY(0);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isClosing) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                onPress('check');
                handleClose();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                onPress('backspace');
            } else if (e.key === 'Delete' || e.key.toLowerCase() === 'c') {
                e.preventDefault();
                onPress('C');
            } else if (/^\d$/.test(e.key)) {
                e.preventDefault();
                onPress(e.key);
            } else if (e.key === '.' || e.key === ',') {
                e.preventDefault();
                onPress(',');
            } else if (['+', '-', '*', '/'].includes(e.key)) {
                e.preventDefault();
                onPress(e.key);
            } else if (e.key === '%') {
                e.preventDefault();
                onPress('%');
            } else if (e.key === '=') {
                e.preventDefault();
                onPress('=');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const buttons = [
        { label: 'C', value: 'C', type: 'clear' },
        { label: '%', value: '%', type: 'operator' },
        { label: '÷', value: '/', type: 'operator' },
        { label: 'backspace', value: 'backspace', type: 'icon', icon: 'backspace' },
        { label: '7', value: '7', type: 'number' },
        { label: '8', value: '8', type: 'number' },
        { label: '9', value: '9', type: 'number' },
        { label: '×', value: '*', type: 'operator' },
        { label: '4', value: '4', type: 'number' },
        { label: '5', value: '5', type: 'number' },
        { label: '6', value: '6', type: 'number' },
        { label: '-', value: '-', type: 'operator' },
        { label: '1', value: '1', type: 'number' },
        { label: '2', value: '2', type: 'number' },
        { label: '3', value: '3', type: 'number' },
        { label: '+', value: '+', type: 'operator' },
        { label: '0', value: '0', type: 'number' },
        { label: ',', value: ',', type: 'number' },
        { label: '=', value: '=', type: 'action' },
        { label: 'check', value: 'check', type: 'submit', icon: 'check' },
    ];

    const getButtonClass = (type: string) => {
        const base = 'h-14 rounded-2xl flex items-center justify-center text-xl font-bold active:scale-90 touch-manipulation select-none';
        switch (type) {
            case 'number':
                return `${base} bg-gray-50 dark:bg-zinc-800/60 text-gray-900 dark:text-white active:bg-gray-200 dark:active:bg-zinc-700`;
            case 'operator':
                return `${base} bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 active:bg-gray-200 dark:active:bg-zinc-700`;
            case 'clear':
                return `${base} bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-zinc-700`;
            case 'icon':
                return `${base} bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white active:bg-gray-200 dark:active:bg-zinc-700`;
            case 'action':
                return `${base} bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-black active:bg-gray-700 dark:active:bg-gray-200`;
            case 'submit':
                return `${base} bg-primary text-[#102218] shadow-lg shadow-primary/20 active:bg-primary/80`;
            default:
                return base;
        }
    };

    return (
        <div
            className={`bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-gray-800 pt-1 pb-6 px-3 shadow-[0_-12px_40px_rgba(0,0,0,0.12)] z-50 rounded-t-[2rem] flex flex-col ${className}`}
            style={{
                transform: `translateY(${translateY}px)`,
                opacity: isClosing ? 0 : 1,
                transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.1s ease',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Handle - solo drag, no click-to-close */}
            <div
                className="w-full flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            {children}

            <div className="max-w-md mx-auto w-full mt-1">
                <div className="grid grid-cols-4 gap-2">
                    {buttons.map((btn, idx) => (
                        <button
                            key={`btn-${idx}`}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onPress(btn.value);
                                if (btn.value === 'check') handleClose();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={getButtonClass(btn.type)}
                            style={{ transition: 'transform 0.08s ease, background-color 0.1s ease' }}
                        >
                            {btn.icon ? (
                                <span className="material-symbols-outlined text-[22px]">{btn.icon}</span>
                            ) : (
                                btn.label
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
