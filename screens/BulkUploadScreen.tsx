import React, { useRef, useState } from 'react';
import { Screen } from '../types';
import { useBulkUpload } from '../hooks/useBulkUpload';
import { AppButton } from '../components/ui/AppButton';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../lib/formatters';

interface BulkUploadScreenProps {
    onNavigate: (screen: Screen) => void;
}

export const BulkUploadScreen: React.FC<BulkUploadScreenProps> = ({ onNavigate }) => {
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);

    const {
        step,
        parseResult,
        importing,
        importResult,
        handleParseFile,
        handleImport,
        handleDownloadTemplate,
        toggleRowInclusion,
        reset,
    } = useBulkUpload();

    const handleFileChange = async (file: File | null) => {
        if (!file) return;
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
        ];
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!validTypes.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(ext || '')) {
            setParseError('Formato no válido. Use archivos .xlsx, .xls o .csv');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setParseError('El archivo es muy grande. Máximo 2MB.');
            return;
        }

        setParseError(null);
        try {
            await handleParseFile(file);
        } catch (err: any) {
            setParseError(err.message || 'Error al procesar el archivo');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        handleFileChange(file);
    };

    const readyCount = parseResult?.rows.filter(r => r.errors.length === 0 && r.includeInImport).length || 0;
    const errorCount = parseResult?.rows.filter(r => r.errors.length > 0).length || 0;
    const dupCount = parseResult?.duplicatesRemoved || 0;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" role="button" tabIndex={-1} onClick={() => onNavigate(Screen.PRODUCTS)} onKeyDown={(e) => e.key === 'Escape' && onNavigate(Screen.PRODUCTS)} aria-label="Cerrar"></div>
            <div className="relative w-full max-w-md h-full bg-background-light dark:bg-background-dark shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out] border-l border-gray-200 dark:border-gray-800">
            <header className="h-16 shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <h1 className="text-lg md:text-xl font-semibold text-text-main dark:text-white tracking-tight">
                        Importar Productos
                    </h1>
                </div>
                <button
                    type="button"
                    onClick={() => onNavigate(Screen.PRODUCTS)}
                    className="p-2 rounded-xl text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                    aria-label="Cerrar modal"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-gray-50 dark:bg-background-dark">
                <div className="flex flex-col">

                    {step === 'upload' && (
                        <div className="space-y-6">
                            <div
                                className={`border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all cursor-pointer ${dragOver
                                        ? 'border-primary bg-primary/5 scale-[1.01]'
                                        : 'border-gray-300 dark:border-gray-700 hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                role="button"
                                tabIndex={0}
                                aria-label="Zona para subir archivo Excel"
                                onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                                />
                                <span className="material-symbols-outlined text-5xl text-gray-400 dark:text-gray-500 mb-4 block">
                                    upload_file
                                </span>
                                <p className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                    Arrastra tu archivo aquí o haz clic para seleccionar
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Formatos: .xlsx, .xls, .csv — Máximo 500 filas, 2MB
                                </p>
                            </div>

                            {parseError && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-500">error</span>
                                    <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p>
                                </div>
                            )}

                            <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-xl">description</span>
                                    ¿No tienes un archivo listo?
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                    Descarga nuestra plantilla de ejemplo con las columnas correctas. Si ya tienes categorías creadas, se incluirán como referencia.
                                </p>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="h-10 px-5 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
                                    type="button"
                                >
                                    <span className="material-symbols-outlined text-lg">download</span>
                                    Descargar Plantilla
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && parseResult && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium border border-green-200 dark:border-green-800">
                                    <span className="material-symbols-outlined text-base">check_circle</span>
                                    {readyCount} listos
                                </div>
                                {errorCount > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800">
                                        <span className="material-symbols-outlined text-base">error</span>
                                        {errorCount} con errores
                                    </div>
                                )}
                                {dupCount > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium border border-blue-200 dark:border-blue-800">
                                        <span className="material-symbols-outlined text-base">info</span>
                                        {dupCount} {dupCount === 1 ? 'omitido por ya existir' : 'omitidos por ya existir'}
                                    </div>
                                )}
                            </div>

                            <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400 font-bold tracking-wider">
                                                <th className="px-3 py-2.5 w-10">#</th>
                                                <th className="px-3 py-2.5 w-10">
                                                    <span className="sr-only">Incluir</span>
                                                </th>
                                                <th className="px-3 py-2.5">Nombre</th>
                                                <th className="px-3 py-2.5">Categoría</th>
                                                <th className="px-3 py-2.5">Tipo</th>
                                                <th className="px-3 py-2.5 text-right">Precio</th>
                                                <th className="px-3 py-2.5 text-right">Costo</th>
                                                <th className="px-3 py-2.5 text-right">Stock</th>
                                                <th className="px-3 py-2.5">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {parseResult.rows.map((row) => {
                                                const hasError = row.errors.length > 0;
                                                const rowBg = hasError
                                                    ? 'bg-red-50/50 dark:bg-red-900/10'
                                                    : row.isDuplicate
                                                        ? 'bg-yellow-50/50 dark:bg-yellow-900/10'
                                                        : '';

                                                return (
                                                    <tr key={row.rowNumber} className={`${rowBg} transition-colors`}>
                                                        <td className="px-3 py-2.5 text-gray-400 text-xs font-mono">{row.rowNumber}</td>
                                                        <td className="px-3 py-2.5">
                                                            {!hasError && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={row.includeInImport}
                                                                    onChange={() => toggleRowInclusion(row.rowNumber)}
                                                                    className="size-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                                    aria-label={`Incluir ${row.name}`}
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">
                                                            {row.name || <span className="text-red-400 italic">Vacío</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 max-w-[120px] truncate">
                                                            {row.category || <span className="text-red-400 italic">Vacío</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${row.type === 'service'
                                                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                                    : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                }`}>
                                                                {row.type === 'service' ? 'Servicio' : 'Producto'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-white">
                                                            ${formatCurrency(row.price)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                                                            ${formatCurrency(row.cost)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                                                            {row.stock !== null ? row.stock : '-'}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            {hasError ? (
                                                                <span className="text-red-600 dark:text-red-400 text-xs" title={row.errors.join(', ')}>
                                                                    {row.errors[0]}
                                                                </span>
                                                            ) : row.isDuplicate ? (
                                                                <span className="text-yellow-600 dark:text-yellow-400 text-xs">
                                                                    Ya existe
                                                                </span>
                                                            ) : (
                                                                <span className="text-green-600 dark:text-green-400 text-xs">Listo</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={() => { reset(); setParseError(null); }}
                                    className="h-10 px-5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    type="button"
                                >
                                    Cancelar
                                </button>
                                <AppButton
                                    isLoading={importing}
                                    onClick={handleImport}
                                    disabled={readyCount === 0}
                                    className="h-10 px-6 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    type="button"
                                >
                                    Importar {readyCount} producto{readyCount !== 1 ? 's' : ''}
                                </AppButton>
                            </div>
                        </div>
                    )}

                    {step === 'result' && importResult && (
                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                            <div className={`size-20 rounded-full flex items-center justify-center ${importResult.errors > 0
                                    ? 'bg-red-100 dark:bg-red-900/30'
                                    : 'bg-green-100 dark:bg-green-900/30'
                                }`}>
                                <span className={`material-symbols-outlined text-4xl ${importResult.errors > 0
                                        ? 'text-red-500'
                                        : 'text-green-500'
                                    }`}>
                                    {importResult.errors > 0 ? 'error' : 'check_circle'}
                                </span>
                            </div>

                            <div>
                                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                                    {importResult.errors > 0 ? 'Importación con errores' : '¡Importación exitosa!'}
                                </h2>
                                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                    {importResult.created > 0 && (
                                        <p className="text-green-600 dark:text-green-400 font-medium">
                                            ✓ {importResult.created} producto{importResult.created !== 1 ? 's' : ''} creado{importResult.created !== 1 ? 's' : ''}
                                        </p>
                                    )}
                                    {importResult.newCategories.length > 0 && (
                                        <p className="text-blue-600 dark:text-blue-400">
                                            + {importResult.newCategories.length} categoría{importResult.newCategories.length !== 1 ? 's' : ''} nueva{importResult.newCategories.length !== 1 ? 's' : ''}: {importResult.newCategories.join(', ')}
                                        </p>
                                    )}
                                    {importResult.skipped > 0 && (
                                        <p className="text-yellow-600 dark:text-yellow-400">
                                            ⊘ {importResult.skipped} omitido{importResult.skipped !== 1 ? 's' : ''}
                                        </p>
                                    )}
                                    {importResult.errors > 0 && (
                                        <p className="text-red-600 dark:text-red-400">
                                            ✗ {importResult.errors} error{importResult.errors !== 1 ? 'es' : ''}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => { reset(); setParseError(null); }}
                                    className="h-10 px-5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    type="button"
                                >
                                    Importar más
                                </button>
                                <button
                                    onClick={() => onNavigate(Screen.PRODUCTS)}
                                    className="h-10 px-6 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg font-semibold text-sm transition-colors"
                                    type="button"
                                >
                                    Ir a Productos
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
        </div>
    );
};
