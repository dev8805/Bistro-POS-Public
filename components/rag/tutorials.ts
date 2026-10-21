// Configuración curada de tutoriales del asistente IA.
// El contenido se empaqueta en build mediante importación `?raw` de Vite,
// por lo que mostrar un tutorial no requiere red ni consumo de tokens.
//
// Agregar un tutorial = añadir un `import ... ?raw` y una entrada al arreglo
// TUTORIALS. El orden del arreglo es el orden de render (Req 1.3, 5.2).

import comoCrearProductos from '../../docs/guias_usuario/como_crear_productos.md?raw';
import comoHacerVenta from '../../docs/guias_usuario/como_hacer_una_venta.md?raw';
import comoConfigurarImpresora from '../../docs/guias_usuario/como_configurar_impresora.md?raw';
import comoAnularODevolverUnaVenta from '../../docs/guias_usuario/como_anular_o_devolver_una_venta.md?raw';
import comoConfigurarModificadoresDeProducto from '../../docs/guias_usuario/como_configurar_modificadores_de_producto.md?raw';
import comoCrearRecetas from '../../docs/guias_usuario/como_crear_recetas.md?raw';
import comoEditarPerfil from '../../docs/guias_usuario/como_editar_perfil.md?raw';
import comoEtiquetarComandaConBotonPedido from '../../docs/guias_usuario/como_etiquetar_comanda_con_boton_pedido.md?raw';
import comoFuncionanLosLotes from '../../docs/guias_usuario/como_funcionan_los_lotes.md?raw';
import comoGestionarDeudasNegocio from '../../docs/guias_usuario/como_gestionar_deudas_negocio.md?raw';
import comoGestionarEmpleados from '../../docs/guias_usuario/como_gestionar_empleados.md?raw';
import comoGestionarInventario from '../../docs/guias_usuario/como_gestionar_inventario.md?raw';
import comoManejarClientesCredito from '../../docs/guias_usuario/como_manejar_clientes_credito.md?raw';
import comoRegistrarCompraInventarioConIa from '../../docs/guias_usuario/como_registrar_compra_inventario_con_ia.md?raw';
import comoRegistrarUnGasto from '../../docs/guias_usuario/como_registrar_un_gasto.md?raw';
import comoUsarElModoOffline from '../../docs/guias_usuario/como_usar_el_modo_offline.md?raw';
import comoUsarHistorialDeVentas from '../../docs/guias_usuario/como_usar_historial_de_ventas.md?raw';
import comoUsarVisorEventos from '../../docs/guias_usuario/como_usar_visor_eventos.md?raw';
import comoVerElDashboard from '../../docs/guias_usuario/como_ver_el_dashboard.md?raw';
import recomendaciones from '../../docs/guias_usuario/recomendaciones.md?raw';



export interface TutorialConfig {
  id: string; // identificador único y estable
  title: string; // título visible en la lista y en la burbuja de usuario
  content: string; // markdown completo de la guía (import ?raw)
}

/**
 * Recorta la sección "## Recursos multimedia" de una guía antes de mostrarla.
 * Esa sección es una nota interna para el desarrollador (sugerencias de GIF /
 * imágenes para enriquecer el Asistente IA) y NO debe verse en producción al
 * abrir un tutorial. Se elimina desde el encabezado hasta el final, incluyendo
 * el separador `---` y las líneas en blanco que lo preceden.
 */
