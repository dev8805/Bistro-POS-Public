# Control de acceso a RPCs mutantes — Bistro POS

> Documento operativo del **Requisito 5** del spec `seguridad-remediacion`
> (Restricción de RPCs mutantes SECURITY DEFINER). Registra la revocación de
> `EXECUTE` al acceso público (Tarea 5.2) y documenta el **conjunto mínimo de
> funciones que el rol `anon` sí necesita** como públicas por diseño
> (criterio 5.4).
>
> Todo el estado de ACL se verificó en vivo con MCP sobre `pg_proc.proacl`,
> nunca asumiéndolo desde los archivos locales de `supabase/`.

---

## 1. Por qué se revoca

Las funciones RPC que **mutan datos** son `SECURITY DEFINER`: corren con los
privilegios de su dueño (elevado), no del llamante. Antes de la remediación,
su ACL otorgaba `EXECUTE` a `PUBLIC`, `anon`, `authenticated` y `service_role`,
lo que permitía que la **anon key pública** (extraíble del bundle) invocara
operaciones sensibles (cerrar caja, mover stock, anular/devolver ventas).

La Tarea 5.1 ya agregó el chequeo interno de pertenencia (`auth.uid()` +
`business_id = get_user_business_id()`) y fijó `search_path`. La Tarea 5.2
cierra el acceso al retirar el grant al acceso público.

## 2. Estrategia diferenciada por función

La revocación distingue **cómo se invoca** cada función:

### Grupo A — RPC llamadas por el cliente AUTENTICADO

El cliente las invoca vía `supabase.rpc(...)` desde los hooks
(`useCashRegister`, `useSales`, `useDebts`, `useInventoryLots`, `useRefunds`,
`useOfflineSync`), siempre bajo una sesión `authenticated`. Se revoca a
`PUBLIC` y `anon`; se **mantiene** `authenticated` y `service_role`.

| Función (firma) |
|-----------------|
| `close_cash_shift(uuid, numeric, text, jsonb)` |
| `deduct_stock_for_order(uuid)` |
| `increment_stock(uuid, numeric)` |
| `delete_order_and_restore_stock(uuid)` |
| `void_order_and_restore_stock(uuid, text)` |
| `cancel_order_and_restore_stock(uuid, text)` |
| `process_sale_refund(uuid, jsonb, text, text)` |

**ACL objetivo:** `authenticated`, `service_role` (sin `PUBLIC` ni `anon`).

### Grupo B — Función TRIGGER (no se llama vía RPC directa)

`update_client_debt()` (0 argumentos) la dispara el trigger
`on_client_transaction_change` en `public.client_transactions`
(`AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`). No hay ninguna llamada
`rpc('update_client_debt')` en el cliente (verificado por grep). Se revoca a
`PUBLIC`, `anon` **y** `authenticated`; se mantiene solo `service_role`.

**ACL objetivo:** `service_role`.

> **Por qué revocar `authenticated` no rompe los abonos/deudas:** una función
> trigger se ejecuta dentro del contexto del disparador de la BD,
> independientemente del grant `EXECUTE` del rol que originó la operación. Al
> insertar/actualizar/borrar una fila de `client_transactions` (un abono o una
> venta a crédito), el trigger corre igual y `clients.current_debt` se sigue
> recalculando. El grant `EXECUTE` solo controla la **invocación directa** de la
> función, que aquí nunca ocurre.

## 3. SQL aplicado (migración `revoke_public_anon_on_mutating_rpcs`)

```sql
-- GRUPO A: mantener authenticated y service_role
REVOKE EXECUTE ON FUNCTION public.close_cash_shift(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_stock_for_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_stock(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_order_and_restore_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_order_and_restore_stock(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_order_and_restore_stock(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_sale_refund(uuid, jsonb, text, text) FROM PUBLIC, anon;

-- GRUPO B: solo service_role
REVOKE EXECUTE ON FUNCTION public.update_client_debt() FROM PUBLIC, anon, authenticated;
```

> El `PUBLIC` se incluye explícito porque el ACL de partida traía el grant
> `=X/postgres` (PUBLIC con EXECUTE). Sin revocarlo, `anon` heredaría el permiso
> vía PUBLIC aunque se le revocara el grant nominal.

## 4. Evidencia MCP — ACL antes / después

**Antes** (las 8 funciones):
`{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`
→ PUBLIC + anon + authenticated + service_role.

**Después:**

| Función | ACL resultante | Roles con EXECUTE |
|---------|----------------|-------------------|
| Grupo A (las 7) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `authenticated`, `service_role` |
| `update_client_debt()` | `{postgres=X/postgres,service_role=X/postgres}` | `service_role` |

(`postgres` es el rol dueño y siempre aparece; no es un rol de cliente.)

## 5. Conjunto mínimo de funciones públicas por diseño para `anon` (criterio 5.4)

Tras la revocación, el rol `anon` conserva `EXECUTE` únicamente en las funciones
que el flujo de **autenticación previa a la sesión** necesita. Son públicas por
diseño: un usuario sin sesión debe poder ejecutarlas para iniciar el login.

| Función (firma) | Para qué la usa `anon` | Endurecimiento asociado |
|-----------------|------------------------|--------------------------|
| `login_email_for_phone(p_phone text)` | Resolver el email asociado a un teléfono para iniciar el login por PIN/OTP. | Rate limit por IP en la Tarea 7.3 (Req 6.4) para frenar enumeración masiva. |
| `user_exists_by_phone(p_phone text)` | Comprobar si un teléfono ya está registrado (decidir registro vs. login). | Rate limit por IP en la Tarea 7.3 (Req 6.4). |

Estas dos son SECURITY DEFINER y deben permanecer accesibles a `anon` **por
diseño**; su exposición se mitiga con rate limiting, no revocando el grant
(revocarlo rompería el login de usuarios sin sesión).

> Nota: existen además funciones trigger SECURITY DEFINER (p. ej.
> `sync_profile_phone_to_auth()`, `delete_auth_users_after_business_delete()`)
> que aún muestran grant a `anon`/`PUBLIC`, pero se ejecutan solo dentro de sus
> triggers y no vía RPC directa; su endurecimiento de grants/`search_path` se
> aborda en las Tareas 12.5 / 14.3, fuera del alcance de la Tarea 5.2.

## 6. Por qué no se rompe ningún flujo legítimo

- **Grupo A:** el cliente llama estas RPC **autenticado** (`authenticated`), rol
  que se conserva → venta, cierre de caja, devolución, anulación, ajuste de
  stock y sincronización offline siguen funcionando.
- **`update_client_debt`:** es trigger; se ejecuta en el contexto del disparador
  independientemente del grant → los abonos y deudas se siguen actualizando.
- **`service_role`** ignora los grants → webhooks y crons server-side intactos.
- **`anon`** nunca invocaba legítimamente las RPC del Grupo A; solo conserva las
  dos funciones de autenticación pública que sí necesita (§5).
