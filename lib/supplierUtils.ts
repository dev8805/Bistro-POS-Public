/**
 * Utilidades para la asociación producto-proveedor.
 * Usadas en ProductsScreen para filtrar productos por proveedor seleccionado.
 */

/**
 * Normaliza el nombre de un proveedor para comparaciones consistentes.
 * Elimina espacios laterales y convierte a minúsculas.
 */
export const normalizeSupplierName = (name: string): string => {
  return name.trim().toLowerCase();
};

/**
 * Determina si un producto pertenece a un proveedor dado,
 * evaluando tres fuentes independientes con lógica OR:
 *
 * 1. default_supplier_id del producto coincide con el proveedor
 * 2. El producto tiene lotes activos de este proveedor (por supplier_id)
 * 3. El producto está vinculado manualmente en supplier_product_config
 */
export const isProductOfSupplier = (
  productId: string,
  supplierId: string,
  defaultSupplierId: string | null,
  lotSupplierMap: Record<string, string[]>,
  manualLinks: string[]
): boolean => {
  // Fuente 1: default_supplier_id
  if (defaultSupplierId === supplierId) return true;

  // Fuente 2: lotes activos con supplier_id que coincide
  const lotSupplierIds = lotSupplierMap[productId] || [];
  if (lotSupplierIds.includes(supplierId)) return true;

  // Fuente 3: vinculación manual en supplier_product_config
  if (manualLinks.includes(productId)) return true;

  return false;
};

