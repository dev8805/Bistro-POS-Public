# [Fix Push — Aislamiento en dispositivos compartidos] Registro

**Objetivo:** Que la notificación push (Web Push / PWA) de soporte humano le llegue **solo** al usuario dueño de la conversación, y no a otros usuarios que comparten (o compartieron) el mismo dispositivo físico.
**Arquitectura:** El push se enruta por un único `user_id` (`telegram-webhook` → `firePush(session.user_id)` → `send-support-push` filtra `where user_id = …`). El defecto no estaba en Telegram sino en el **mapeo endpoint → usuario** de `push_subscriptions`.
**Tech Stack:** Supabase (Postgres RLS + funciones `SECURITY DEFINER`), React (`usePushSubscription`, `AuthContext`).

> Módulo relacionado: [`docs/caracteristicas/soporte_humano_telegram.md`](../caracteristicas/soporte_humano_telegram.md)

---

## Síntoma reportado

Un **administrador** habla con soporte. Un **empleado** del mismo negocio tiene la sesión iniciada en su teléfono (PWA instalada, permiso de notificaciones concedido). Cuando el dev responde al admin desde Telegram, la notificación push aparece **también en la barra de estado del teléfono del empleado**.

## Causa raíz (verificada en producción, no inferida)

- Un endpoint de Web Push es **por dispositivo/navegador, no por usuario** (`push_subscriptions.endpoint` es `UNIQUE`). Un dispositivo físico = exactamente una fila.
- Esa fila quedaba mapeada al **primer** usuario que registró el endpoint. Si después otro usuario inicia sesión en el mismo dispositivo, el endpoint seguía apuntando al usuario anterior → recibía sus notificaciones.
- Datos verificados (proyecto `hjjmwipqquynjopkswvu`): una sola fila en `push_subscriptions`, `user_id` = admin (Manuel), nunca reasignada (su `created_at`/`user_id` no cambiaban tras logins del otro usuario).

## Intento 1 (descartado): solo política RLS de `UPDATE`

Se añadió una policy `UPDATE … using (true) with check (user_id = auth.uid())` (migración `push_subscriptions_update_policy`) para que el `upsert(onConflict:'endpoint')` del hook reasignara el endpoint.

**No funcionó.** Probado empíricamente simulando al empleado: el upsert falla con

```
ERROR: 42501: new row violates row-level security policy (USING expression) for table "push_subscriptions"
```

**Por qué:** en PostgreSQL, un `INSERT … ON CONFLICT DO UPDATE` exige que la fila en conflicto sea **visible vía la política `SELECT`** para poder actualizarla. La policy `SELECT` es own-only (`user_id = auth.uid()`), así que el usuario nuevo **no puede ver** la fila del dueño anterior → el `DO UPDATE` se rechaza. Confirmado: añadiendo un `SELECT` permisivo temporal en una transacción, la reasignación sí ocurría. Pero abrir el `SELECT` (`using (true)`) NO es opción: dejaría a cualquier usuario autenticado leer endpoints y claves de cifrado (`p256dh`, `auth`) ajenas.

## Solución implementada: funciones `SECURITY DEFINER`

Migración **`push_subscription_claim_release_rpc`**:
- Se **elimina** la policy `push_subscriptions_update_claim` (resultó inútil).
- `claim_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)` — `SECURITY DEFINER`, `search_path = ''`. Hace el upsert reasignando el endpoint a `auth.uid()`. Bypass de RLS **controlado**: solo puede asignarlo al propio usuario (no se puede falsificar el dueño). `GRANT EXECUTE` a `authenticated`.
- `release_push_subscription(p_endpoint)` — `SECURITY DEFINER`. Borra el endpoint en logout sin importar el dueño registrado (la fila es física del dispositivo). `GRANT EXECUTE` a `authenticated`.

Cambios de frontend:
- `hooks/usePushSubscription.ts`: `supabase.rpc('claim_push_subscription', …)` en lugar del `upsert` directo (login); `supabase.rpc('release_push_subscription', …)` en lugar del `delete` directo (logout).
- `context/AuthContext.tsx` (`signOut`): `supabase.rpc('release_push_subscription', …)` en lugar del `delete` directo, manteniendo la llamada **antes** de `supabase.auth.signOut()` (la RPC requiere sesión `authenticated` viva).

### Ciclo de vida correcto
login → `claim` reasigna el endpoint a `auth.uid()` · cambio de usuario → siguiente `claim` lo reclama · logout → `release` borra el endpoint.

## Verificación

- **BD:** policy `UPDATE` eliminada; funciones `claim_push_subscription` y `release_push_subscription` presentes como `SECURITY DEFINER`.
- **Funcional (transacción con ROLLBACK, rol `authenticated` simulado):** sembrada una fila del admin, el empleado llamó `claim_push_subscription` y la fila se reasignó a su `user_id`. ✔
- **Advisor:** desaparece el WARN `rls_policy_always_true` del intento 1 (la policy `using (true)` ya no existe).

## Pendiente de despliegue (para que aplique en dispositivos)

1. `npm run build` + deploy: hasta desplegar, el cliente corre el código viejo (upsert) que falla.
2. En el teléfono del empleado: abrir/recargar la PWA instalada (logueado como empleado) para que el SW nuevo ejecute `claim` y la fila pase a su `user_id`. Tras eso, las notificaciones del admin dejan de llegarle.
3. La fila huérfana actual se reasigna sola en ese primer login con el código nuevo (no requiere limpieza manual).

## Archivos / artefactos

- Migraciones Supabase: `push_subscriptions_update_policy` (descartada) → `push_subscription_claim_release_rpc` (vigente).
- `hooks/usePushSubscription.ts`, `context/AuthContext.tsx`.
- Doc módulo: `docs/caracteristicas/soporte_humano_telegram.md` (entrada "sesión noche" + sección RLS + troubleshooting + lista de migraciones).
