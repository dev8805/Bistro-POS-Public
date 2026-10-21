

export type SellTab = 'gastos' | 'mesas' | 'orden_rapida' | 'mesa_activa' | 'escanear';

export enum Screen {
  DASHBOARD = 'DASHBOARD',
  TABLES = 'TABLES',
  MENU = 'MENU',
  PAYMENT = 'PAYMENT',
  SUCCESS = 'SUCCESS',
  QUICK_ORDER = 'QUICK_ORDER',
  EMPLOYEES = 'EMPLOYEES',
  CLIENTS = 'CLIENTS',
  PRODUCTS = 'PRODUCTS',
  SALES = 'SALES',

  CASH_REGISTER = 'CASH_REGISTER',
  INVENTORY = 'INVENTORY',
  CREATE_PRODUCT_SIMPLE = 'CREATE_PRODUCT_SIMPLE',
  CREATE_PRODUCT_PROCESSED = 'CREATE_PRODUCT_PROCESSED',
  CREATE_PRODUCT_SERVICE = 'CREATE_PRODUCT_SERVICE',
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  PROFILE = 'PROFILE',
  SUBSCRIPTION_PLANS = 'SUBSCRIPTION_PLANS',
  SELL = 'SELL',
  SUBSCRIPTION_MANAGEMENT = 'SUBSCRIPTION_MANAGEMENT',
  PHOTO_ORDER = 'PHOTO_ORDER',
  CONTINGENCY_DOC = 'CONTINGENCY_DOC',
  DEBTS = 'DEBTS',
  CREATE_PROMOTION = 'CREATE_PROMOTION',
  EDIT_PROMOTION = 'EDIT_PROMOTION',
  TRAINING = 'TRAINING',
  BULK_UPLOAD = 'BULK_UPLOAD',
  CREATE_FROM_INVOICE = 'CREATE_FROM_INVOICE',
  RAG_CHAT = 'RAG_CHAT',
  ACTIVITY = 'ACTIVITY',
  HOME = 'HOME'
}


export type UserRole = 'Administrador' | 'Cajero' | 'Mesero' | 'Cocinero';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  role_id?: string | null;
  avatar_url: string | null;
  business_id?: string;
  business_name?: string;
  permissions?: Record<string, boolean>;
  is_active?: boolean;
  offline_prefix?: string | null;
}

export enum ProductType {
  SIMPLE = 'simple',
  PROCESSED = 'processed',
  SERVICE = 'service',
  PROMOTION = 'promotion'
}

export interface SalePresentation {
  id: string;
  unit_name: string;
  conversion_factor: number;
  price: number;
  barcode?: string;
  image_url?: string;
  nicknames?: string[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  category_id?: string;  // ID de la categoría para filtrado
  description?: string;
  ingredients?: string[];
  hasCustomization?: boolean; // Controls if the order modal opens
  customizableOptions?: CustomizableOption[]; // strings sueltas o carpetas { name, options }
  excludedOptions?: string[]; // Options excluded from category for this product (por nombre de etiqueta)
  unit?: string; // Unidad de medida (Libras, Kilogramos, Unidad, etc.)
  stock?: number;
  nicknames?: string[];
  barcode?: string;
  is_favorite?: boolean;
  sale_presentations?: SalePresentation[];
  parent_product_id?: string;
  is_secondary?: boolean;
  conversion_factor?: number;
  presentation_unit?: string;
}

// Add-on agregado a una línea del carrito (producto-modificador). Snapshot del precio al agregar.
export interface AddedModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem extends Product {
  quantity: number;
  notes?: string;
  removedIngredients?: string[];
  cookingTerm?: string;
  orderItemId?: string;
  status?: string;
  /** Item de mesa cacheado offline que aún no se sincroniza con Supabase (Req 7.5). */
  pendingSync?: boolean;
  discount?: number;
  discountPercent?: number;
  originalPrice?: number;
  sale_unit?: string;
  // Productos-modificadores agregados a esta línea (snapshot; usado para precargar el modal).
  addedModifiers?: AddedModifier[];
  // Si esta línea es un add-on (producto-modificador), apunta al orderItemId de su línea padre.
  // Es una línea real de la orden (ticket/inventario normales); en carrito/comanda se agrupa como etiqueta.
  parentOrderItemId?: string;
}

export interface Table {
  id: string;
  label: string;
  status: 'available' | 'occupied' | 'reserved';
  room: string; // Added room property
  time?: string;
  amount?: number;
  customer?: string;
  seats?: number;
}

export interface SplitPayment {
  method: string;
  amount: number;
}

export interface TransactionDetails {
  type: 'cash' | 'credit';
  customer: string;
  amount: number;
  change?: number;
  method: string; // 'Efectivo', 'Tarjeta', 'Crédito', etc.
  date: string;
  address?: string;
  client_id?: string; // For credit sales - links to clients table
  client_id_number?: string; // Client's ID/document number for receipts
  customerPhone?: string; // Client's phone number for sending receipt via WhatsApp
  table_id?: string; // For table orders - to update table status
  note?: string;
  splitPayments?: SplitPayment[];
  userDiscount?: number;
  creditAbono?: number;
  creditAbonoMethod?: string;
  creditDueDate?: string; // Fecha acordada de pago para ventas a crédito
}

export interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  unit: string;
}

