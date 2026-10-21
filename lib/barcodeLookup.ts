import { supabase } from './supabase';

export interface BarcodeResult {
    barcode: string;
    productName: string;
    brand: string | null;
    quantity: string | null;
    imageUrl: string | null; // Siempre null desde esta feature. Preservado por compatibilidad de tipo. Ver design.md > Overview.
    source: 'supabase' | 'ean-db'; 
}

const formatDisplayName = (name: string, brand: string | null, quantity: string | null): string => {
    let display = name.trim();

    if (brand && !display.toLowerCase().includes(brand.toLowerCase())) {
        display = `${brand} ${display}`;
    }

    if (quantity) {
        display = `${display} ${quantity}`;
    }

    return display.replace(/\s+/g, ' ').trim();
};

const lookupInSupabase = async (barcode: string): Promise<BarcodeResult | null> => {
    const { data, error } = await supabase
        .from('barcode_catalog')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle();

    if (error || !data) return null;

    return {
        barcode: data.barcode,
        productName: formatDisplayName(data.product_name, data.brand, data.quantity),
        brand: data.brand,
        quantity: data.quantity,
        imageUrl: null,
        source: 'supabase',
    };
};

const getEANDBTokens = (): string[] => {
    const tokensStr = import.meta.env.VITE_EANDB_TOKENS || '';
    return tokensStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

const lookupInGoUPC = async (barcode: string): Promise<BarcodeResult | null> => {
    try {
        const apiKey = import.meta.env.VITE_GOUPC_API_KEY || '';
        
        if (!apiKey) {
            console.warn('[barcodeLookup] No se configuró VITE_GOUPC_API_KEY en .env');
            return null;
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/barcode-lookup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
            },
            body: JSON.stringify({ barcode, apiKeys: [apiKey] }),
        });

        if (response.status === 404) return null;
        if (response.status === 429) {
            console.warn('[barcodeLookup] Cuota de Go-UPC agotada.');
            return null;
        }
        if (!response.ok) return null;

        const data = await response.json();

        // Go-UPC devuelve { product: { name, brand, imageUrl, ... } }
        const product = data?.product;
        if (!product?.name) return null;

        const productName = product.name;
        const brand = product.brand || null;
        const quantity = null;

        await saveToCatalog(barcode, productName, brand, quantity, null);

        return {
            barcode,
            productName: formatDisplayName(productName, brand, quantity),
            brand,
            quantity,
            imageUrl: null,
            source: 'ean-db', // mantenemos el tipo existente para no romper la interfaz
        };
    } catch (err) {
        console.error('[barcodeLookup] Error procesando Go-UPC:', err);
        return null;
    }
};

const saveToCatalog = async (
    barcode: string,
    productName: string,
    brand: string | null,
    quantity: string | null,
    imageUrl: string | null,
    source: 'ean-db' | 'user' = 'ean-db'
) => {
    const { error } = await supabase
        .from('barcode_catalog')
        .upsert(
            {
                barcode,
                product_name: productName,
                brand,
                quantity,
                image_url: imageUrl,
                source,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'barcode' }
        );

    if (error) {
        console.error('[barcodeLookup] Error guardando en Supabase:', error);
    }
};

export const saveProductToBarcodeCatalog = async (
    barcode: string,
    productName: string
) => {
    // El nombre del usuario siempre manda: él sabe cómo vende su producto.
    // Nunca propagamos su imagen al catálogo global (ver design.md R7.4).
    // brand/quantity quedan en null porque productName ya es el nombre de
    // display final (evita doble prefijo en futuros lookups).
    await saveToCatalog(barcode, productName, null, null, null, 'user');
};

export const lookupBarcode = async (barcode: string): Promise<BarcodeResult | null> => {
    const trimmed = barcode.trim();
    if (trimmed.length < 4) return null;

    // Paso 1: Intentar caché maestro local
    const supabaseResult = await lookupInSupabase(trimmed);
    if (supabaseResult) return supabaseResult;

    // Paso 2: Intentar Go-UPC (proxy via Edge Function para evitar CORS)
    const goupcResult = await lookupInGoUPC(trimmed);
    if (goupcResult) return goupcResult;

    return null;
};
