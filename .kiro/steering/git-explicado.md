# Git Explicado — Regla de comportamiento del agente

Antes de ejecutar CUALQUIER comando git, el agente DEBE seguir estas reglas.

## Regla general: explicar antes de ejecutar

Antes de ejecutar un comando git, el agente debe explicar en 1-2 líneas cortas y simples:
- **Qué va a hacer** el comando (en lenguaje humano, no técnico)
- **Qué efecto tiene** en el repositorio

Formato:
```
> git [comando]
> Esto va a [explicación simple]. ¿Dale?
```

Esperar confirmación del usuario antes de ejecutar.

## Regla especial: rebase

### Contexto (por qué el usuario pide rebase)

Cuando el usuario pide "hacer rebase", asumir SIEMPRE este escenario:

- Está trabajando en una rama distinta a `main` (rama de feature/trabajo).
- Hizo o llegaron cambios nuevos a `main` y quiere traerlos a su rama.
- Objetivo final: cuando termine su trabajo y haga merge de la rama a `main`, que sea un merge limpio (fast-forward, sin conflictos, sin deshacer nada de main).
- Trabaja solo en sus ramas, así que reescribir la historia con force push es seguro.

### Pre-check obligatorio (antes de cualquier rebase)

Antes de ejecutar el rebase, el agente DEBE correr estos comandos en el orden indicado para conocer el estado real del repo. Estos comandos son de solo lectura, se pueden ejecutar sin pedir permiso.

```bash
# 0.1 Actualizar refs remotos (no modifica archivos locales)
git fetch origin

# 0.2 Nombre de la rama actual
CURRENT_BRANCH=$(git branch --show-current)

# 0.3 ¿main local está adelantado respecto a origin/main?
git log --oneline origin/main..main
# → si devuelve líneas: hay commits de main SIN push (main local adelantado)
# → si vacío: main local está sincronizado con origin/main

# 0.4 ¿La rama actual existe en el remoto?
git ls-remote --heads origin $CURRENT_BRANCH
# → si devuelve una línea: la rama YA existe en GitHub
# → si vacío: la rama es solo local, nunca fue subida

# 0.5 (solo si la rama existe en remoto) ¿La rama local está adelantada?
git log --oneline origin/$CURRENT_BRANCH..$CURRENT_BRANCH
# → si devuelve líneas: hay commits en la rama SIN push
# → si vacío: la rama local está sincronizada con la rama remota
```

Con estos resultados, el agente decide cómo actuar antes de ejecutar el rebase.

### Acción según el estado de main

**Caso M1 — main local sincronizado con origin/main:**
Todo bien, seguir directo al rebase.

**Caso M2 — main local adelantado (tiene commits sin push):**
Avisar al usuario con los commits concretos y pedir confirmación para subirlos primero:

```
⚠️ Tu main local tiene N commits sin subir a GitHub:
  ● abc1234 "mensaje del commit"
  ● def5678 "mensaje del commit"

Para hacer un rebase limpio, primero hay que sincronizar main con GitHub.

> git push origin main:main
> Esto sube esos N commits al remoto sin cambiar tu rama actual.

¿Los subimos y sigo con el rebase? (sí / no)
```

Si dice **sí** → ejecutar `git push origin main:main` y seguir con el rebase contra `origin/main` (que ya incluirá esos commits).

Si dice **no** → preguntar si quiere abortar el rebase o rebasar contra `main` local (opción avanzada, dejará main desincronizado con el remoto hasta que haga push manualmente).

**Caso M3 — main local ATRASADO respecto a origin/main** (raro pero posible):
No hay que hacer nada especial en main. El rebase contra `origin/main` ya usa la versión más nueva. Solo informarlo.

### Acción según el estado de la rama actual

**Caso R1 — la rama NO existe en el remoto** (rama solo local):

```
ℹ️ La rama "<nombre>" es solo local, nunca fue subida a GitHub.
El rebase se hace normal, pero al final NO se subirá al remoto automáticamente.
Si querés subirla, pedime "sube la rama" después del rebase.
```

Al final del rebase: **NO ejecutar ningún push**. La rama queda local.

**Caso R2 — la rama existe en remoto y local está sincronizado:**
Al final del rebase → `git push --force-with-lease` (destructivo, pedir confirmación).

**Caso R3 — la rama existe en remoto y local está adelantado (commits sin push):**

