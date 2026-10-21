export const prefetchUIAssets = async () => {
    if (!('caches' in window)) return;

    // 1. Tailwind CDN
    try {
        const twCache = await caches.open('tailwind-cdn');
        const twUrl = "https://cdn.tailwindcss.com?plugins=forms,container-queries";
        const existingTw = await twCache.match(twUrl);

        if (!existingTw) {
            // Usamos no-cors porque es un CDN opaco
            const twRes = await fetch(twUrl, { mode: 'no-cors' });
            await twCache.put(twUrl, twRes);
            console.log('[Prefetch UI] Tailwind CDN cacheado exitosamente');
        }
    } catch (error) {
        console.warn('[Prefetch UI] Error cacheando Tailwind:', error);
    }

    // 2. Google Fonts CSS y resolucion recursiva de WOFF2
    try {
        const fontUrls = [
            "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap",
            "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
        ];

        const fontCache = await caches.open('google-fonts');

        for (const url of fontUrls) {
            const existing = await fontCache.match(url);
            if (!existing) {
                // Pedimos el CSS como texto para poder parsearlo
                const req = new Request(url, { headers: { 'Accept': 'text/css' } });
                const res = await fetch(req);

                if (res.ok) {
                    // Clonamos la respuesta: una va al cache, la otra la leemos
                    await fontCache.put(url, res.clone());

                    // Leer texto del CSS
                    const text = await res.text();

                    // Extraer todas las URLs de archivos .woff2 dentro de url(...)
                    // Ejemplo: url(https://fonts.gstatic.com/s/plusjakartasans/v8/LDI...)
                    const woff2Urls = Array.from(text.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g))
                        .map(match => match[1]);

                    let count = 0;
                    for (let woff2 of woff2Urls) {
                        // Limpiar comillas si las tiene
                        woff2 = woff2.replace(/['"]/g, '');

                        const existingWoff = await fontCache.match(woff2);
                        if (!existingWoff) {
                            const wRes = await fetch(woff2, { mode: 'cors' });
                            if (wRes.ok) {
                                await fontCache.put(woff2, wRes);
                                count++;
                            }
                        }
                    }
                    console.log(`[Prefetch UI] Fuentes cacheadas: CSS + ${count} archivos WOFF2.`);
                }
            }
        }
    } catch (error) {
        console.warn('[Prefetch UI] Error cacheando Google Fonts:', error);
    }
};
