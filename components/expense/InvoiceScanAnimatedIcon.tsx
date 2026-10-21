import React, { useId } from 'react';

/**
 * Icono animado de escaneo de factura con IA.
 *
 * Documento con líneas de texto, una barra de escaneo que recorre el documento
 * de arriba abajo y la estrella de IA en la esquina. La animación va con
 * elementos `<animate>` de SVG (SMIL), no con keyframes de CSS ni de Tailwind:
 * así el icono se anima solo, sin depender de la config global.
 *
 * ## Colores: el gradiente de IA de Google (Gemini), no un color de marca
 *
 * La barra de escaneo y la estrella pintan con el gradiente `#4285F4`
 * (azul) → `#9B72CB` (violeta) → `#D96570` (coral) — la firma visual que
 * Google usa en Gemini para señalar "aquí está pasando IA" (sparkle, borde de
 * enfoque, shimmer de generación). Es la misma familia azul-violeta-rosa que
 * usan Apple Intelligence y Copilot: se reconoce como "IA" fuera del contexto
 * de una sola marca, a diferencia de un amarillo que no comunica nada de eso.
 *
 * El marco y las líneas del documento (lo que representa "una factura", no la
 * IA en sí) siguen pintando con `currentColor`, así cada pantalla los puede
 * afinar al tono de su superficie sin tocar el acento de IA.
 *
 * Todos los elementos de gradiente comparten un único `<linearGradient>` con
 * id generado por `useId()`, para que dos instancias del icono en la misma
 * página no colisionen de id (dos "Foto a factura" abiertos a la vez, por
 * ejemplo el menú y el paso de captura).
 *
 * Se extrajo de `InventoryPurchase` para que la acción de escaneo se vea igual
 * en sus dos puntos de entrada: "Escanear factura" dentro de Compra de
 * inventario y "Foto a factura" en el menú de gastos.
 */
export interface InvoiceScanAnimatedIconProps {
    /** Lado del icono en píxeles. */
    size?: number;
    /** Clases de color para el marco/líneas del documento (pintan con `currentColor`). */
    className?: string;
    /**
     * Si es true, la barra de escaneo y la estrella se pintan en gris neutro
     * en vez del gradiente de IA. Para estados deshabilitados (ej. sin conexión,
     * donde el escaneo no está disponible).
     */
    muted?: boolean;
}

export const InvoiceScanAnimatedIcon: React.FC<InvoiceScanAnimatedIconProps> = ({
    size = 22,
    className,
    muted = false,
}) => {
    const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
    const gradientId = `invoice-scan-ai-gradient-${rawId}`;
    const accent = muted ? '#94A3B8' /* slate-400 */ : `url(#${gradientId})`;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 22 22"
            fill="none"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {/* Gradiente de IA de Google/Gemini: azul → violeta → coral. */}
                <linearGradient id={gradientId} x1="0" y1="2" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4285F4" />
                    <stop offset="55%" stopColor="#9B72CB" />
                    <stop offset="100%" stopColor="#D96570" />
                </linearGradient>
            </defs>

            {/* Marco del documento */}
            <rect x="3" y="2" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />

            {/* Líneas del documento */}
            <line x1="5.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" />
            <line x1="5.5" y1="8.5" x2="10.5" y2="8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" />
            <line x1="5.5" y1="11" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" />

            {/* Barra de escaneo: recorre el documento en el gradiente de IA */}
            <line x1="1.5" y1="8.5" x2="14.5" y2="8.5" stroke={accent} strokeWidth="1.5" strokeLinecap="round">
                <animate attributeName="y1" values="4;13;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="y2" values="4;13;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
            </line>

            {/* Estrella de IA, rellena con el mismo gradiente */}
            <path
                d="M17 13 L18 15.5 L20.5 16.5 L18 17.5 L17 20 L16 17.5 L13.5 16.5 L16 15.5 Z"
                fill={accent}
            />
        </svg>
    );
};

export default InvoiceScanAnimatedIcon;
