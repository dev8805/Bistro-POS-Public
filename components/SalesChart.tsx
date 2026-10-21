import React, { useState, useMemo, useCallback, useRef } from 'react';
import { DailySales } from '../hooks/useDashboard';

interface SalesChartProps {
    dailySales: DailySales[];
    prevDailySales?: DailySales[];
}

const W = 1000;
const H = 300;
const PAD_TOP = 25;
const PAD_BOTTOM = 35;
const PAD_LEFT = 40;
const PAD_RIGHT = 40;

export const formatShortDate = (dateStr: string): string => {
    if (!dateStr) return '';
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length >= 3) {
            return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
        }
    }
    return dateStr;
};

const formatMoney = (v: number): string => {
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'K';
    return '$' + v.toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const buildPaths = (sales: DailySales[], maxVal: number): { points: { x: number; y: number; date: string; total: number }[]; linePath: string; areaPath: string } => {
    const chartH = H - PAD_TOP - PAD_BOTTOM;
    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const pts = sales.map((d, i) => {
        const x = sales.length === 1 ? W / 2 : PAD_LEFT + (i / (sales.length - 1)) * chartW;
        const y = PAD_TOP + chartH - (d.total / maxVal) * chartH;
        return { x, y, date: d.date, total: d.total };
    });

    let line = '';
    let area = '';

    if (pts.length === 1) {
        line = `M${pts[0].x},${pts[0].y}`;
        area = `M${pts[0].x},${pts[0].y} V${H - PAD_BOTTOM} H${pts[0].x} Z`;
    } else if (pts.length > 1) {
        line = `M${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const cp = (pts[i].x - pts[i - 1].x) * 0.3;
            line += ` C${pts[i - 1].x + cp},${pts[i - 1].y} ${pts[i].x - cp},${pts[i].y} ${pts[i].x},${pts[i].y}`;
        }
        area = line + ` V${H - PAD_BOTTOM} H${pts[0].x} Z`;
    }

    return { points: pts, linePath: line, areaPath: area };
};

export const SalesChart: React.FC<SalesChartProps> = ({ dailySales, prevDailySales = [] }) => {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const maxVal = useMemo(() => {
        const currMax = Math.max(...dailySales.map((d) => d.total), 1);
        const prevMax = prevDailySales.length > 0 ? Math.max(...prevDailySales.map((d) => d.total), 1) : 0;
        return Math.max(currMax, prevMax);
    }, [dailySales, prevDailySales]);

    const { points, linePath, areaPath } = useMemo(() => buildPaths(dailySales, maxVal), [dailySales, maxVal]);

    const { linePath: prevLinePath } = useMemo(
        () => prevDailySales.length > 0 ? buildPaths(prevDailySales, maxVal) : { points: [], linePath: '', areaPath: '' },
        [prevDailySales, maxVal]
    );

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const updateHoverPosition = useCallback(
        (clientX: number) => {
            if (!svgRef.current || points.length === 0) return;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            const rect = svgRef.current.getBoundingClientRect();
            const mouseX = ((clientX - rect.left) / rect.width) * W;
            let closest = 0;
            let minDist = Infinity;
            points.forEach((p, i) => {
                const dist = Math.abs(p.x - mouseX);
                if (dist < minDist) {
                    minDist = dist;
                    closest = i;
                }
            });
            setHoverIndex(closest);
        },
        [points]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            updateHoverPosition(e.clientX);
        },
        [updateHoverPosition]
    );

    const handleMouseLeave = useCallback(() => {
        setHoverIndex(null);
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent<SVGSVGElement>) => {
            if (e.touches.length > 0) {
                updateHoverPosition(e.touches[0].clientX);
            }
        },
        [updateHoverPosition]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent<SVGSVGElement>) => {
            if (e.touches.length > 0) {
                updateHoverPosition(e.touches[0].clientX);
            }
        },
        [updateHoverPosition]
    );

    const handleTouchEnd = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setHoverIndex(null);
        }, 2500);
    }, []);

    const gridLines = useMemo(() => {
        const lines = [];
        for (let i = 0; i <= 3; i++) {
            const y = PAD_TOP + ((H - PAD_TOP - PAD_BOTTOM) / 3) * i;
            const val = maxVal - (maxVal / 3) * i;
            lines.push({ y, label: formatMoney(Math.round(val)) });
        }
        return lines;
    }, [maxVal]);

    const dateLabels = useMemo(() => {
        if (points.length === 0) return [];
        if (points.length === 1) return [{ x: points[0].x, label: formatShortDate(points[0].date) }];

        const maxLabels = 6;
        const step = Math.max(1, Math.round((points.length - 1) / (maxLabels - 1)));
        const selectedIndices = new Set<number>();

        for (let i = 0; i < points.length; i += step) {
            selectedIndices.add(i);
        }

        const lastIdx = points.length - 1;
        const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
        const prevIdx = sorted[sorted.length - 1];

        if (lastIdx !== prevIdx) {
            const dist = points[lastIdx].x - points[prevIdx].x;
            if (dist < 75 && sorted.length > 1) {
                selectedIndices.delete(prevIdx);
            }
            selectedIndices.add(lastIdx);
        }

        return Array.from(selectedIndices)
            .sort((a, b) => a - b)
            .map((idx) => ({
                x: points[idx].x,
                label: formatShortDate(points[idx].date),
            }));
    }, [points]);

    const hp = hoverIndex !== null ? points[hoverIndex] : null;
    const prevHp = hoverIndex !== null && prevDailySales[hoverIndex] ? prevDailySales[hoverIndex] : null;

    const showPrevOverlay = prevDailySales.length > 0;

    // Aseguramos que el tooltip no se salga de la pantalla en móviles en los extremos
    const tooltipLeftPercent = hp ? Math.max(16, Math.min(84, (hp.x / W) * 100)) : 50;

    return (
        <div className="relative w-full h-44 xs:h-52 sm:h-64 md:h-72 mt-1 select-none touch-none">
            <svg
                ref={svgRef}
                className="w-full h-full cursor-crosshair"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            >
                <defs>
                    <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
                    </linearGradient>
                </defs>

                {gridLines.map((g, i) => (
                    <line
                        key={`grid-${i}`}
                        x1="0"
                        x2={W}
                        y1={g.y}
                        y2={g.y}
                        stroke="currentColor"
                        strokeDasharray="4 4"
                        className="text-gray-200 dark:text-gray-700/60"
                        strokeWidth="1"
                    />
                ))}

                {/* Línea del periodo anterior (overlay gris punteado) */}
                {showPrevOverlay && prevLinePath && (
                    <path
                        d={prevLinePath}
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        strokeDasharray="7 5"
                        strokeLinecap="round"
                        opacity="0.55"
                    />
                )}

                {/* Área + línea periodo actual */}
                <path d={areaPath} fill="url(#salesGradient)" />
                <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {hp && (
                    <g>
                        <line x1={hp.x} x2={hp.x} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="#2563eb" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
                        <circle cx={hp.x} cy={hp.y} r="8" fill="#3b82f6" fillOpacity="0.2" />
                        <circle cx={hp.x} cy={hp.y} r="5" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
                    </g>
                )}

                {dateLabels.map((d, i) => (
                    <text key={`label-${i}`} x={d.x} y={H - 6} textAnchor="middle" fill="#9ca3af" fontSize="20" fontWeight="500" fontFamily="sans-serif">
                        {d.label}
                    </text>
                ))}
            </svg>

            {/* Tooltip hover & touch */}
            {hp && (
                <div
                    className="absolute pointer-events-none bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-700 text-white text-[11px] sm:text-xs px-3 py-2 rounded-xl shadow-xl whitespace-nowrap z-20 animate-[fadeIn_0.1s_ease-out]"
                    style={{
                        left: `${tooltipLeftPercent}%`,
                        top: `${Math.max(10, (hp.y / H) * 100 - 16)}%`,
                        transform: 'translate(-50%, -100%)',
                    }}
                >
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-blue-400 shrink-0 shadow-sm" />
                            <span className="font-extrabold text-sm">{formatMoney(hp.total)}</span>
                            <span className="text-gray-400 text-[10px] font-medium">({formatShortDate(hp.date)})</span>
                        </div>
                        {prevHp && (
                            <div className="flex items-center gap-2 text-gray-400 border-t border-gray-700/60 pt-1 mt-0.5">
                                <span className="size-2 rounded-full bg-gray-400 shrink-0" />
                                <span className="font-semibold">{formatMoney(prevHp.total)}</span>
                                <span className="text-gray-500 text-[10px]">período ant.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
