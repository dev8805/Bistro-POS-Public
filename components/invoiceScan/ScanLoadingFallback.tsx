import React from 'react';

/**
 * Fallback de Suspense mientras se descarga el chunk de `InvoiceScanScreen`.
 *
 * Antes cada pantalla de entrada usaba `<div className="fixed inset-0 z-[80]
 * bg-slate-50" />`: un rectángulo opaco a pantalla completa que en escritorio
 * producía un destello blanco antes de aparecer la tarjeta del escaneo.
 *
 * Dos decisiones evitan que se vea cualquier estado intermedio:
 *
 * 1. **Aparición retrasada.** La animación `fadeIn` arranca con 250 ms de delay
 *    y `both` como fill-mode, así que durante ese tiempo el overlay se mantiene
 *    en opacidad 0. Como `ExpenseActionsMenu` precarga el chunk al abrir el menú,
 *    lo normal es que Suspense resuelva antes del delay y este fallback no llegue
 *    a pintarse nunca: el modal aparece directamente con su contenido.
 *
 * 2. **Alto aproximado al primer paso.** Si la carga sí es lenta y el fallback
 *    aparece, su tarjeta mide casi lo mismo que el `Selector_Destino` (~360 px:
 *    encabezado + dos opciones + aviso). Antes tenía 420 px y al montar el paso
 *    real la tarjeta se encogía de golpe.
 *
 * El resto del chrome (velo en escritorio, tarjeta redondeada, fondo) replica
 * `ScanStepShell` para que no haya cambio de fondo ni salto de layout.
 */
export const ScanLoadingFallback: React.FC = () => (
    <div className="fixed inset-0 z-[80] flex animate-[fadeIn_0.2s_ease-out_0.25s_both] flex-col bg-slate-50 md:items-center md:justify-center md:bg-slate-900/50 md:p-6">
        <div
            role="status"
            aria-live="polite"
            className="flex h-full w-full min-h-0 flex-col items-center justify-center gap-3 bg-slate-50 md:h-auto md:min-h-[360px] md:max-h-[92vh] md:max-w-2xl md:rounded-3xl md:shadow-2xl md:overflow-hidden"
        >
            <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-amber-400" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Abriendo el escaneo…</p>
        </div>
    </div>
);

export default ScanLoadingFallback;
