import React, { useState } from 'react';

interface CustomDateRangePickerProps {
    initialStart: string; // YYYY-MM-DD
    initialEnd: string;
    onApply: (start: string, end: string) => void;
    onCancel: () => void;
    singleMonth?: boolean;
}

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const toDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const CustomDateRangePicker: React.FC<CustomDateRangePickerProps> = ({
    initialStart,
    initialEnd,
    onApply,
    onCancel,
    singleMonth = false
}) => {
    const [start, setStart] = useState<Date | null>(() => new Date(initialStart + 'T12:00:00'));
    const [end, setEnd] = useState<Date | null>(() => new Date(initialEnd + 'T12:00:00'));
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    const [viewDate, setViewDate] = useState<Date>(() => {
        const d = new Date(initialEnd + 'T12:00:00');
        d.setDate(1);
        return d;
    });

    const isSelecting = start !== null && end === null;

    const handleDayClick = (dayDate: Date) => {
        if (!start || (start && end)) {
            setStart(dayDate);
            setEnd(null);
        } else if (start && !end) {
            if (dayDate < start) {
                setEnd(start);
                setStart(dayDate);
            } else {
                setEnd(dayDate);
            }
        }
    };

    const isDateInRange = (date: Date) => {
        if (!start) return false;
        
        if (start && end) {
            return date >= start && date <= end;
        }
        
        if (start && hoverDate) {
            const min = start < hoverDate ? start : hoverDate;
            const max = start > hoverDate ? start : hoverDate;
            return date >= min && date <= max;
        }

        return false;
    };

    const isStart = (date: Date) => start && toDateString(date) === toDateString(start);
    const isEnd = (date: Date) => end && toDateString(date) === toDateString(end);
    
    const isHoverEnd = (date: Date) => !end && hoverDate && toDateString(date) === toDateString(hoverDate);

    const prevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const setToday = () => {
        const today = new Date();
        setStart(today);
        setEnd(today);
        setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    };

    const formatInputDate = (d: Date | null) => {
        if (!d) return '--';
        const m = MONTHS[d.getMonth()].substring(0, 3);
        return `${d.getDate()} ${m}, ${d.getFullYear()}`;
    };

    const renderCalendar = (monthOffset: number = 0) => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth() + monthOffset;
        const targetDate = new Date(year, month, 1);
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth();

        const title = `${MONTHS[targetMonth]} ${targetYear}`;

        let firstDayIndex = targetDate.getDay() - 1;
        if (firstDayIndex === -1) firstDayIndex = 6;

        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        
        const daysArray = [];
        for (let i = 0; i < firstDayIndex; i++) {
            daysArray.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            daysArray.push(new Date(targetYear, targetMonth, i));
        }

        return (
            <div className="flex-1 w-full min-w-[240px] p-2 xs:p-3">
                <div className="flex justify-between items-center mb-2 xs:mb-3 px-1 xs:px-2">
                    <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1">
                        <span className="material-symbols-outlined text-[18px] xs:text-[20px]">chevron_left</span>
                    </button>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</span>
                    <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1">
                        <span className="material-symbols-outlined text-[18px] xs:text-[20px]">chevron_right</span>
                    </button>
                </div>

                <div className="grid grid-cols-7 mb-1">
                    {WEEKDAYS.map((wd, i) => (
                        <div key={`day-${i}`} className="text-center text-[10px] xs:text-[11px] font-semibold text-gray-400 mb-1 xs:mb-2">
                            {wd}
                        </div>
                    ))}
                    {daysArray.map((dayObj, i) => {
                        if (!dayObj) {
                            return <div key={`empty-${i}`} className="h-7 xs:h-8 md:h-9" />;
                        }

                        const dStr = toDateString(dayObj);
                        const todayStr = toDateString(new Date());
                        const isTday = dStr === todayStr;

                        const selectedRange = isDateInRange(dayObj);
                        const isS = isStart(dayObj);
                        const isE = isEnd(dayObj);
                        const isHE = isHoverEnd(dayObj);

                        let wrapperClasses = "relative w-full h-7 xs:h-8 md:h-9 flex items-center justify-center ";
                        let btnClasses = "size-7 xs:w-8 xs:h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full text-[11px] xs:text-xs md:text-sm font-medium transition-all z-10 ";
                        
                        if (selectedRange && (start || end)) {
                            wrapperClasses += "bg-blue-50 dark:bg-blue-900/40 ";
                        }
                        
                        if (isS) {
                            wrapperClasses += "rounded-l-full ";
                            btnClasses += "bg-blue-600 text-white shadow-sm font-bold scale-105 ";
                        } else if (isE) {
                            wrapperClasses += "rounded-r-full ";
                            btnClasses += "bg-blue-600 text-white shadow-sm font-bold scale-105 ";
                        } else if (isHE) {
                            wrapperClasses += start && dayObj > start ? "rounded-r-full " : "rounded-l-full ";
                            btnClasses += "bg-blue-400 text-white shadow-sm scale-105 ";
                        } else if (selectedRange) {
                            btnClasses += "text-blue-800 dark:text-blue-200 font-bold ";
                        } else {
                            btnClasses += "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 ";
                            if (isTday) {
                                btnClasses += "text-blue-600 dark:text-blue-400 font-extrabold ";
                            }
                        }

                        return (
                            <div 
                                key={dStr} 
                                className={wrapperClasses}
                                onMouseEnter={() => isSelecting && setHoverDate(dayObj)}
                                onMouseLeave={() => isSelecting && setHoverDate(null)}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleDayClick(dayObj)}
                                    className={btnClasses}
                                >
                                    {dayObj.getDate()}
                                </button>
                                {isTday && !isS && !isE && !selectedRange && (
                                    <div className="absolute bottom-0.5 xs:bottom-1 size-1 rounded-full bg-blue-500 z-10"></div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className={singleMonth
            ? "flex flex-col animate-[fadeIn_0.15s_ease-out] w-[290px] xs:w-[320px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800 overflow-hidden"
            : "flex flex-col animate-[fadeIn_0.15s_ease-out] w-[290px] xs:w-[320px] md:w-auto md:max-w-none shadow-2xl rounded-2xl md:rounded-3xl border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800 overflow-hidden"
        }>
            <div className="flex flex-col md:flex-row p-1 xs:p-2 md:p-3 gap-0 md:gap-4 border-b border-gray-100 dark:border-gray-700/50">
                {singleMonth ? (
                    <div className="flex w-full">
                        {renderCalendar(0)}
                    </div>
                ) : (
                    <>
                        <div className="md:hidden flex">
                            {renderCalendar(0)}
                        </div>
                        <div className="hidden md:flex flex-row gap-0 md:gap-4 w-full">
                            {renderCalendar(-1)}
                            <div className="w-px bg-gray-100 dark:bg-gray-700/50 self-stretch my-2"></div>
                            {renderCalendar(0)}
                        </div>
                    </>
                )}
            </div>

            <div className="px-3 py-3 md:px-5 md:py-4 flex flex-col gap-3 bg-gray-50/50 dark:bg-gray-800/50">
                {/* Inputs y Botón Hoy Compactos */}
                <div className={`grid ${singleMonth ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'} gap-2 items-center`}>
                    <div className="flex flex-col justify-center items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg xs:rounded-xl py-1 xs:py-1.5 shadow-sm">
                        <span className="text-[9px] xs:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Desde</span>
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-0.5">{formatInputDate(start)}</span>
                    </div>
                    <div className="flex flex-col justify-center items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg xs:rounded-xl py-1 xs:py-1.5 shadow-sm">
                        <span className="text-[9px] xs:text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Hasta</span>
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-0.5">{formatInputDate(end)}</span>
                    </div>
                </div>

                <div className="flex justify-between items-center gap-2 pt-1">
                    <button 
                        onClick={setToday}
                        className="text-xs font-bold px-3 py-2 md:px-4 md:py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg xs:rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
                    >
                        Hoy
                    </button>
                    
                    <div className="flex gap-2 min-w-0">
                        <button 
                            onClick={onCancel}
                            className="text-xs font-bold px-3 py-2 md:px-4 md:py-2.5 rounded-lg xs:rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={() => {
                                if (start && end) {
                                    onApply(toDateString(start), toDateString(end));
                                } else if (start) {
                                    onApply(toDateString(start), toDateString(start));
                                }
                            }}
                            disabled={!start}
                            className="text-xs font-bold px-4 py-2 md:px-6 md:py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white shadow-sm shadow-blue-500/30 rounded-lg xs:rounded-xl transition-colors"
                        >
                            Aplicar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
