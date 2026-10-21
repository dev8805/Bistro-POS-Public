import React, { useMemo, useState } from 'react';
import { applyUnitConversion } from '../../lib/invoiceScan/unitMatch';
import { formatCurrency, formatQty } from '../../lib/formatters';
import { SCAN_AUTOFOCUS_ATTRIBUTE, SCAN_PRIMARY_ACTION_CLASSES } from './ScanStepShell';

/**
 * Pregunta de equivalencia de empaque (Factor_Conversion): vista interna del
 * Resolutor_Producto, dentro del paso `lineResolver` (Req 9.3, 9.4).
 *
 * Componente presentacional puro. No consume `useInvoiceScanDraft`, no llama a
 * `useProducts` y no hace fetch: recibe por prop la Unidad_OCR leída, la
 * Unidad_Venta y el nombre del producto vinculado, y la cantidad y el costo
 * neto de la línea en términos de la Unidad_OCR. Quien lo cablea es
 * `ScanLineResolverStep`, que a su vez recibe todo de
 * `screens/InvoiceScanScreen.tsx`. Aquí solo se pregunta el factor y se
 * previsualiza el resultado; guardar la equivalencia es trabajo del motor.
 *
 * Reglas del control de continuar:
 *  - Queda `disabled` con `aria-disabled` mientras el factor esté vacío o sea
 *    igual o menor que cero (Req 9.8).
 *  - Un factor igual o menor que cero se rechaza con un mensaje explícito
 *    (Req 9.9).
 *  - Un factor mayor que cero previsualiza la cantidad y el costo por
 *    Unidad_Venta resultantes con `applyUnitConversion` (Req 9.11).
 *
 * NO existe una acción "No sé": la única salida sin factor es "Omitir esta
 * línea", que ofrece el `ScanLineResolverStep`, no este formulario (Req 9.10).
 *
 * Requisitos: 9.3, 9.4, 9.7, 9.8, 9.9, 9.11, 16.6.
 */

export interface ScanUnitEquivalenceFormProps {
    /** Unidad_OCR leída en la factura (por ejemplo "CJ", "BULTO", "ARROBA"). */
    ocrUnit: string;
    /** Unidad_Venta del producto vinculado, con la que se controla el stock. */
    saleUnit: string;
    /** Nombre del producto vinculado o recién creado. */
    productName: string;
    /** Cantidad leída en la factura, expresada en Unidad_OCR. */
    ocrQuantity: number;
    /** Costo_Neto_Linea de la línea (pesos), en términos de la Unidad_OCR. */
    ocrLineTotal: number;
    /** Confirma el Factor_Conversion mayor que cero (Req 9.7, 9.11). */
    onConfirm: (factor: number) => void;
}

const INPUT_BASE_CLASSES =
    'block min-h-[44px] w-full rounded-2xl border bg-white px-4 text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2';

const OK_BORDER_CLASSES = 'border-slate-300 focus:border-amber-400 focus:ring-amber-200';
const ERROR_BORDER_CLASSES = 'border-rose-300 focus:border-rose-500 focus:ring-rose-200';

const ERROR_TEXT_CLASSES = 'mt-1 text-[11px] font-bold leading-snug text-rose-600';
const HINT_TEXT_CLASSES = 'mt-1 text-[11px] font-semibold leading-snug text-slate-500';

/** Marca del campo que recibe el foco al entrar a la vista. */
const AUTOFOCUS_PROPS: Record<string, string> = { [SCAN_AUTOFOCUS_ATTRIBUTE]: '' };

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

/** Costo con hasta 2 decimales, en formato colombiano. */
const formatUnitCost = (value: number): string =>
    roundTo2(value).toLocaleString('es-CO', { maximumFractionDigits: 2 });

/** Deja solo dígitos, punto y coma: el factor puede ser decimal (por ejemplo 0,5). */
const sanitizeFactorInput = (raw: string): string => raw.replace(/[^0-9.,]/g, '');

/** Interpreta el factor tolerando la coma decimal latina; `NaN` si está vacío. */
const parseFactor = (raw: string): number => {
    const normalized = raw.trim().replace(',', '.');
    if (normalized === '') return NaN;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : NaN;
};

