import React, { useState, useRef, useEffect, useCallback } from 'react';

interface InfoTooltipProps {
    text: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
    const [isVisible, setIsVisible] = useState(false);
    const tooltipRef = useRef<HTMLSpanElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

    const handleToggle = useCallback(() => {
        setIsVisible((v) => !v);
    }, []);

    useEffect(() => {
        if (!isVisible) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (
                tooltipRef.current &&
                !tooltipRef.current.contains(e.target as Node)
            ) {
                setIsVisible(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible || !tooltipRef.current || !popupRef.current) return;

        const trigger = tooltipRef.current.getBoundingClientRect();
        const popup = popupRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const padding = 12;

        const triggerCenter = trigger.left + trigger.width / 2;
        let leftOffset = triggerCenter - popup.width / 2;

        if (leftOffset < padding) {
            leftOffset = padding;
        } else if (leftOffset + popup.width > viewportWidth - padding) {
            leftOffset = viewportWidth - padding - popup.width;
        }

        const finalLeft = leftOffset - trigger.left;

        setTooltipStyle({
            left: `${finalLeft}px`,
            transform: 'none',
        });
    }, [isVisible]);

    return (
        <span className="relative inline-flex items-center ml-1" ref={tooltipRef}>
            <button
                type="button"
                className="size-4 sm:w-[18px] sm:h-[18px] rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors cursor-help"
                onClick={handleToggle}
                aria-label="Más información"
                tabIndex={0}
            >
                <span className="text-[10px] sm:text-[11px] font-bold leading-none">?</span>
            </button>
            {isVisible && (
                <div
                    ref={popupRef}
                    className="absolute z-50 bottom-full mb-2 px-3 py-2.5 bg-gray-900 dark:bg-gray-700 text-white text-[11px] sm:text-xs leading-relaxed rounded-lg shadow-xl animate-[fadeIn_0.15s_ease-out]"
                    style={{
                        width: 'max-content',
                        maxWidth: 'min(calc(100vw - 24px), 280px)',
                        ...tooltipStyle,
                    }}
                >
                    {text}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 size-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900 dark:border-t-gray-700" />
                </div>
            )}
        </span>
    );
};