export interface Sale {
  id: string;
  date: string;
  time: string;
  customer: string;
  total: number;
  method: 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Crédito' | string;
  status: 'completed' | 'canceled' | 'pending';
  waiter: string;
  items: SaleItem[];
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountPercent?: number;
  total: number;
  unit?: string;
  notes?: string;
  cookingTerm?: string;
  removedIngredients?: string[];
  // Soporte de productos-modificadores (add-ons): el ticket los imprime como líneas normales;
  // la comanda agrupa: omite las líneas isModifier y muestra `modifiers` como etiquetas del padre.
  isModifier?: boolean;
  modifiers?: string[];
}

export interface ReceiptData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  businessNit?: string;
  items: ReceiptItem[];
  subtotal: number;
  totalDiscount: number;
  roundingAdjustment?: number;
  total: number;
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  customerName: string;
  customerDocument?: string;
  customerPhone?: string;
  date: string;
  sellerName?: string;
  orderNumber?: number;
  orderId?: string;
  displayNumber?: string;
  splitPayments?: SplitPayment[];
  creditAbono?: number;
  creditAbonoMethod?: string;
}

// Datos para el "REPORTE DIARIO" (cierre de turno de caja)
export interface ShiftReportData {
  // Encabezado
  businessName: string;
  businessNit?: string;
  businessAddress?: string;
  businessPhone?: string;
  registerName: string;
  shiftNumber?: number;
  cashierName?: string;   // abrió el turno
  closedByName?: string;  // cerró el turno
  openedAt: string;       // ya formateado en zona horaria del negocio
  closedAt?: string;      // ya formateado; undefined si sigue abierto

  // Movimiento de caja
  openingBalance: number; // Base inicial de caja
  cashSales: number;      // Efectivo (ventas)
  cashIn: number;         // Otros ingresos de efectivo
  cashOut: number;        // Retiro de efectivo
  totalCash: number;      // Total de efectivo
  cardSales: number;      // Tarjetas
  onlineSales: number;    // Pagos en línea (transferencia/nequi/daviplata)
  otherSales: number;     // Otros
  totalSales: number;     // Total facturado del turno (todos los métodos)

  // Valores ingresados por el cajero (declarado en arqueo)
  declaredCash: number;
  declaredCard: number;
  declaredOnline: number;
  declaredOther: number;

  // Resumen final
  totalDeclared: number;  // Total ingresado en cierre de caja
  totalExpected: number;  // Total esperado en cierre de caja
  difference: number;     // Diferencia
  refunds: number;        // Devoluciones
  otherWithdrawals: number; // Retiros diferentes a efectivo
  creditSales: number;    // Facturas a crédito

  // Desglose de salidas de efectivo
  cashOutflows?: ShiftReportCashOutflow[];
}

export interface ShiftReportCashOutflow {
  title: string;
  note?: string;
  amount: number;
}

// Producto referenciado dentro de una carpeta de modificadores. Solo se guarda id+nombre;
// el precio/tipo se resuelven EN VIVO del catálogo al vender.
export interface ModifierProduct {
  id: string;
  name: string;
}

export interface OptionFolder {
  name: string;
  options: string[];
  // Productos agregados como modificadores (add-ons con precio). Opcional/aditivo.
  products?: ModifierProduct[];
}

// Una etiqueta de personalización dentro de `customizable_options`:
// - string  → etiqueta suelta (legacy)
// - { name, options } → carpeta
// - { id, name } → producto suelto (add-on con precio, fuera de carpeta)
export type CustomizableOption = string | OptionFolder | ModifierProduct;
