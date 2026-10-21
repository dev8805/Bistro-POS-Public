import * as XLSX from 'xlsx';

export interface ParsedProductRow {
    rowNumber: number;
    name: string;
    category: string;
    type: 'simple' | 'service';
    price: number;
    cost: number;
    stock: number | null;
    unit: string;
    barcode?: string;
    errors: string[];
    isDuplicate?: boolean;
    includeInImport?: boolean;
}

export interface ExcelParseResult {
    rows: ParsedProductRow[];
    totalRows: number;
    validRows: number;
    errorRows: number;
    duplicatesRemoved?: number;
}

const COLUMN_MAP: Record<string, string> = {
    'nombre': 'name',
    'categoría': 'category',
    'categoria': 'category',
    'tipo': 'type',
    'precio_venta': 'price',
    'precio venta': 'price',
    'precio': 'price',
    'costo': 'cost',
    'stock_inicial': 'stock',
    'stock inicial': 'stock',
    'stock': 'stock',
    'unidad_venta': 'unit',
    'unidad venta': 'unit',
    'unidad': 'unit',
    'barcode': 'barcode',
    'codigo_barras': 'barcode',
    'código de barras': 'barcode',
    'codigo de barras': 'barcode',
};

const TYPE_MAP: Record<string, 'simple' | 'service'> = {
    'producto': 'simple',
    'simple': 'simple',
    'servicio': 'service',
    'service': 'service',
};

const sanitizeString = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

const capitalize = (s: string): string => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const parseNumericValue = (value: unknown): number => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(/[$.,%\s]/g, '').replace(/,/g, '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
};

export const parseExcelFile = (file: File): Promise<ExcelParseResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

                if (jsonData.length === 0) {
                    resolve({ rows: [], totalRows: 0, validRows: 0, errorRows: 0 });
                    return;
                }

                const originalHeaders = Object.keys(jsonData[0]);
                const headerMap: Record<string, string> = {};

                originalHeaders.forEach(header => {
                    const normalized = header.toLowerCase().trim();
                    if (COLUMN_MAP[normalized]) {
                        headerMap[header] = COLUMN_MAP[normalized];
                    }
                });

                const rows: ParsedProductRow[] = jsonData.map((row, index) => {
                    const mapped: Record<string, unknown> = {};
                    Object.entries(row).forEach(([key, value]) => {
                        const mappedKey = headerMap[key];
                        if (mappedKey) mapped[mappedKey] = value;
                    });

                    const errors: string[] = [];
                    const name = capitalize(sanitizeString(mapped.name));
                    const category = capitalize(sanitizeString(mapped.category));
                    const cost = parseNumericValue(mapped.cost);

                    if (!name) errors.push('Nombre es obligatorio');
                    if (!category) errors.push('Categoría es obligatoria');
                    if (cost <= 0 && sanitizeString(mapped.type) !== 'servicio' && sanitizeString(mapped.type) !== 'service') {
                        errors.push('Costo debe ser mayor a 0');
                    }

                    const rawType = sanitizeString(mapped.type).toLowerCase();
                    const type = TYPE_MAP[rawType] || 'simple';

                    const stockVal = mapped.stock;
                    const stock = (stockVal === '' || stockVal === null || stockVal === undefined)
                        ? null
                        : parseNumericValue(stockVal);

                    const rawUnit = sanitizeString(mapped.unit);
                    let unitValue = 'Unidad';
                    if (rawUnit) {
                        const matched = VALID_UNITS.find(u => u.toLowerCase() === rawUnit.toLowerCase());
                        if (matched) {
                            unitValue = matched;
                        } else {
                            errors.push(`Unidad "${rawUnit}" no válida. Ver hoja "Unidades".`);
                        }
                    }

                    return {
                        rowNumber: index + 2,
                        name,
                        category,
                        type,
                        price: parseNumericValue(mapped.price),
                        cost,
                        stock,
                        unit: unitValue,
                        barcode: sanitizeString(mapped.barcode) || undefined,
                        errors,
                        includeInImport: true,
                    };
                });

                const validRows = rows.filter(r => r.errors.length === 0).length;
                const errorRows = rows.filter(r => r.errors.length > 0).length;

                resolve({
                    rows,
                    totalRows: rows.length,
                    validRows,
                    errorRows,
                });
            } catch (err) {
                reject(new Error('Error al leer el archivo. Asegúrese de que sea un archivo Excel válido.'));
            }
        };

        reader.onerror = () => reject(new Error('Error al leer el archivo'));
        reader.readAsArrayBuffer(file);
    });
};

export const VALID_UNITS = [
    'Unidad', 'Kilogramos', 'Libras', 'Gramos', 'Onzas',
    'Arrobas', 'Litros', 'Mililitros', 'Galones', 'Metros'
];

export const generateTemplate = async (existingCategories: string[] = []): Promise<void> => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet('Productos');
    const headers = ['Nombre', 'Categoría', 'Tipo', 'Precio_venta', 'Costo', 'Stock_inicial', 'Unidad_venta', 'Codigo de barras'];
    ws.addRow(headers);

    ws.columns = [
        { width: 28 }, { width: 16 }, { width: 13 }, { width: 15 }, { width: 12 },
        { width: 15 }, { width: 16 }, { width: 18 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    ws.columns.forEach(col => {
        (col as any).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    ws.getColumn(1).numFmt = '@';

    const MAX_ROWS = 500;
    for (let i = 2; i <= MAX_ROWS; i++) {
        ws.getCell(`C${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"producto,servicio"'],
            showErrorMessage: true,
            errorTitle: 'Tipo no válido',
            error: 'Seleccione "producto" o "servicio"',
        };

        ws.getCell(`G${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${VALID_UNITS.join(',')}"`],
            showErrorMessage: true,
            errorTitle: 'Unidad no válida',
            error: 'Seleccione una unidad de la lista',
        };
    }

    const instrWs = wb.addWorksheet('Instrucciones');
    instrWs.columns = [{ width: 22 }, { width: 62 }];
    instrWs.addRow(['Campo', 'Descripción']);
    instrWs.getRow(1).font = { bold: true };
    instrWs.addRows([
        ['nombre *', 'Nombre del producto (obligatorio)'],
        ['categoría *', 'Nombre de la categoría. Si no existe, se crea automáticamente.'],
        ['tipo', '"producto" (por defecto) o "servicio". Seleccionable en la hoja Productos.'],
        ['precio_venta', 'Precio de venta al público. Si está vacío, se usa 0.'],
        ['costo *', 'Costo unitario del producto (obligatorio para productos)'],
        ['stock_inicial', 'Cantidad inicial en inventario. Vacío si no aplica.'],
        ['unidad_venta', 'Seleccionable en la hoja Productos. Por defecto: Unidad.'],
    ]);

    if (existingCategories.length > 0) {
        const catWs = wb.addWorksheet('Categorías');
        catWs.columns = [{ width: 28 }];
        catWs.addRow(['Categorías existentes']);
        catWs.getRow(1).font = { bold: true };
        existingCategories.forEach(c => catWs.addRow([c]));
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_productos.xlsx';
    a.click();
    URL.revokeObjectURL(url);
};
