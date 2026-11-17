# Cómo contribuir

Flujo de ramas, versiones y CI del repositorio. GitHub aplica las reglas con rulesets y con los checks `pr-policy` y `ci-ok`. Este documento explica qué piden y cómo cumplirlas.

## Flujo en una imagen

```
(issue #42, opcional) ─► feat/42-login-oauth ──PR (squash)──► staging ──(cuando se quiera publicar)──► PR de promoción (merge commit) ──► main ─► v1.1.0
hotfix/57-crash (desde main) ──PR (merge commit)──► main ─► v1.1.1 ─► PR de sincronización main → staging (merge commit)
```

| Rama | Papel | Cómo llega el código |
|---|---|---|
| `staging` | Desarrollo. Aquí aportamos todos. | PR con **squash** desde `<tipo>/<descripcion>` o `<tipo>/<issue>-<descripcion>` |
| `main` | Producción y rama por defecto. Nadie hace push directo. | PR de promoción o PR de hotfix, con **merge commit** |

## 1. Issue (opcional)

Si la tarea tiene issue (plantilla **Tarea**: área, tipo y criterios de aceptación), pon su número en el nombre de la rama: así queda enlazado rama → issue → PR → release y el issue se cierra cuando el cambio llega a `main`. Para cambios pequeños puedes saltarte el issue.

## 2. Crea la rama desde staging

```bash
git fetch origin
git switch -c feat/42-login-oauth origin/staging
```

Formato: `<tipo>/<descripcion-en-kebab>` (p. ej. `feat/login-oauth`) o, con issue, `<tipo>/<issue>-<descripcion-en-kebab>`. Solo minúsculas, números y guiones, sin subcarpetas. Sin issue, la descripción empieza por letra.

| Tipo | Para qué | Ejemplo |
|---|---|---|
| `feat` | Funcionalidad nueva | `feat/42-login-oauth` |
| `fix` | Corrección | `fix/57-timeout-api` |
| `docs` | Documentación | `docs/61-vista-despliegue` |
| `style` | Formato, sin cambio de lógica | `style/63-lint-web` |
| `refactor` | Reestructurar sin cambiar el comportamiento | `refactor/64-repositorio-usuarios` |
| `perf` | Rendimiento | `perf/65-cache-respuestas` |
| `test` | Pruebas | `test/66-e2e-chat` |
| `build` | Build y dependencias | `build/67-actualizar-next` |
| `ci` | Pipeline | `ci/68-cache-flutter` |
| `chore` | Mantenimiento | `chore/69-limpiar-assets` |
| `revert` | Revertir un cambio con `git revert` | `revert/70-login-oauth` |

- GitHub rechaza crear ramas con otro prefijo (ruleset `nombres-de-rama`), y el check `pr-policy` valida el formato y, si la rama lleva número, que el issue exista y esté abierto.
- El botón «Create a branch» de un issue sugiere `42-titulo`: cámbialo a `feat/42-titulo` antes de crearla.
- El botón «Revert» de un PR crea ramas `revert-…` que el ruleset bloquea. Usa `git revert` en una rama `revert/…`.
- ¿Te equivocaste de nombre? GitHub → Branches → ✏️ Rename. El PR se mantiene.

## 3. Abre el PR hacia staging

- **Título:** un Conventional Commit con el **mismo tipo de la rama**, por ejemplo `feat(web): login con OAuth`. El scope es opcional y suele ser el nombre de la app o carpeta (`web`, `api`, `ci`, `docs`…).
- **Base:** `staging`. Como `main` es la rama por defecto, GitHub propone `main`: cámbiala, o `pr-policy` lo rechazará.
- **Cuerpo:** si la rama lleva issue, `Closes #42`. Si falta, el bot lo agrega. El issue se cierra cuando el cambio llega a `main` (en la promoción).
- **Bot «🤖 Política de PR»:** comenta qué está bien y qué falta. Las etiquetas `area:*` se ponen solas según las carpetas que toques.
- **Para fusionar:** checks `pr-policy` y `ci-ok` en verde, 1 aprobación de otro integrante y conversaciones resueltas.
- **Método:** **Squash and merge**. El commit en staging queda con el título del PR, que es lo que leen las notas de versión.

## 4. CI por app

El workflow **CI** verifica solo los proyectos de `apps/*` y `services/*` que cambiaron, según su manifiesto:

| Manifiesto | Qué corre |
|---|---|
| `pubspec.yaml` | `dart format` · `flutter analyze` · `flutter test` · `flutter build apk --debug` |
| `package.json` + lockfile | install (npm, pnpm o yarn según el lockfile) y los scripts `lint`, `typecheck`, `test` y `build` que existan |
| `pyproject.toml` | `uv sync` · `ruff check` · `ruff format --check` · `pytest` |

