import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { parseExcelFile, generateTemplate, ParsedProductRow, ExcelParseResult } from '../lib/excelParser';

export type BulkUploadStep = 'upload' | 'preview' | 'result';

export interface ImportResult {
    created: number;
    skipped: number;
    errors: number;
    newCategories: string[];
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const useBulkUpload = () => {
    const { profile } = useAuth();
    const [step, setStep] = useState<BulkUploadStep>('upload');
    const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [existingCategories, setExistingCategories] = useState<{ id: string; name: string }[]>([]);
    const [existingProductNames, setExistingProductNames] = useState<string[]>([]);

    const fetchExistingData = useCallback(async () => {
        if (!profile?.business_id) return;

        const [catRes, prodRes] = await Promise.all([
            supabase
                .from('categories')
                .select('id, name')
                .eq('business_id', profile.business_id)
                .eq('is_active', true),
            supabase
                .from('products')
                .select('name')
                .eq('business_id', profile.business_id)
                .eq('is_active', true),
        ]);

        if (catRes.data) setExistingCategories(catRes.data);
        if (prodRes.data) setExistingProductNames(prodRes.data.map(p => normalize(p.name)));
    }, [profile?.business_id]);

    const handleParseFile = useCallback(async (file: File) => {
        await fetchExistingData();
        const result = await parseExcelFile(file);

        const productNames = existingProductNames.length > 0
            ? existingProductNames
            : await (async () => {
                if (!profile?.business_id) return [];
                const { data } = await supabase
                    .from('products')
                    .select('name')
                    .eq('business_id', profile.business_id)
                    .eq('is_active', true);
                return (data || []).map(p => normalize(p.name));
            })();

        let duplicatesRemoved = 0;
        result.rows = result.rows.filter(row => {
            const isDup = productNames.includes(normalize(row.name));
            if (isDup) duplicatesRemoved++;
            return !isDup;
        });
        result.totalRows = result.rows.length;
        result.validRows = result.rows.filter(r => r.errors.length === 0).length;
        result.errorRows = result.rows.filter(r => r.errors.length > 0).length;
        result.duplicatesRemoved = duplicatesRemoved;

        setParseResult(result);
        setStep('preview');
    }, [fetchExistingData, existingProductNames, profile?.business_id]);

    const toggleRowInclusion = useCallback((rowNumber: number) => {
        setParseResult(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                rows: prev.rows.map(r =>
                    r.rowNumber === rowNumber ? { ...r, includeInImport: !r.includeInImport } : r
                ),
            };
        });
    }, []);

    const handleImport = useCallback(async () => {
        if (!profile?.business_id || !parseResult) return;
        setImporting(true);

        try {
            const rowsToImport = parseResult.rows.filter(
                r => r.errors.length === 0 && r.includeInImport
            );

            if (rowsToImport.length === 0) {
                setImporting(false);
                return;
            }

            const categoryMap = new Map(existingCategories.map(c => [normalize(c.name), c.id]));
            const newCategoriesCreated: string[] = [];

            const uniqueNewCategories = [...new Set(
                rowsToImport
                    .map(r => r.category)
                    .filter(c => !categoryMap.has(normalize(c)))
            )];

            for (const catName of uniqueNewCategories) {
                const { data, error } = await supabase
                    .from('categories')
                    .insert({ business_id: profile.business_id, name: catName })
                    .select('id, name')
                    .single();

                if (!error && data) {
                    categoryMap.set(normalize(data.name), data.id);
                    newCategoriesCreated.push(data.name);
                }
            }

            const productsToInsert = rowsToImport.map(row => ({
                business_id: profile.business_id,
                name: row.name,
                category_id: categoryMap.get(normalize(row.category)) || null,
                type: row.type,
                price: row.price,
                cost: row.cost,
                stock: row.stock,
                unit: row.unit || 'Und',
                barcode: row.barcode || null,
                nicknames: [],
                is_active: true,
                is_for_sale: true,
                description: row.type === 'service' ? 'Servicio' : 'Producto para venta',
            }));

            const { error: insertError, data: insertedData } = await supabase
                .from('products')
                .insert(productsToInsert)
                .select('id, stock, cost');

            if (!insertError && insertedData && insertedData.length > 0) {
                const lotsToInsert = insertedData
                    .filter(p => p.stock && p.stock > 0)
                    .map(p => ({
                        business_id: profile.business_id,
                        product_id: p.id,
                        initial_quantity: p.stock,
                        remaining_quantity: p.stock,
                        unit_cost: p.cost || 0,
                        notes: 'Stock inicial desde importación excel'
                    }));

                if (lotsToInsert.length > 0) {
                    const { error: lotError } = await supabase
                        .from('inventory_lots')
                        .insert(lotsToInsert);
                    
                    if (lotError) console.error('Error insertando lotes iniciales desde excel:', lotError);
                }
            }


            const created = insertedData?.length || 0;
            const skipped = parseResult.rows.filter(r => !r.includeInImport).length;
            const errors = insertError ? rowsToImport.length : 0;

            setImportResult({
                created,
                skipped,
                errors,
                newCategories: newCategoriesCreated,
            });
            setStep('result');
        } catch (err) {
            console.error('Error importing products:', err);
            setImportResult({ created: 0, skipped: 0, errors: parseResult.rows.length, newCategories: [] });
            setStep('result');
        } finally {
            setImporting(false);
        }
    }, [profile?.business_id, parseResult, existingCategories]);

    const handleDownloadTemplate = useCallback(async () => {
        if (!profile?.business_id) {
            await generateTemplate([]);
            return;
        }

        const { data } = await supabase
            .from('categories')
            .select('name')
            .eq('business_id', profile.business_id)
            .eq('is_active', true)
            .order('name');

        const catNames = (data || []).map(c => c.name);
        await generateTemplate(catNames);
    }, [profile?.business_id]);

    const reset = useCallback(() => {
        setStep('upload');
        setParseResult(null);
        setImportResult(null);
    }, []);

    return {
        step,
        parseResult,
        importing,
        importResult,
        handleParseFile,
        handleImport,
        handleDownloadTemplate,
        toggleRowInclusion,
        reset,
    };
};
