const CACHE_NAME = 'supabase-product-images';
const BATCH_SIZE = 5;

export const prefetchProductImages = async (
    products: { image_url?: string; image?: string }[]
): Promise<void> => {
    if (!('caches' in window) || !navigator.onLine) return;

    const urls = [
        ...new Set(
            products
                .map(p => p.image_url || p.image || '')
                .filter(url => url.startsWith('http'))
        ),
    ];

    if (urls.length === 0) return;

    let cache: Cache;
    try {
        cache = await caches.open(CACHE_NAME);
    } catch {
        return;
    }

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
            batch.map(async (url) => {
                const existing = await cache.match(url);
                if (existing) return;

                const response = await fetch(url, { mode: 'cors' });
                if (response.ok) {
                    await cache.put(url, response);
                }
            })
        );
    }
};
