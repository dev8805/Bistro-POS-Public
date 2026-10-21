# Fix CI: deploy a Firebase Hosting marcaba rojo aunque el sitio se actualizaba

**Fecha:** 2026-06-29
**Archivo modificado:** `.github/workflows/firebase-hosting-merge.yml`
**Tipo:** Fix de CI/CD (no toca código de la app)

---

## Síntoma

En cada push a `main`, el job `build_and_deploy` de GitHub Actions fallaba (❌) en el paso
`FirebaseExtended/action-hosting-deploy@v0`, **pero el sitio en producción sí quedaba
actualizado**. Fallaba igual en el push inicial y en los re-run (consistente, no era una carrera).

Error del log:

```
"Can't release to projects/-/sites/***/channels/live:
 supplied version .../versions/70ef7a1fd06285f1 is the current active version."
status: FAILED_PRECONDITION  (HTTP 400)
The process '/usr/local/bin/npx' failed with exit code 1
```

> Nota: el check verde de **Cloudflare Pages** seguía pasando. El dominio `posbistro.online`
> está conectado a **Firebase Hosting** (dominio personalizado), por eso interesa que ese
> deploy quede en verde.

## Causa raíz (confirmada con debug)

Es un **bug de `firebase-tools` v15.x** (`@latest` instaló 15.22.3) al desplegar al canal `live`,
no de la acción ni de permisos:

```
✓ version finalized         ← al finalizar, la versión YA queda activa
i releasing new version...  ← el deploy intenta publicarla otra vez
Error: 400 ... esa versión ya es la activa  ← choca con su propio paso anterior
```

El `deploy` finaliza la versión **y la activa**, pero luego ejecuta una publicación redundante
que choca con un 400. Evidencia que lo confirma:

- Falla **siempre** (push y re-run aislado) → determinista, no es una carrera/concurrencia.
- Falla con la acción vieja **y** con `firebase deploy` directo → el bug está en firebase-tools.
- Cada deploy crea una versión con id distinta, pero igual dice "ya activa" (la activó al finalizar).
- En local funciona porque suele haber una versión más antigua de firebase-tools instalada.

> Nota: la "Explain error" de GitHub sugería mismatch de proyecto/permisos. Es incorrecto para
> este caso: la subida y finalización de la versión tuvieron éxito (prueba de que el service
> account y el proyecto/site son correctos); solo falla la publicación redundante.

## Solución aplicada

Como el despliegue **sí tiene éxito** (la versión queda activa y el sitio se actualiza), el paso
de deploy ahora **tolera únicamente ese error específico** (`is the current active version`) y
sale con éxito; cualquier otro error seguiría fallando el job. Se añadió además un guard de
`concurrency` como buena práctica.

```yaml
jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    concurrency:
      group: firebase-hosting-live
      cancel-in-progress: false
    steps:
      ...
      - name: Deploy a Firebase Hosting (live)
        run: |
          echo "$FIREBASE_SERVICE_ACCOUNT" > "$RUNNER_TEMP/firebase-sa.json"
          export GOOGLE_APPLICATION_CREDENTIALS="$RUNNER_TEMP/firebase-sa.json"
          set +e
          salida=$(npx firebase-tools@latest deploy --only hosting --project sistema-pos-95051 --non-interactive 2>&1)
          codigo=$?
          echo "$salida"
          if [ $codigo -ne 0 ] && echo "$salida" | grep -q "is the current active version"; then
            echo "::notice::La versión ya quedó activa (publicación redundante). Se ignora el error no fatal."
            exit 0
          fi
          exit $codigo
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_SISTEMA_POS_95051 }}
```

> Intentos previos descartados: (1) reemplazar la acción `action-hosting-deploy@v0` por el CLI
> directo — falló igual, porque el bug es de firebase-tools, no del wrapper. Por eso la solución
> final no cambia *cómo* se publica, sino que reconoce que el deploy ya tuvo éxito.

### Alternativa (no aplicada)
Fijar `firebase-tools` a una versión previa sin el bug (ej. `npx firebase-tools@13 ...`). No se
eligió por el riesgo de acertar una versión y porque la tolerancia al error funciona con cualquier
versión.

### Lo que NO se tocó
- El paso de `build` ni las variables `VITE_*`.
- Los secrets de GitHub (se reusa `FIREBASE_SERVICE_ACCOUNT_SISTEMA_POS_95051`).
- El workflow de previews de PR `firebase-hosting-pull-request.yml`.
- Código de la app ni Supabase.

## Verificación

Solo se puede comprobar en GitHub (el workflow corre allá). En el próximo push a `main`:
- El job `build_and_deploy` debe terminar en **verde**.
- El sitio en `posbistro.online` debe seguir actualizándose igual que antes.

## Referencia

Caso público idéntico (mismo error, cambios igual desplegados):
StackOverflow — "Firebase Hosting GitHub Action fails with 'supplied version is the current
active version' but changes are still deployed" (jun 2026).
*Contenido reformulado por licencia.*
