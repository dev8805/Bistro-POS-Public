# Facturación Offline Mejorada: Plan de Implementación

**Objetivo:** Permitir la impresión de facturas en modo offline asegurando que incluyan los datos del cliente (nombre, documento) y el consecutivo de la orden, solucionando la falta de disponibilidad de datos sin conexión.
**Arquitectura:** Se añadirá una capa de caché en `localStorage` para los clientes. En la creación de órdenes, se persistirá el `client_id_number` y se mantendrá el último número de orden en memoria para poder pre-asignar un consecutivo temporal a órdenes offline, garantizando la continuidad de la caja antes de sincronizar con Supabase.
**Tech Stack:** React, TypeScript, LocalStorage, Supabase.
---

### Tarea 1: Añadir Caché Offline para la Lista de Clientes

**Archivos:**
- Modify: `c:\Users\HP\OneDrive\Escritorio\Bistro\hooks\useClients.ts`

**Paso 1: Escribir test comprobatorio (Conceptual)**
Si un usuario apaga la conexión a Internet y recarga la pestaña de ventas, el autocompletado de clientes en la barra de pagos estará vacío porque `fetchClients` fallará.

**Paso 2: Implementación mínima**
Implementar persistencia local para que siempre haya una fuente de verdad respaldada.

```typescript
// Al inicio o fuera de la definición principal en useClients.ts
const CLIENTS_CACHE_KEY = 'bistro_clients_cache';

const getCachedClients = (): Client[] => {
    try {
        const cached = localStorage.getItem(CLIENTS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
    } catch { }
    return [];
};
```

Luego, en el estado inicial de `useClients`:
```typescript
const [clients, setClients] = useState<Client[]>(getCachedClients());
```

Dentro de `fetchClients`, después de una llamada exitosa a la red, almacenar en caché:
```typescript
setClients(mapped);
localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(mapped));
setError(null);
```

**Paso 3: Verificar éxito**
Apagar la conexión de red (en las DevTools del navegador) y recargar `(F5)`. Validar explorando la variable local y constatando que el buscador de clientes de `PaymentSidebar.tsx` sigue devolviendo resultados con la base de clientes cacheada.

---

### Tarea 2: Incluir ID del Cliente en los metadatos de Venta Offline

**Archivos:**
- Modify: `c:\Users\HP\OneDrive\Escritorio\Bistro\hooks\useSales.ts`

**Paso 1: Verificar el problema**
Actualmente la interfaz `CreateOrderData` permite `client_id` y `customer_name`, pero no el `id_number`, haciendo que si se guarda el payload offline, se pierda el dato para imprimir el ticket.

**Paso 2: Implementación mínima**
Agregar el soporte al tipado de la orden en `useSales.ts`:
```typescript
export interface CreateOrderData {
    table_id?: string;
    client_id?: string;
    client_id_number?: string; // <-- NUEVO CAMPO
    customer_name?: string;
    // ... (el resto inalterado)
}
```

---

### Tarea 3: Guardar el Consecutivo Temporal en Memoria

**Archivos:**
- Modify: `c:\Users\HP\OneDrive\Escritorio\Bistro\hooks\useSales.ts`

**Paso 1: Escribir test comprobatorio (Conceptual)**
Al crear una venta desde `PaymentSidebar.tsx` sin conexión, la función `createOrder` colisionará porque intenta ejecutar el query asíncrono hacia `operations/orders` para pedir el consecutivo.

**Paso 2: Implementación mínima**
Crear una variable global al archivo (o persistida en caché) para capturar el último número y usar el lock optimista local cuando estemos desconectados.

```typescript
const ORDER_SEQ_CACHE_KEY = 'bistro_last_order_number';

// Dentro de createOrder, modificar el bloque que genera el número de orden:
let nextOrderNumber = 1;

if (navigator.onLine) {
    const { data: lastOrder } = await supabase
        .from('orders')
        .select('order_number')
        .eq('business_id', businessId)
        .order('order_number', { ascending: false })
        .limit(1)
        .single();

    nextOrderNumber = (lastOrder?.order_number || 0) + 1;
    localStorage.setItem(ORDER_SEQ_CACHE_KEY, nextOrderNumber.toString());
} else {
    // Modo Offline / Fallback a caché
    const cachedNumber = parseInt(localStorage.getItem(ORDER_SEQ_CACHE_KEY) || '0', 10);
    nextOrderNumber = cachedNumber + 1;
    // Pre-actualizamos para la siguiente venta offline en serie
    localStorage.setItem(ORDER_SEQ_CACHE_KEY, nextOrderNumber.toString());
}
```

*(Nota: En `syncSingleOrder` de `useOfflineSync.ts`, este número se confirmará y validará contra Supabase para asegurar que se mantiene consecutivo real si hubo ventas desde otro dispositivo).*

**Paso 3: Verificar éxito**
Desconectar de la red. Hacer dos ventas seguidas. Las ventas deberán guardarse en el `offlineQueue` con los números consecutivos esperados localmente `(Anterior + 1, Anterior + 2)`.

---

### Tarea 4: Pasar el número de documento a la Impresión Offline

**Archivos:**
- Modify: `c:\Users\HP\OneDrive\Escritorio\Bistro\screens\PaymentScreen.tsx` o lugar de ensamble temporal de factura.

**Paso 1: Implementación mínima**
Cuando se termina la transacción y se llama el método para imprimir (`thermalPrinterService`), pre-crear en memoria para offline el `ReceiptData` utilizando la información local obtenida:
- El número local de orden.
- El nombre del cliente recuperado (ej. `selectedClient.name`).
- El documento recuperado (ej. `selectedClient.id_number`).

Esta interfaz se integrará perfectamente y garantizará la funcionalidad offline sin hacer depender de Supabase.

---
