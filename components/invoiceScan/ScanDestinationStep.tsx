import React from 'react';
import { ScanStepShell } from './ScanStepShell';
import type { ScanDestination, ScanProgress } from '../../lib/invoiceScan/types';

/**
 * Selector_Destino: primer paso del Escaneo_Unificado.
 *
 * Componente presentacional: recibe por props el callback de elección y el de
 * cierre. No consume `useInvoiceScanDraft` ni hace fetch; quien lo cablea es
 * `screens/InvoiceScanScreen.tsx`.
 *
 * Se envuelve a sí mismo en `ScanStepShell`, que aporta el control para cerrar
 * el flujo (Req 1.5) y la región `aria-live`.
 *
 * Requisitos: 1.2 (exactamente dos destinos), 1.5 (control para cerrar), 16.6.
 */

const NO_OP = (): void => { };

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

interface DestinationOptionProps {
    destination: ScanDestination;
    title: string;
    /** Una sola frase que explica la diferencia con el otro destino. */
    description: string;
    ariaLabel: string;
    icon: string;
    badge: string;
    onSelect: (destination: ScanDestination) => void;
}

/**
 * Tarjeta de destino para pantallas táctiles y escritorio.
 * En desktop se organiza en cuadrícula de 2 columnas con icono temático,
 * etiqueta de tipo de impacto en inventario y affordance claro.
 */
const DestinationOption: React.FC<DestinationOptionProps> = ({
    destination,
    title,
    description,
    ariaLabel,
    icon,
    badge,
    onSelect,
}) => {
    const handleClick = () => onSelect(destination);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        onSelect(destination);
    };

    const isInventory = destination === 'inventory';

    return (
        <button
            type="button"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            tabIndex={0}
            className={`group relative flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 ${
                isInventory
                    ? 'hover:border-amber-400 hover:shadow-amber-500/10 focus:ring-amber-400'
                    : 'hover:border-blue-400 hover:shadow-blue-500/10 focus:ring-blue-400'
            }`}
        >
            <div className="w-full">
                {/* Cabecera de la tarjeta: Icono temático y etiqueta de impacto */}
                <div className="flex items-center justify-between gap-2">
                    <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${
                            isInventory ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}
                    >
                        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                            {icon}
                        </span>
                    </span>
                    <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            isInventory
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-blue-200 bg-blue-50 text-blue-800'
                        }`}
                    >
                        {badge}
                    </span>
                </div>

                {/* Título y descripción explicativa */}
                <div className="mt-4">
                    <span className="block text-base font-black tracking-tight text-slate-900 group-hover:text-slate-950">
                        {title}
                    </span>
                    <span className="mt-1.5 block text-xs font-semibold leading-relaxed text-slate-500">
                        {description}
                    </span>
                </div>
            </div>

            {/* Pie de acción con affordance */}
            <div className="mt-5 flex w-full items-center justify-between border-t border-slate-100 pt-3">
                <span
                    className={`text-xs font-bold transition-colors ${
                        isInventory ? 'text-amber-700 group-hover:text-amber-800' : 'text-blue-700 group-hover:text-blue-800'
                    }`}
                >
                    Seleccionar
                </span>
                <span
                    className={`material-symbols-outlined text-lg transition-transform duration-200 group-hover:translate-x-1 ${
                        isInventory ? 'text-amber-600' : 'text-blue-600'
                    }`}
                    aria-hidden="true"
                >
                    arrow_forward
                </span>
            </div>
        </button>
    );
};

export interface ScanDestinationStepProps {
    onSelectDestination: (destination: ScanDestination) => void;
    onClose: () => void;
    canGoBack?: boolean;
    onBack?: () => void;
    progress?: ScanProgress | null;
    errorMessage?: string;
}

export const ScanDestinationStep: React.FC<ScanDestinationStepProps> = ({
    onSelectDestination,
    onClose,
    canGoBack = false,
    onBack = NO_OP,
    progress = null,
    errorMessage,
}) => (
    <ScanStepShell
        step="destination"
        title="¿Qué trae este documento?"
        subtitle="Elige el destino antes de tomar la foto."
        progress={progress}
        canGoBack={canGoBack}
        onBack={onBack}
        onClose={onClose}
        errorMessage={errorMessage}
    >
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DestinationOption
                    destination="inventory"
                    title="Compra de inventario"
                    description="Mercancía para revender o insumos de tus recetas: entran al stock y se descuentan al vender."
                    ariaLabel="Elegir destino: compra de inventario"
                    icon="inventory_2"
                    badge="Entra a stock"
                    onSelect={onSelectDestination}
                />
                <DestinationOption
                    destination="expense"
                    title="Gasto"
                    description="Pagos que no descuentan stock al vender: servicios, arriendo, transporte o productos de consumo interno."
                    ariaLabel="Elegir destino: gasto"
                    icon="receipt_long"
                    badge="Egreso directo"
                    onSelect={onSelectDestination}
                />
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl bg-slate-100/90 px-4 py-3 text-slate-500">
                <span className="material-symbols-outlined text-lg shrink-0 text-slate-400" aria-hidden="true">info</span>
                <p className="text-xs font-semibold leading-snug text-slate-600">
                    Si te equivocas, puedes volver a este paso antes de guardar.
                </p>
            </div>
        </div>
    </ScanStepShell>
);

export default ScanDestinationStep;
