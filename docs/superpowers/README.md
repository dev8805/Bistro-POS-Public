# `docs/superpowers/` — Archivo histórico de specs

Carpeta con planes (`plans/`) y specs de diseño (`specs/`) generados durante la implementación de features grandes. **Todo el contenido corresponde a features ya en producción**, se conserva como archivo histórico y trazabilidad.

## Contenido

| Fecha | Feature | Ubicación en la documentación viva |
|---|---|---|
| 2026-06-06 | Modificadores en carpetas (etiquetas anidadas) | [`caracteristicas/etiquetas_por_categoria.md`](../caracteristicas/etiquetas_por_categoria.md) |
| 2026-06-06 | Productos favoritos en catálogo | [`caracteristicas/modo_catalogo_pos.md`](../caracteristicas/modo_catalogo_pos.md) |
| 2026-06-07 | Evidencia de movimientos con proveedor | [`caracteristicas/deudas_negocio.md`](../caracteristicas/deudas_negocio.md), [`caracteristicas/flujo_compra_inventario.md`](../caracteristicas/flujo_compra_inventario.md) |
| 2026-06-07 | Login/registro con PIN de 4 dígitos | [`caracteristicas/autenticacion_acceso.md`](../caracteristicas/autenticacion_acceso.md), [`caracteristicas/perfil_usuario.md`](../caracteristicas/perfil_usuario.md) |

## Reglas

- No usar como referencia de estado actual: siempre priorizar la doc de característica correspondiente en `docs/caracteristicas/`.
- Los `plans/` describen tareas por ejecutar (checkboxes); ya no aplican operativamente.
- Los `specs/` documentan el diseño acordado antes de la implementación; útiles para entender **por qué** se hicieron las cosas de cierta forma.
