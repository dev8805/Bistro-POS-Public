import { useState, useMemo } from 'react';
import ComandaLabelModal, { ComandaLabelSelection } from './ComandaLabelModal';

// ============================================================
// ComandaLabelHeaderButton
// ------------------------------------------------------------
// Píldora que aparece en el header del carrito (MenuScreen desktop y
// PaymentScreen móvil/tablet), al lado del badge "Orden Rápida"/"Mesa X".
//
// Comportamiento:
// - Sin selección: muestra "🍽️ Pedido".
// - Con selección: muestra el resumen truncado (ej. "🍽️ Loc 3 · Mesa 5 · Domicilio").
// - Al tocar abre el ComandaLabelModal para editar la selección.
//
// Se oculta cuando:
// - `enabled === false` (preferencia del negocio en Ajustes).
// - `isCatalogMode === false` (solo tiene sentido en modo Catálogo).
// ============================================================

export interface ComandaLabelHeaderButtonProps {
    /** Selección actual (persistida a nivel App.tsx). */
    selection: ComandaLabelSelection;
    /** Callback cuando el cajero confirma nueva selección en el modal. */
    onChange: (selection: ComandaLabelSelection) => void;
    /** Preferencia del negocio (Ajustes → Activar/Desactivar). */
    enabled: boolean;
    /** Solo se muestra en modo Catálogo. */
    isCatalogMode: boolean;
    /** Variante visual: compact para pantallas con poco espacio. */
    compact?: boolean;
}

const buildSummary = (sel: ComandaLabelSelection): string => {
    const parts: string[] = [];
    if (sel.locator) parts.push(`Loc ${sel.locator}`);
    if (sel.table) parts.push(`Mesa ${sel.table}`);
    if (sel.takeaway) parts.push(sel.takeaway);
    return parts.join(' · ');
};

const ComandaLabelHeaderButton = ({
    selection,
    onChange,
    enabled,
    isCatalogMode,
    compact = false,
}: ComandaLabelHeaderButtonProps) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const summary = useMemo(() => buildSummary(selection), [selection]);
    const hasSelection = summary.length > 0;

    if (!enabled || !isCatalogMode) return null;

    const handleOpen = () => setIsModalOpen(true);
    const handleClose = () => setIsModalOpen(false);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
        }
    };

    const handleConfirm = (next: ComandaLabelSelection) => {
        onChange(next);
        setIsModalOpen(false);
    };

    // Estilo píldora: neutro cuando vacío, ámbar tenue cuando hay selección.
    // Borde grueso (border-2) para resaltar. Texto en MAYÚSCULAS y letter-spacing
    // amplio para look de "chip de acción". Padding horizontal generoso sin tocar
    // la altura (para que no crezca el header en ningún breakpoint).
    const baseClasses = compact
        ? 'h-7 px-3.5 gap-1.5 text-[11px] tracking-wider'
        : 'h-8 px-4 gap-2 text-[12px] tracking-wider';

    const stateClasses = hasSelection
        ? 'bg-primary/20 border border-primary text-text-main dark:text-white hover:bg-primary/30'
        : 'bg-white dark:bg-gray-800/50 border border-primary/60 text-text-main dark:text-white hover:border-primary hover:bg-primary/10';

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                aria-label={hasSelection ? `Etiquetas: ${summary}. Tocar para editar.` : 'Agregar etiquetas de comanda'}
                className={`inline-flex items-center rounded-lg font-black uppercase whitespace-nowrap max-w-[240px] transition-all ${baseClasses} ${stateClasses}`}
                title={hasSelection ? summary : 'Pedido'}
            >
                <span className="truncate">{hasSelection ? summary : 'Pedido'}</span>
            </button>

            <ComandaLabelModal
                isOpen={isModalOpen}
                initialSelection={selection}
                onClose={handleClose}
                onConfirm={handleConfirm}
                confirmLabel="Guardar"
                confirmIcon="check"
            />
        </>
    );
};

export default ComandaLabelHeaderButton;
