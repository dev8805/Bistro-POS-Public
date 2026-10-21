/**
 * Valida formato de código de barras.
 * Retorna true si la cadena es vacía (barcode opcional) o contiene
 * exclusivamente entre 8 y 14 dígitos numéricos (EAN-8, EAN-13, UPC-A, ITF-14).
 */
export const isValidBarcode = (code: string): boolean => {
  if (code === '') return true;
  return /^\d{8,14}$/.test(code);
};