export const stripDevMultimediaSection = (markdown: string): string => {
  const lines = markdown.split('\n');
  const headingIdx = lines.findIndex((line) => /^##\s+Recursos multimedia/i.test(line));
  if (headingIdx === -1) return markdown;

  let end = headingIdx;
  // Retroceder sobre líneas en blanco previas al encabezado.
  while (end > 0 && lines[end - 1].trim() === '') end--;
  // Quitar el separador `---` que suele preceder a la sección.
  if (end > 0 && /^-{3,}$/.test(lines[end - 1].trim())) {
    end--;
    while (end > 0 && lines[end - 1].trim() === '') end--;
  }

  return `${lines.slice(0, end).join('\n').trimEnd()}\n`;
};

export const TUTORIALS: TutorialConfig[] = [
  { id: 'crear-productos', title: 'Cómo crear productos', content: comoCrearProductos },
  { id: 'hacer-venta', title: 'Cómo hacer una venta', content: comoHacerVenta },
  { id: 'configurar-impresora', title: 'Cómo configurar la impresora', content: comoConfigurarImpresora },
  { id: 'anular-o-devolver-venta', title: 'Cómo anular o devolver una venta', content: comoAnularODevolverUnaVenta },
  { id: 'configurar-modificadores', title: 'Cómo organizar etiquetas en carpetas', content: comoConfigurarModificadoresDeProducto },
  { id: 'crear-recetas', title: 'Cómo crear recetas (productos preparados)', content: comoCrearRecetas },
  { id: 'editar-perfil', title: 'Cómo editar tu perfil', content: comoEditarPerfil },
  { id: 'etiquetar-comanda', title: 'Cómo etiquetar la comanda con el botón Pedido', content: comoEtiquetarComandaConBotonPedido },
  { id: 'lotes-inventario', title: 'Cómo funcionan los lotes de inventario', content: comoFuncionanLosLotes },
  { id: 'deudas-negocio', title: 'Cómo gestionar las deudas del negocio', content: comoGestionarDeudasNegocio },
  { id: 'gestionar-empleados', title: 'Cómo gestionar empleados', content: comoGestionarEmpleados },
  { id: 'gestionar-inventario', title: 'Cómo gestionar inventario y alertas de stock', content: comoGestionarInventario },
  { id: 'clientes-credito', title: 'Cómo manejar clientes con crédito (fiado)', content: comoManejarClientesCredito },
  { id: 'registrar-compra-ia', title: 'Cómo registrar compra de inventario con IA', content: comoRegistrarCompraInventarioConIa },
  { id: 'registrar-gasto', title: 'Cómo registrar un gasto', content: comoRegistrarUnGasto },
  { id: 'modo-offline', title: 'Cómo usar Bistro sin internet (Modo Offline)', content: comoUsarElModoOffline },
  { id: 'historial-ventas', title: 'Cómo ver las ventas del día y del historial', content: comoUsarHistorialDeVentas },
  { id: 'visor-eventos', title: 'Cómo usar el visor de eventos', content: comoUsarVisorEventos },
  { id: 'dashboard', title: 'Cómo ver el Dashboard', content: comoVerElDashboard },
  { id: 'recomendaciones', title: 'Recomendaciones para usar Bistro correctamente', content: recomendaciones },
];

// Detección de IDs duplicados como error de configuración (Req 5.4).
// Se ejecuta una vez al cargar el módulo: en DEV lanza para que el error sea
// visible; en producción registra el error y continúa con la primera aparición.
const seenIds = new Set<string>();
for (const tutorial of TUTORIALS) {
  if (seenIds.has(tutorial.id)) {
    const message = `[tutorials] ID de tutorial duplicado: "${tutorial.id}"`;
    if (import.meta.env.DEV) throw new Error(message);
    console.error(message);
  } else {
    seenIds.add(tutorial.id);
  }
}

// ---------------------------------------------------------------------------
// Helpers dev-only: overlay de localStorage y generación de snippet.
// Todo lo de abajo solo se usa cuando `import.meta.env.DEV` es true; en
// producción la rama que lo invoca es `false`, por lo que el bundler lo elimina.
// ---------------------------------------------------------------------------

export interface DevTutorialEntry {
  id: string; // slug único de la entrada, derivado del sourceFile o del título
  title: string; // título definido por el desarrollador en el panel
  sourceFile: string; // nombre del archivo .md en docs/guias_usuario/
}

const DEV_TUTORIALS_STORAGE_KEY = 'bistro:dev-tutorials';

// Mapa { ruta → contenido markdown } de todas las guías, resuelto en build.
// Se usa para obtener el `content` real de una entrada del overlay a partir de
// su `sourceFile`, sin duplicar el markdown pesado en localStorage.
const guidesGlob = import.meta.glob('../../docs/guias_usuario/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const resolveContentBySourceFile = (sourceFile: string): string | undefined => {
  const matchKey = Object.keys(guidesGlob).find((path) => path.endsWith(`/${sourceFile}`));
  return matchKey ? guidesGlob[matchKey] : undefined;
};

/**
 * Lee el overlay de tutoriales de localStorage y resuelve el `content` de cada
 * entrada desde el glob de guías. Ante cualquier error de acceso o parseo
 * retorna un overlay vacío (con `console.warn`). Solo debe usarse en DEV.
 */
export const getDevOverlay = (): TutorialConfig[] => {
  try {
    const raw = localStorage.getItem(DEV_TUTORIALS_STORAGE_KEY);
    if (!raw) return [];

    const entries = JSON.parse(raw) as DevTutorialEntry[];
    if (!Array.isArray(entries)) return [];

    return entries.reduce<TutorialConfig[]>((acc, entry) => {
      const content = resolveContentBySourceFile(entry.sourceFile);
      if (content === undefined) return acc;
      // Dedup defensivo: si localStorage viene con duplicados heredados de una
      // versión previa del helper, conservamos la primera aparición por `id`.
      if (acc.some((t) => t.id === entry.id)) return acc;
      acc.push({ id: entry.id, title: entry.title, content });
      return acc;
    }, []);
  } catch (error) {
    console.warn('[tutorials] No se pudo leer el overlay de localStorage:', error);
    return [];
  }
};

/**
 * Persiste una entrada en el overlay de localStorage. Si ya existe una entrada
 * con el mismo `id`, la reemplaza en su posición actual (dedup por id); si no,
 * la agrega al final. Ante fallos de acceso registra `console.warn` sin
 * interrumpir. Solo debe usarse en DEV.
 */
export const addDevOverlayEntry = (entry: DevTutorialEntry): void => {
  try {
    const raw = localStorage.getItem(DEV_TUTORIALS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DevTutorialEntry[]) : [];
    const current = Array.isArray(parsed) ? parsed : [];

    // Deduplicación por id: si ya existe una entrada con este id, la
    // reemplazamos en su posición actual. Si no, la agregamos al final.
    const existingIdx = current.findIndex((e) => e.id === entry.id);
    const next = existingIdx >= 0
      ? current.map((e, i) => (i === existingIdx ? entry : e))
      : [...current, entry];

    localStorage.setItem(DEV_TUTORIALS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[tutorials] No se pudo escribir el overlay en localStorage:', error);
  }
};

// Deriva un nombre de variable camelCase válido a partir del nombre de archivo
// (sin extensión ni caracteres inválidos). Ej: "como_crear_productos.md" →
// "comoCrearProductos".
const toCamelCaseVarName = (sourceFile: string): string => {
  const base = sourceFile.replace(/\.md$/i, '');
  const words = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return 'tutorial';

  const camel = words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');

  // Un identificador no puede empezar por dígito.
  return /^[0-9]/.test(camel) ? `tutorial${camel.charAt(0).toUpperCase()}${camel.slice(1)}` : camel;
};

/**
 * Genera el snippet de configuración listo para pegar en este archivo: la línea
 * de importación `?raw` del `sourceFile` y la entrada `{ id, title, content }`
 * (sin campo `icon`). Solo se usa en el panel de gestión dev-only (Req 7.6).
 */
export const buildTutorialSnippet = (entry: {
  id: string;
  title: string;
  sourceFile: string;
}): string => {
  const varName = toCamelCaseVarName(entry.sourceFile);
  return [
    `import ${varName} from '../../docs/guias_usuario/${entry.sourceFile}?raw';`,
    ``,
    `{ id: '${entry.id}', title: '${entry.title}', content: ${varName} },`,
  ].join('\n');
};
