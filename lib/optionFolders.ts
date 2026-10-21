import { CustomizableOption, OptionFolder, ModifierProduct } from '../types';

// Type guard: distingue una carpeta de los demás elementos.
export const isFolder = (item: CustomizableOption): item is OptionFolder =>
  typeof item === 'object' && item !== null && 'options' in item;

// Type guard: producto suelto (add-on fuera de carpeta). Tiene `id` y NO tiene `options`.
export const isProductOption = (item: CustomizableOption): item is ModifierProduct =>
  typeof item === 'object' && item !== null && 'id' in item && !('options' in item);

// Devuelve TODOS los nombres de etiqueta de texto (sueltas + dentro de carpetas) como lista plana.
// Los productos (sueltos o en carpetas) NO son etiquetas de texto, se omiten.
export const flattenOptions = (opts: CustomizableOption[] = []): string[] =>
  opts.flatMap(item => (isFolder(item) ? item.options : isProductOption(item) ? [] : [item]));

// Separa el array mixto en etiquetas sueltas, carpetas y productos sueltos, para renderizar.
export const splitOptions = (
  opts: CustomizableOption[] = []
): { loose: string[]; folders: OptionFolder[]; products: ModifierProduct[] } => {
  const loose: string[] = [];
  const folders: OptionFolder[] = [];
  const products: ModifierProduct[] = [];
  for (const item of opts) {
    if (isFolder(item)) folders.push(item);
    else if (isProductOption(item)) products.push(item);
    else loose.push(item);
  }
  return { loose, folders, products };
};
