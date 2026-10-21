# `docs/migrations/` — Referencia histórica (⚠️ desactualizada)

Esta carpeta contiene una **muestra parcial** de scripts SQL aplicados a la base de datos vía MCP durante el desarrollo. **No es la fuente de verdad** para el esquema actual.

## Fuentes reales

| Fuente | Ubicación | Propósito |
|---|---|---|
| Migraciones locales del proyecto | `../../supabase/migrations/` | Convención `YYYYMMDD_*.sql`; 46 archivos al momento de escribir esta nota |
| Esquema declarativo local | `../../supabase/schema.sql` | Volcado de referencia |
| **Estado real de la BD** | Supabase MCP (`list_tables`, `list_migrations`, `list_edge_functions`) | Lo único fiable en tiempo de auditoría |

> Regla del proyecto (`.kiro/steering/tech.md`): **nunca asumir el estado de Supabase a partir de los archivos locales**. Consultar siempre vía MCP antes de cualquier análisis o cambio.

## Qué hay aquí

Nueve scripts SQL sueltos correspondientes a cambios que se aplicaron a mano vía `apply_migration` / `execute_sql`. Se listan a continuación con la doc de característica a la que corresponden:

| Archivo | Feature relacionada | Nota |
|---|---|---|
| `2026-06-07-login-pin.sql` | [`autenticacion_acceso.md`](../caracteristicas/autenticacion_acceso.md) | Contiene un aviso interno de estar parcialmente desactualizado. |
| `2026-06-09-change-pin.sql` | Idem | RPC `_set_user_pin`. |
| `2026-06-10-realtime-tables-rooms.sql` | [`mesas.md`](../caracteristicas/mesas.md) | Publicación realtime. |
| `2026-06-14-anulacion-devolucion-permisos.sql` | [`anulacion_devolucion_ventas.md`](../caracteristicas/anulacion_devolucion_ventas.md) | |
| `2026-06-17-fix-close-cash-shift-split-payments.sql` | [`reporte_cierre_turno.md`](../caracteristicas/reporte_cierre_turno.md) | |
| `2026-06-29-save-product-modifiers-rpc.sql` | [`etiquetas_por_categoria.md`](../caracteristicas/etiquetas_por_categoria.md) | |
| `add_category_options_and_product_exclusions.sql` | Idem | Sin fecha. |
| `create_suppliers_table.sql` | [`deudas_negocio.md`](../caracteristicas/deudas_negocio.md) | Sin fecha. |
| `fix_suppliers_schema.sql` | Idem | Sin fecha. |

## Por qué se conservan

Para que quede rastro de cambios aplicados fuera del flujo formal de `supabase/migrations/`. Si más adelante se hace un `supabase db pull` o se reconstruye la BD desde cero, estos archivos permiten reconstruir el contexto.

## Cuándo NO usarlos

- Para conocer el estado actual de la BD (usar MCP).
- Para aplicar en un proyecto nuevo (usar `../../supabase/migrations/`).
- Para saber si una migración ya está aplicada (usar `list_migrations` de MCP).
