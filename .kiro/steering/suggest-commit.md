---
inclusion: manual
---

# Sugerir commit message

Cuando el usuario incluye este archivo en el chat (con `#commit`), seguí este flujo:

## 1. Fuente de verdad: git status

Ejecutá `git status --short` PRIMERO. Los archivos que aparecen ahí son la ÚNICA fuente de verdad sobre qué hay pendiente de commit. Si un archivo NO aparece en `git status`, no incluirlo (aunque haya sido modificado en la sesión, ya fue commiteado).

Si `git status` está vacío → responder simplemente: "No hay cambios pendientes de commit." y terminar.

## 2. Usar el chat como pista para agrupar internamente

Revisá el historial de esta sesión y buscá los mensajes tuyos anteriores donde sugeriste commits. Patrón a buscar: bloques con formato `tipo(scope): descripción` seguidos de una lista de archivos con `→` explicando qué se hizo.

Esto sirve para saber a qué NATURALEZA pertenece cada archivo (ej: "hook /commit", "flujo de rebase", "UI de ventas", etc.), NO para decidir cuántos commits sugerir.

## 3. Regla clave: SIEMPRE UN solo commit

Aunque los archivos pendientes correspondan a naturalezas distintas, SIEMPRE devolver un único mensaje de commit que abarque todo lo pendiente. El usuario prefiere aplicar un solo commit para toda la sesión, no varios separados.

El agrupamiento por naturaleza vive dentro del CUERPO del mensaje (secciones internas), no en múltiples commits.

## 4. Formato Conventional Commits en español

**Subject (primera línea):**
- Formato: `tipo(scope): descripción en imperativo`
- Tipos válidos: feat, fix, refactor, style, docs, chore, perf, test
- Elegí el tipo predominante entre los cambios. Si hay mezcla clara (ej: docs + chore), usá el que abarque el conjunto o el que refleje la naturaleza más grande.
- Scope: agrupación amplia que cubra todos los cambios (ej: `kiro`, `steering`, `ventas`, `offline`). Si los cambios cruzan áreas, usá un scope global (`kiro`) o el módulo mayor.
- Descripción: en imperativo, minúscula inicial, sin punto final. Debe ser suficientemente descriptiva para mencionar las áreas afectadas (ej: "actualizar hook /commit y flujo de rebase en steering").

**Cuerpo:**
- Empezar con `Incluye:` y línea en blanco.
- Si TODOS los archivos son de la misma naturaleza → lista plana:
  ```
  Incluye:
  - archivo1.tsx → qué se hizo y por qué
  - archivo2.ts → qué se hizo y por qué
  ```
- Si los archivos son de naturalezas DISTINTAS → agrupar en sub-secciones con título de la naturaleza (basada en las pistas del chat del paso 2):
  ```
  Incluye:

  Naturaleza A:
  - archivo1.tsx → qué se hizo y por qué
  - archivo2.ts → qué se hizo y por qué

  Naturaleza B:
  - archivo3.md → qué se hizo y por qué
  ```
- El orden de las sub-secciones debe ser el más lógico (ej: cambios que dependen de otros van después, o de más impacto a menos impacto).

## 5. Formato de salida (sin `git commit -m`)

Mostrar SOLO el mensaje puro (sin `git commit -m` ni comillas alrededor). El usuario aplica el commit por su cuenta desde VS Code o donde prefiera.

Ejemplo con naturalezas mezcladas:

```
chore(kiro): actualizar hook /commit y flujo de rebase en steering

Incluye:

Hook /commit:
- .kiro/hooks/suggest-commit.json → convertir de trigger Stop a comando manual /commit con git status como fuente de verdad
- .kiro/steering/code-conventions.md → eliminar sección Commits y remitir todo al hook

Flujo de rebase:
- .kiro/steering/git-explicado.md → agregar pre-check con 5 comandos y casos M1-M3 / R1-R4
```

Ejemplo con una sola naturaleza (lista plana):

```
fix(ventas): corregir cálculo de descuento cuando hay peso decimal

Incluye:
- hooks/useSales.ts → ajustar redondeo antes de aplicar el descuento
- lib/formatCurrency.ts → devolver 2 decimales fijos para totales
```

Al final del mensaje, si TODOS los archivos ya venían de una sugerencia previa idéntica del chat, aclaralo brevemente: "Este mensaje ya lo había sugerido antes y sigue pendiente." Si algunos archivos son nuevos y otros vienen de sugerencia previa, no lo aclares — la sugerencia siempre es la unificada actual.

## 6. No ejecutar el commit

NO ejecutés `git commit` ni ningún comando de git vos mismo. El usuario aplica el commit por su cuenta con el mensaje sugerido.
