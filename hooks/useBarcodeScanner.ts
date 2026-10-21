import { useEffect, useRef } from 'react';

const SCANNER_THRESHOLD_MS = 50;
const MIN_BARCODE_LENGTH = 4;

// Deduplicación a nivel de módulo: si varias instancias del hook están activas
// al mismo tiempo, solo la primera que detecte el escaneo llama a onMatch.
// 50ms es suficiente para filtrar duplicados de la misma instancia (< 1ms de gap)
// sin bloquear un segundo escaneo del mismo producto (mínimo ~200ms de gap real).
let _lastFiredCode = '';
let _lastFiredTime = 0;
const DEDUP_WINDOW_MS = 50;

// Cuenta cuántas instancias del hook tienen prioridad activa. Las instancias sin
// prioridad ignoran sus escaneos mientras esta cuenta sea > 0. Útil para que un
// panel/modal específico (ej. Compra de inventario) capture los escaneos sin que
// MenuScreen, montado en background, los procese al mismo tiempo.
let _priorityCount = 0;

export const useBarcodeScanner = (
    products: any[],
    onMatch: (product: any) => void,
    enabled: boolean = true,
    onNotFound?: (code: string) => void,
    priority: boolean = false,
) => {
    const productsRef = useRef(products);
    const onMatchRef = useRef(onMatch);
    const onNotFoundRef = useRef(onNotFound);
    const priorityRef = useRef(priority);

    useEffect(() => { productsRef.current = products; });
    useEffect(() => { onMatchRef.current = onMatch; });
    useEffect(() => { onNotFoundRef.current = onNotFound; });
    useEffect(() => { priorityRef.current = priority; });

    // Registra esta instancia como prioritaria mientras esté habilitada.
    useEffect(() => {
        if (!enabled || !priority) return;
        _priorityCount++;
        if (import.meta.env.DEV) console.log('[Scanner] ⭐ Prioridad ACTIVA. count=', _priorityCount);
        return () => {
            _priorityCount--;
            if (import.meta.env.DEV) console.log('[Scanner] ⭐ Prioridad LIBERADA. count=', _priorityCount);
        };
    }, [enabled, priority]);

    useEffect(() => {
        if (!enabled) {
            if (import.meta.env.DEV) console.log('[Scanner] 🔴 Listener INACTIVO (enabled=false).');
            return;
        }

        const buffer: string[] = [];
        const timings: number[] = [];
        let lastKeyTime = 0;
        let clearTimer: ReturnType<typeof setTimeout> | null = null;

        const reset = () => {
            buffer.length = 0;
            timings.length = 0;
            lastKeyTime = 0;
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now();

            if (e.key === 'Enter' || e.code === 'NumpadEnter') {
                const code = buffer.join('');
                const avg = timings.length > 0
                    ? timings.reduce((a, b) => a + b, 0) / timings.length
                    : 999;

                if (code.length >= MIN_BARCODE_LENGTH && timings.length >= MIN_BARCODE_LENGTH - 1) {
                    if (avg < SCANNER_THRESHOLD_MS) {
                        // Si existe una instancia con prioridad activa y esta no la tiene,
                        // dejarla procesar el escaneo. Evita que el MenuScreen en background
                        // robe los escaneos del panel de compra de inventario.
                        if (!priorityRef.current && _priorityCount > 0) {
                            if (import.meta.env.DEV) console.log('[Scanner] 🚫 Cedido a instancia prioritaria.');
                            if (clearTimer) clearTimeout(clearTimer);
                            reset();
                            return;
                        }

                        // Si un input/textarea sin data-barcode-passthrough tiene foco,
                        // el usuario está llenando un campo de formulario — no agregar al carrito.
                        const active = document.activeElement;
                        const isBlockingInput =
                            active instanceof HTMLInputElement ||
                            active instanceof HTMLTextAreaElement;
                        const hasPassthrough = active?.getAttribute('data-barcode-passthrough') === 'true';
                        if (isBlockingInput && !hasPassthrough) {
                            if (import.meta.env.DEV) console.log('[Scanner] 🚫 Input bloqueante con foco — escaneo ignorado:', active?.getAttribute('name') || active?.id || 'sin nombre');
                            if (clearTimer) clearTimeout(clearTimer);
                            reset();
                            return;
                        }

                        const now2 = Date.now();
                        if (code === _lastFiredCode && now2 - _lastFiredTime < DEDUP_WINDOW_MS) {
                            if (import.meta.env.DEV) console.log('[Scanner] 🔁 Duplicado ignorado (multi-instancia):', code);
                            if (clearTimer) clearTimeout(clearTimer);
                            reset();
                            return;
                        }
                        _lastFiredCode = code;
                        _lastFiredTime = now2;

                        const product = productsRef.current.find(
                            (p: any) => p.barcode && p.barcode.trim() === code.trim()
                        );

                        if (product) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            onMatchRef.current(product);
                        } else {
                            if (import.meta.env.DEV) console.warn('[Scanner] ❌ NO encontrado. Código:', JSON.stringify(code));
                            onNotFoundRef.current?.(code);
                        }
                    } else {
                        if (import.meta.env.DEV) console.warn('[Scanner] ⚠️ Timing demasiado lento:', Math.round(avg), 'ms — umbral:', SCANNER_THRESHOLD_MS, 'ms');
                    }
                } else {
                    if (import.meta.env.DEV) console.warn('[Scanner] ⚠️ Buffer insuficiente:', { length: code.length, timings: timings.length, minLength: MIN_BARCODE_LENGTH });
                }

                if (clearTimer) clearTimeout(clearTimer);
                reset();
                return;
            }

            if (e.key.length === 1) {
                const delta = lastKeyTime > 0 ? now - lastKeyTime : 0;
                if (lastKeyTime > 0) timings.push(delta);
                buffer.push(e.key);
                lastKeyTime = now;
                if (clearTimer) clearTimeout(clearTimer);
                clearTimer = setTimeout(reset, 500);
            }
        };

        if (import.meta.env.DEV) console.log('[Scanner] 🟢 Listener ACTIVO. products cargados:', productsRef.current?.length);
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            if (import.meta.env.DEV) console.log('[Scanner] 🔴 Listener removido.');
            window.removeEventListener('keydown', handleKeyDown, true);
            if (clearTimer) clearTimeout(clearTimer);
        };
    }, [enabled]);
};