- Commitea el lockfile: sin él el job falla, porque la instalación no sería reproducible.
- Antes del PR, corre lo mismo en local (comandos en `.claude/CLAUDE.md` § Verificación).
- Para forzar todos los proyectos: Actions → CI → Run workflow → «todos».
- Variables opcionales del repo: `NODE_VERSION` (por defecto 22) y `FLUTTER_VERSION` (por defecto el último estable).

## 5. Promoción (staging → main)

Cuando lo acumulado en staging esté listo para publicarse, quien lidere la promoción:

1. Abre el PR con base `main` y compare `staging`.
2. El bot fija el título `chore(release): v1.X.0` y comenta la **vista previa de las notas**.
3. Revisa, aprueba y espera los checks en verde.
4. Fusiona con **Create a merge commit**. Es el único método permitido en main: squash colapsaría todo lo acumulado en un solo commit.
5. El workflow **Release** publica `v1.X.0`.

Reglas de la promoción:

- **Major** (por ejemplo la entrega final 2.0.0): pon la etiqueta `version:mayor` al PR de promoción antes de fusionar.
- No uses «Update branch» en el PR de promoción.

## 6. Hotfix (urgencias en producción)

1. Crea una rama desde main (con issue si lo hay): `git switch -c hotfix/crash-al-cargar origin/main`.
2. Abre el PR hacia `main` con título `fix(...): ...` y fusiónalo con merge commit.
3. Release publica `v1.X.1`.
4. **Sincroniza:** abre el PR `main → staging` (el resumen del run de Release trae el enlace) y fusiónalo con **Create a merge commit**. La siguiente promoción queda bloqueada hasta hacerlo.

## 7. Versionado

| Evento | Incremento | Ejemplo |
|---|---|---|
| Promoción | minor | 1.1.0 → 1.2.0 |
| Hotfix | patch | 1.2.0 → 1.2.1 |
| Promoción con etiqueta `version:mayor` | major | 1.9.0 → 2.0.0 |

- Los releases se titulan `vX.Y.Z`. Las notas llevan la fecha de publicación en la zona `TZ_EQUIPO` (por defecto `America/Guayaquil`).
- Los tags `v*` los crea solo el workflow, y nadie puede moverlos ni borrarlos (ruleset `tags-de-version`).

## 8. Aporte por integrante

- **Releases** → cada `vX.Y.Z` incluye:
  - la tabla **Aporte por integrante**: rol, PRs, feat, fix y áreas;
  - el detalle por tipo, con PR, área, issue y quién aprobó.
- **Antes de promover:** Actions → Release → último run en `staging` → resumen «Aporte acumulado».
- Opcional: con un `.github/equipo.json` (`integrantes`: `github`, `nombre`, `rol`; `areas`: nombre visible por etiqueta) las notas muestran nombres y roles. Sin él, aparece solo el `@login` y el nombre de la etiqueta.

## 9. Configuración inicial (admins)

1. Crea el repo en GitHub. Debe ser **público**: en el plan Free los rulesets no se aplican a repos privados.
2. Copia esta base a la raíz del repo, haz el primer commit en `main` (`chore: línea base del repositorio`) y súbelo con push.
3. Ejecuta `gh auth login` y luego `scripts/setup-repo.sh <owner>/<repo>`.
4. Comprueba:
   - Settings → Rules muestra 4 rulesets;
   - Releases muestra `v1.0.0`;
   - la rama por defecto es `main` y existe `staging`.

> En un repo privado del plan Free, los checks informan pero no bloquean y el borrado automático de ramas queda desactivado. El flujo depende entonces de la disciplina del equipo.

## 10. Próxima fase: deploy

La referencia de deploy (staging manual, producción al promover) encaja así:

- **`deploy-production.yml`** (`on: push` a main):
  - primer job `release: uses: ./.github/workflows/release.yml` (y se quita el trigger push de main en `release.yml`);
  - luego checks y build en paralelo, y el deploy con `needs`, estampando `needs.release.outputs.version` en el build.
- **`deploy-staging.yml`** (manual, `workflow_dispatch`): puede cortar prereleases `vX.Y.0-rc.N`, que no mueven la versión estable.
- **Ambos:**
  - environments `staging` y `production` con sus secretos;
  - acceso a la nube por OIDC (Workload Identity), sin llaves de larga duración;
  - `timeout-minutes` en cada job y `concurrency` que no cancele un deploy en curso.
- **Pendiente:** `devsecops.yml` (análisis estático y escaneo de seguridad).