```
ℹ️ Tu rama local tiene N commits sin push:
  ● xyz9999 "mensaje"

Se incluirán en el rebase junto con los que ya están en GitHub.
```

Al final del rebase → `git push --force-with-lease` (destructivo, pedir confirmación). El force push sube todo (los rebaseados que ya estaban + los nuevos locales).

**Caso R4 — la rama remota está adelantada respecto a la local** (raro, ej. cambios desde otra máquina):

```
⚠️ La rama en GitHub tiene N commits que no tenés local:
  ● 111aaaa "mensaje"

Antes de rebasar, hay que traer esos cambios:
> git pull --rebase
> Trae los commits nuevos del remoto sin ensuciar la historia.

¿Los traemos y sigo? (sí / no)
```

Si dice sí → `git pull --rebase` y luego seguir con el flujo normal.

### Flujo completo del rebase

Después del pre-check y de resolver los estados anteriores, ejecutar:

```bash
# 1. Ver qué hay nuevo en main (para informar al usuario qué llega)
git log --oneline HEAD..origin/main

# 2. Rebase de la rama actual sobre main
git rebase origin/main

# 3. (si hay conflictos) resolverlos y continuar:
#    git add archivo-resuelto
#    git rebase --continue

# 4. Push final: SEGÚN los casos R1-R4 del pre-check
#    R1 → NO se hace push (rama queda local)
#    R2/R3 → git push --force-with-lease (destructivo, pide confirmación)
#    R4 → ya se resolvió con git pull --rebase antes, seguir con R2/R3
```

### Notas de comportamiento

- **Nunca crear la rama en el remoto automáticamente.** Si la rama es solo local (Caso R1), el rebase termina sin push. El usuario debe pedirlo explícitamente si quiere subirla.
- Si aparecen conflictos en el rebase, detenerse, avisar al usuario, y ayudar a resolverlos archivo por archivo antes de continuar.
- Después del rebase (en casos R2/R3), VS Code mostrará "Sync Changes X↓ Y↑" hasta que se haga el force push. Avisar al usuario que NO le dé a "Sync Changes" (haría merge y duplicaría commits) — la forma correcta es `git push --force-with-lease`.
- Los commits locales sin push se rebasan igual que los demás. Lo único que cambia es el push del final según el caso R1-R4.
- El agente debe MOSTRAR el resultado de cada check del pre-check al usuario antes de tomar acción, para que sepa qué está pasando.

## Regla especial: comandos destructivos

Para estos comandos, agregar una advertencia extra:
- `git reset --hard` → "Esto BORRA cambios no commiteados. No se puede deshacer."
- `git push --force` → "Esto reescribe la historia del remoto. Puede afectar a otros."
- `git clean -f` → "Esto elimina archivos no trackeados del disco."
- `git branch -D` → "Esto elimina la rama aunque tenga commits sin mergear."

Formato:
```
⚠️ Comando destructivo:
> git [comando]
> [explicación del riesgo]
> ¿Estás seguro?
```

## Comandos de solo lectura (ejecutar sin pedir permiso)

Estos comandos se ejecutan directamente SIN esperar confirmación, pero DESPUÉS de mostrar el resultado el agente debe agregar una explicación breve (1 línea) de lo que hizo el comando, para que el usuario aprenda:

- `git status`
- `git log`
- `git branch` (sin -D/-d)
- `git diff`
- `git show`
- `git stash list`
- `git merge-base`
- `git fetch` (solo descarga, no modifica nada local)

Formato después de ejecutar:
```
[resultado del comando]

📖 Esto [explicación de lo que hizo en 1 línea].
```

## Ejemplos de explicación

| Comando | Explicación |
|---------|-------------|
| `git add archivo.tsx` | "Prepara este archivo para el próximo commit" |
| `git commit -m "..."` | "Guarda los cambios staged como un punto en la historia" |
| `git push -u origin rama` | "Sube tu rama al remoto (GitHub) por primera vez" |
| `git pull` | "Trae los cambios del remoto y los aplica a tu rama actual" |
| `git merge rama` | "Combina los cambios de [rama] en tu rama actual" |
| `git rebase origin/main` | "Mueve tus commits encima del último estado de origin/main" |
| `git stash` | "Guarda tus cambios temporalmente sin hacer commit" |
| `git checkout -b nueva` | "Crea una rama nueva y te mueve a ella" |
