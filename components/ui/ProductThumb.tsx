import { useState, useEffect } from 'react';

interface ProductThumbProps {
    /** URL de la imagen. Si es null/undefined o falla al cargar, se muestra el icono de fallback. */
    src?: string | null;
    alt?: string;
    /** Nombre del material symbol a mostrar cuando no hay imagen o falla la carga. */
    fallbackIcon?: string;
    /** Clases del contenedor cuadrado (tamaño, radio, fondo). */
    className?: string;
    /** Ajuste de la imagen dentro del contenedor. */
    fit?: 'cover' | 'contain';
    /** Clases del icono de fallback (tamaño y color). */
    iconClassName?: string;
}

/**
 * Miniatura de producto con fallback ante error de carga.
 * En modo offline las imágenes remotas pueden fallar; en lugar del icono
 * de imagen rota del navegador, muestra un placeholder limpio.
 */
const ProductThumb = ({
    src,
    alt = '',
    fallbackIcon = 'inventory_2',
    className = '',
    fit = 'contain',
    iconClassName = 'text-[22px] text-gray-400',
}: ProductThumbProps) => {
    const [errored, setErrored] = useState(false);

    // Reintentar mostrar la imagen si cambia la fuente
    useEffect(() => {
        setErrored(false);
    }, [src]);

    const showImg = Boolean(src) && !errored;

    return (
        <div className={`overflow-hidden flex items-center justify-center ${className}`}>
            {showImg ? (
                <img
                    src={src as string}
                    alt={alt}
                    crossOrigin="anonymous"
                    className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
                    onError={() => setErrored(true)}
                />
            ) : (
                <span className={`material-symbols-outlined ${iconClassName}`}>{fallbackIcon}</span>
            )}
        </div>
    );
};

export default ProductThumb;
