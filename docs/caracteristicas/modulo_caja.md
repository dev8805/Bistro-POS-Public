# Módulo de Caja (CashRegisterScreen & useCashRegister)

Componente: `screens/CashRegisterScreen.tsx`  
Hook principal: `hooks/useCashRegister.ts`  
Acceso: Menú lateral → "Caja" / "Control de Caja"

Este módulo gestiona la apertura, operación del turno activo (ingresos, egresos, gastos, devoluciones), arqueo de efectivo, cierre de caja e historial de turnos del negocio.

---

## 1. Arquitectura y Vistas

La pantalla opera a través de 5 modos de vista principales (`viewMode`):

| Vista | Modo | Descripción |
|---|---|---|
| **Apertura** | Sin turno activo | Permite elegir la caja registradora e ingresar la base inicial (`opening_balance`). |
| **Turno Actual (Dashboard)** | `dashboard` | Muestra las tarjetas de saldos consolidados por método de pago y accesos rápidos de registro (Entrada, Salida, Devolución). |
| **Movimientos del Turno** | `current_movements` | Lista completa de transacciones del turno activo con paginación progresiva. |
| **Cierre y Arqueo** | `close` | Formulario de conteo de efectivo (directo o por denominación) y confirmación de cierre. |
| **Historial de Turnos** | `history` | Registro cronológico de turnos cerrados con filtros por fecha y acceso al detalle de auditoría. |
| **Detalle de Turno** | `detail` | Desglose completo de ventas, anulaciones, devoluciones y acciones de reporte (Impresión, PDF, Correo). |

---

## 2. Optimizaciones de Red y Egress (Fase 1)

### A. Paginación de Movimientos (20 en 20)
- **Consulta acotada:** En lugar de traer la totalidad de transacciones del turno activo, `fetchMovements` solicita únicamente los **20 movimientos más recientes** (`.range(0, 19)`).
- **Eliminación de Join innecesario:** Se removió la relación `created_by_profile:profiles(full_name)` de `cash_movements`, evitando peticiones redundantes a la tabla de perfiles.
- **Scroll Infinito y Carga Manual:**
  - En la vista compacta (`dashboard`), si existen más de 20 movimientos, se ofrece el botón *"Cargar 20 movimientos más"*.
  - En la vista ampliada (`current_movements`), el detector de desplazamiento (`onScroll`) pide los siguientes 20 registros automáticamente al aproximarse al final.

### B. Cálculo Blindado y Liviano de Saldos (`fetchBalances`)
- **Problema prevenido:** Al limitar la lista a 20 movimientos, calcular saldos solo sobre los elementos visibles habría desfasado el dinero real y el efectivo esperado (`expectedCash`).
- **Solución implementada:** Se implementó una función `fetchBalances()` que ejecuta un `select('type, payment_method, amount')` ultra ligero sobre el turno activo:
  - Sin joins.
  - Sin textos ni notas de auditoría.
  - Suma el 100% de ingresos y egresos en milisegundos con un peso de red inferior a **2 KB**.
- **Persistencia y Modo Offline:** Los balances consolidados y el turno activo se guardan en el almacenamiento local (`localStorage`), permitiendo operar y consultar el arqueo sin conexión.

### C. Cero Parpadeo en la Tarjeta de Efectivo
- **Causa corregida:** Anteriormente, `fetchBalances` se invocaba de forma asíncrona antes de que el estado de React (`activeShift`) estuviera disponible en memoria, lo que provocaba que el efectivo inicializara en `$0` más ventas, y milisegundos después sumara la base, viéndose visualmente como un descuento y posterior suma.
- **Solución implementada:**
  - Se incorporó `activeShiftRef = useRef<CashShift | null>(null)` para lectura síncrona en memoria.
  - `fetchBalances` y `fetchMovements` reciben el valor de `opening_balance` directamente como argumento durante la apertura y carga de datos.
  - El saldo se hidrata inmediatamente desde `localStorage` al abrir la pantalla, garantizando un número estable desde el primer cuadro de renderizado.