export const ScanUnitEquivalenceForm: React.FC<ScanUnitEquivalenceFormProps> = ({
    ocrUnit,
    saleUnit,
    productName,
    ocrQuantity,
    ocrLineTotal,
    onConfirm,
}) => {
    const [rawFactor, setRawFactor] = useState('');
    const [dirty, setDirty] = useState(false);

    const factor = parseFactor(rawFactor);
    const isValid = factor > 0;

    // Previsualización de la conversión: conserva el total y deriva el costo por
    // Unidad_Venta, igual que hará el motor al registrar (Req 9.11).
    const preview = useMemo(
        () => (isValid ? applyUnitConversion(ocrQuantity, ocrLineTotal, factor) : null),
        [isValid, factor, ocrQuantity, ocrLineTotal],
    );

    // El error de "número mayor que cero" solo aparece cuando el Usuario escribió
    // algo inválido; el campo vacío mantiene el continuar bloqueado sin regañar.
    const showError = dirty && rawFactor.trim() !== '' && !isValid;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRawFactor(sanitizeFactorInput(e.target.value));
        setDirty(true);
    };

    const handleConfirm = () => {
        if (!isValid) return;
        onConfirm(factor);
    };

    const handleConfirmKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        handleConfirm();
    };

    const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        handleConfirm();
    };

    return (
        <div className="space-y-4">
            {/* Pregunta que nombra la Unidad_OCR, la Unidad_Venta y el producto (Req 9.3) */}
            <div>
                <h2 className="text-base font-black leading-tight text-slate-900">
                    {`¿Cuántas ${saleUnit} trae una ${ocrUnit} de ${productName}?`}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-snug text-slate-600">
                    {`La factura trae este producto por ${ocrUnit}, pero tú lo manejas por ${saleUnit}. Dinos la equivalencia para que el stock entre correcto.`}
                </p>
            </div>

            {/* Contexto de lo que trae la línea */}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold leading-snug text-slate-600">
                    {`La factura trae `}
                    <span className="font-black text-slate-900">{`${formatQty(ocrQuantity)} ${ocrUnit}`}</span>
                    {` por `}
                    <span className="font-black text-slate-900">{`$${formatCurrency(ocrLineTotal)}`}</span>
                    {`.`}
                </p>
            </div>

            {/* Campo del Factor_Conversion */}
            <div>
                <input
                    id="scan-equivalence-factor"
                    type="text"
                    inputMode="decimal"
                    value={rawFactor}
                    onChange={handleChange}
                    onKeyDown={handleFieldKeyDown}
                    placeholder="0"
                    aria-label={`Cantidad de ${saleUnit} que trae una ${ocrUnit}`}
                    aria-invalid={showError}
                    aria-describedby={showError ? 'scan-equivalence-error' : 'scan-equivalence-hint'}
                    className={`${INPUT_BASE_CLASSES} ${showError ? ERROR_BORDER_CLASSES : OK_BORDER_CLASSES}`}
                    {...AUTOFOCUS_PROPS}
                />
                {showError ? (
                    <p id="scan-equivalence-error" className={ERROR_TEXT_CLASSES}>
                        La equivalencia tiene que ser un número mayor que cero.
                    </p>
                ) : (
                    <p id="scan-equivalence-hint" className={HINT_TEXT_CLASSES}>
                        {`Escribe cuántas ${saleUnit} salen de una ${ocrUnit}.`}
                    </p>
                )}
            </div>

            {/* Previsualización de la cantidad y el costo por Unidad_Venta (Req 9.11) */}
            {preview && (
                <div className="space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800">
                        Así queda la compra
                    </p>
                    <p className="text-sm font-semibold leading-snug text-emerald-900">
                        {`Entran `}
                        <span className="font-black">{`${formatQty(preview.quantity)} ${saleUnit}`}</span>
                        {` al inventario.`}
                    </p>
                    <p className="text-sm font-semibold leading-snug text-emerald-900">
                        {`Costo por ${saleUnit}: `}
                        <span className="font-black">{`$${formatUnitCost(preview.unitCost)}`}</span>
                    </p>
                </div>
            )}

            <button
                type="button"
                onClick={handleConfirm}
                onKeyDown={handleConfirmKeyDown}
                disabled={!isValid}
                aria-disabled={!isValid}
                tabIndex={0}
                aria-label="Confirmar la equivalencia y continuar"
                className={`${SCAN_PRIMARY_ACTION_CLASSES} w-full`}
            >
                Continuar
            </button>
        </div>
    );
};

export default ScanUnitEquivalenceForm;
