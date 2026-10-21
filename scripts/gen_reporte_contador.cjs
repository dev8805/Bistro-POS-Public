// Genera un Excel para revisión contable del Reporte Diario de Caja.
// Uso: node scripts/gen_reporte_contador.cjs
const ExcelJS = require('exceljs');
const path = require('path');

const wb = new ExcelJS.Workbook();
wb.creator = 'Bistro POS';
wb.created = new Date();
const ws = wb.addWorksheet('Reporte Diario de Caja', {
  views: [{ state: 'frozen', ySplit: 6 }],
  pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait', margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
});

// Paleta
const AMBER = 'FFFBBF24';
const DARK = 'FF102218';
const SECTION = 'FFE8EEF0';
const HEADER = 'FF102218';
const BORDER = 'FFBFC9C4';

ws.columns = [
  { key: 'linea', width: 30 },
  { key: 'incluye', width: 52 },
  { key: 'ejemplos', width: 40 },
  { key: 'estado', width: 18 },
  { key: 'obs', width: 38 },
];

const thin = { style: 'thin', color: { argb: BORDER } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

function setBorders(rowNumber) {
  for (let c = 1; c <= 5; c++) ws.getCell(rowNumber, c).border = allBorders;
}

// ---- Título ----
ws.mergeCells('A1:E1');
const t = ws.getCell('A1');
t.value = 'REPORTE DIARIO DE CAJA — Revisión Contable';
t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
t.alignment = { vertical: 'middle', horizontal: 'center' };
t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
ws.getRow(1).height = 30;

ws.mergeCells('A2:E2');
const sub = ws.getCell('A2');
sub.value = 'Negocio: Bistro POS (punto de venta minorista, Colombia)  ·  Documento para que el contador valide si cada línea está bien configurada.';
sub.font = { italic: true, size: 10, color: { argb: 'FF555555' } };
sub.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
ws.getRow(2).height = 26;

ws.mergeCells('A3:E3');
const instr = ws.getCell('A3');
instr.value = 'Instrucciones: en la columna "¿Correcto o Corregir?" marque cada línea, y use "Observaciones" para anotar lo que se deba ajustar.';
instr.font = { size: 10, color: { argb: 'FF8a6d00' } };
instr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
instr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } };
ws.getRow(3).height = 24;

ws.addRow([]); // 4
ws.getRow(4).height = 6;

// ---- Encabezados de tabla (fila 5) ----
const headerRow = ws.getRow(5);
headerRow.values = ['Línea del reporte', 'Qué incluye (en palabras simples)', 'Ejemplos', '¿Correcto o Corregir?', 'Observaciones del contador'];
headerRow.height = 28;
headerRow.eachCell((cell) => {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = allBorders;
});