### D. Carga Diferida (*Lazy Loading*) y Retención en Memoria del Historial
- **Cero consultas al abrir la caja:** Al entrar a la caja para operar el turno del día, **no se consulta ningún turno cerrado anterior ni anulaciones del negocio**.
- **Carga bajo demanda:** La consulta `fetchShifts()` se dispara únicamente cuando el usuario hace clic en la pestaña **"Historial"**.
- **Límite acotado:** Se configuró un límite por defecto de **10 turnos** (reducido de los 30 anteriores).
- **Cero recargas al volver del detalle:** Al hacer clic en un turno para ver su auditoría y luego presionar el botón "Atrás", el sistema retiene los turnos en memoria (`lastFetchedHistoryFilterKeyRef`), evitando volver a consultar Supabase o mostrar el indicador de carga. La lista se restaura instantáneamente (0 ms).

### E. Filtro Interactivo en el Header del Historial
- **Ubicación en el Header:** El filtro de turnos está integrado directamente en la barra superior (a la derecha) y el botón **Atrás** a la izquierda.
- **Opciones predefinidas:**
  - `Últimos 10 turnos` (por defecto)
  - `Últimos 30 turnos`
  - `Hoy`
  - `Últimos 7 días`
  - `Este mes`
  - `Personalizado`
- **Selector de Rango Personalizado (`CustomDateRangePicker`):**
  - Implementa la propiedad `singleMonth={true}`, mostrando 1 mes a la vez para encajar perfectamente dentro del panel lateral de 448px (`max-w-md`) sin desbordamientos horizontales.

### G. Carga Consolidada de Turno Activo (`get_cash_register_init_data` RPC)
- **Problema de cascada anterior:** Al abrir la caja con un turno activo, el frontend ejecutaba hasta 5 consultas HTTP en 3 rondas secuenciales sucesivas (cajas y turno -> primeros 20 movimientos -> cálculo de saldos en `cash_movements`), más una llamada duplicada por efecto de renderizado en React, sumando más de 800 ms de latencia en red.
- **Solución implementada mediante RPC:**
  - Se implementó la función en PostgreSQL `get_cash_register_init_data(p_business_id, p_user_id)` que resuelve todo en memoria de base de datos y entrega un único objeto JSON consolidado:
    * `registers`: Cajas activas del negocio.
    * `active_shift`: Turno abierto del usuario (con su caja y perfil enlazados).
    * `occupied_registers`: Cajas ocupadas por otros empleados.
    * `movements`: Los primeros 20 movimientos ordenados por fecha descendente.
    * `balances`: Saldos calculados por método de pago (`cash`, `nequi`, `daviplata`, `card`, `transfer`, `other`).
  - **1 solo viaje de red (Roundtrip):** El tiempo de carga cae de ~800 ms a **~50 ms**.
  - **Eliminación de llamadas duplicadas:** Se sincronizó `lastFetchedShiftIdRef.current` de forma inmediata al poblar el turno, evitando que el hook vuelva a pedir los movimientos dos veces al montar.
  - **Resiliencia offline:** Si la red no está disponible, el sistema recupera de forma transparente los datos del turno y movimientos desde `localStorage`.

---

## 3. Seguridad y Permisos

- **Visualización de Turnos en el Historial:**
  - **Administradores / Dueños** (permiso `admin_reports`): pueden consultar los turnos de todos los cajeros del negocio.
  - **Cajeros** (sin `admin_reports`): el sistema filtra automáticamente para que el cajero únicamente pueda ver en el historial los turnos cerrados por él mismo (`s.opened_by === profile?.id`).
- **Cierre y Modificaciones:**
  - Permiso `pos_close` para realizar el arqueo y cierre del turno.
  - Permiso `pos_refund` para registrar devoluciones de dinero desde caja.
