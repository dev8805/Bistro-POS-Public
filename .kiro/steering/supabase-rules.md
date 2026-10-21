---
inclusion: fileMatch
fileMatchPattern: ["supabase/**", "**/supabase*"]
---

# Reglas de Supabase — BistroPOS

## Regla #1: Nunca confiar en archivos locales

Los archivos en `supabase/` están desincronizados del estado real de la BD. SIEMPRE verificar con MCP antes de actuar:

- `list_tables` — ver qué tablas existen realmente
- `list_edge_functions` — ver qué funciones están desplegadas
- `list_migrations` — ver qué migraciones se han aplicado
- `execute_sql` — verificar esquema o datos

## Al crear tablas nuevas

- Incluir políticas RLS en la misma migración
- Verificar que no exista una tabla similar primero
- Usar `execute_sql` para verificar el esquema actual

## Edge Functions

- Verificar con `list_edge_functions` antes de asumir que una función existe
- Usar `get_edge_function` para ver el código actual desplegado
- Deploy con `deploy_edge_function` después de cambios

## Migraciones

- Verificar con `list_migrations` qué se ha aplicado
- No crear migraciones que repitan esquemas existentes
- Nombrar migraciones descriptivamente: `20240101_add_column_x_to_table_y`