let r = 6;
function addSection(title) {
  ws.mergeCells(`A${r}:E${r}`);
  const c = ws.getCell(`A${r}`);
  c.value = title;
  c.font = { bold: true, size: 12, color: { argb: DARK } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
  ws.getRow(r).height = 24;
  setBorders(r);
  r++;
}
function addLine(linea, incluye, ejemplos) {
  const row = ws.getRow(r);
  row.values = [linea, incluye, ejemplos, '', ''];
  row.alignment = { vertical: 'top', wrapText: true };
  ws.getCell(r, 1).font = { bold: true, size: 10.5 };
  ws.getCell(r, 2).font = { size: 10.5 };
  ws.getCell(r, 3).font = { size: 10, color: { argb: 'FF555555' }, italic: true };
  setBorders(r);
  // altura aproximada según texto
  const est = Math.max(incluye.length, ejemplos.length);
  row.height = est > 90 ? 56 : est > 55 ? 44 : 32;
  r++;
}
function addNote(text) {
  ws.mergeCells(`A${r}:E${r}`);
  const c = ws.getCell(`A${r}`);
  c.value = text;
  c.font = { size: 10, color: { argb: 'FF333333' } };
  c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8F8' } };
  setBorders(r);
  ws.getRow(r).height = Math.max(28, Math.ceil(text.length / 95) * 16);
  r++;
}

// ===== 1. DATOS DEL TURNO =====
addSection('1. DATOS DEL TURNO');
addLine('Sucursal', 'Nombre del negocio que aparece en el encabezado del recibo.', 'Tienda de la Esquina');
addLine('Caja', 'Nombre de la caja registradora donde se trabajó el turno.', 'Caja principal');
addLine('# Turno', 'Número consecutivo del turno, asignado automáticamente al abrirlo.', 'Turno 13');
addLine('Vendedor', 'Persona que abrió el turno y atendió la caja.', 'Manuel Castillo');
addLine('Fecha / Hora inicio', 'Momento en que se abrió el turno.', '30 may 2026, 11:34 a. m.');
addLine('Fecha / Hora fin', 'Momento en que se cerró el turno.', '5 jun 2026, 8:19 p. m.');
addLine('Cierre realizado por', 'Persona que cerró el turno e hizo el conteo.', 'Manuel Castillo');

// ===== 2. MOVIMIENTO DE CAJA =====
addSection('2. MOVIMIENTO DE CAJA  (efectivo físico del cajón)');
addLine('Base inicial de caja', 'Efectivo con que arranca el cajón al abrir el turno, para dar cambio.', 'Base de $100.000');
addLine('Efectivo', 'Dinero en efectivo recibido por las VENTAS del turno.', 'Ventas de contado pagadas en billetes y monedas');
addLine('Otros ingresos de efectivo', 'Efectivo que ENTRA al cajón pero que NO es una venta del turno.', 'Abonos de clientes a fiados (recaudo de cartera); inyección de base / sencillo; aportes del dueño a la caja');
addLine('Retiro de efectivo', 'TODO el efectivo que SALE del cajón durante el turno (no solo retiros).', 'Retiros de dinero; gastos pagados en efectivo; compras a proveedor en efectivo; devoluciones en efectivo');
addLine('Total de efectivo', 'Lo que debería haber físicamente en el cajón. Se calcula: Base + Efectivo + Otros ingresos − Retiros.', 'Resultado del conteo esperado');
addLine('Tarjetas', 'Ventas pagadas con tarjeta. Informativo: NO entra al cajón de efectivo.', 'Datáfono');
addLine('Pagos en línea', 'Ventas pagadas por transferencia, Nequi o Daviplata. Informativo: NO es efectivo.', 'Nequi, Daviplata, transferencia bancaria');
addLine('Otros', 'Ventas pagadas con otros medios o medios personalizados. Informativo.', 'Bonos, vales, medios propios del negocio');

// ===== 3. VALORES INGRESADOS POR EL CAJERO =====
addSection('3. VALORES INGRESADOS POR EL CAJERO  (lo que se contó al cerrar)');
addLine('Efectivo', 'Efectivo que el cajero CONTÓ físicamente en el cajón al cerrar el turno.', 'Conteo real de billetes y monedas');
addLine('Tarjetas', 'Total declarado/contado en tarjeta al cerrar. (Hoy el sistema no lo pide → sale en $0).', 'Hoy queda en $0');
addLine('Pagos en línea', 'Total declarado en transferencias/Nequi al cerrar. (Hoy no se pide → sale en $0).', 'Hoy queda en $0');
addLine('Otros', 'Total declarado en otros medios al cerrar. (Hoy no se pide → sale en $0).', 'Hoy queda en $0');

// ===== 4. RESUMEN FINAL =====
addSection('4. RESUMEN FINAL');
addLine('Total ingresado en cierre de caja', 'Suma de todo lo que el cajero contó al cerrar.', 'Efectivo + tarjetas + línea contados');
addLine('Total esperado en cierre de caja', 'Lo que el sistema dice que debería haber (igual al "Total de efectivo").', 'Esperado según movimientos');
addLine('Diferencia', 'Sobrante o faltante: lo contado MENOS lo esperado.', '$0 = cuadró · negativo = faltante · positivo = sobrante');
addLine('Devoluciones', 'Devoluciones de dinero a clientes durante el turno. (Hoy no hay flujo que las registre → $0).', 'Hoy queda en $0');
addLine('Retiros diferentes a efectivo', 'Salidas de dinero en un medio distinto al efectivo. (Hoy no hay flujo → $0).', 'Hoy queda en $0');
addLine('Facturas a crédito', 'Ventas a crédito / fiado realizadas en el turno. Informativo.', 'Ventas que quedaron como deuda del cliente');

// ===== Notas =====
addSection('NOTAS PARA EL CONTADOR');
addNote('• Cómo se calcula el "Total de efectivo": Base inicial + Efectivo (ventas) + Otros ingresos de efectivo − Retiro de efectivo. Solo intervienen las líneas en efectivo; tarjetas y pagos en línea NO afectan ese total (son informativos).');
addNote('• Líneas que hoy salen en $0 a propósito (Devoluciones, Retiros diferentes a efectivo, y Tarjetas/Línea/Otros declarados): se muestran para conservar el formato completo, pero el sistema aún no captura esos datos. Indíquenos si deberían capturarse.');
addNote('• Nota sobre "Otros ingresos de efectivo": es entrada de dinero al cajón que NO es una venta (por ejemplo un abono de cliente). Contablemente puede no ser un ingreso de renta (un abono baja Cuentas por Cobrar). Por eso va separado de la línea "Efectivo (ventas)".');
addNote('• Pregunta clave para el contador: ¿la clasificación de cada línea es correcta para efectos contables y de control de caja? ¿Falta o sobra alguna línea?');

// Guardar
const out = path.join(__dirname, '..', 'docs', 'Reporte_Diario_Caja_Revision_Contador.xlsx');
wb.xlsx.writeFile(out).then(() => console.log('Generado:', out));
