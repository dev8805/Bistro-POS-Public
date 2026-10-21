import { useState, useEffect } from 'react';

/**
 * Detecta si el viewport es móvil (<768px), el mismo breakpoint que usa el resto
 * de la app para alternar entre layouts de escritorio y móvil.
 */
export const useIsMobile = (breakpoint = 768): boolean => {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < breakpoint
    );
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [breakpoint]);
    return isMobile;
};
