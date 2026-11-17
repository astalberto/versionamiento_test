# versionamiento_test

Repo de **prueba** de la plantilla de CI/CD y versionamiento: política de PR, CI por app y releases automáticos. No es un producto. Lo que se valida aquí se reutiliza después en otros repos.

## Qué hay

- `.github/`: workflows, scripts y rulesets (detalle en `.claude/rules/ci-cd.md`).
- `scripts/setup-repo.sh`: configura el repo en GitHub (staging, etiquetas, rulesets, v1.0.0).
- `apps/web/`: app demo en Node sin dependencias. Solo existe para que el CI tenga algo que verificar.
- `CONTRIBUTING.md`: el flujo completo de ramas, PRs, versiones y releases.

## Idioma

- Código, comentarios, documentación, issues y PRs en **español**.
- Los tipos de Conventional Commits van en inglés (`feat`, `fix`…).
- Los comentarios explican el **porqué**, no el qué.

## Flujo de Git (obligatorio)

- **Ramas:** `main` es producción y rama por defecto, y solo recibe la promoción y los hotfix; `staging` es desarrollo: todo el trabajo va ahí (al abrir el PR, cambia la base a `staging`).
- **Ramas de trabajo:** salen de `origin/staging` como `<tipo>/<descripcion-kebab>` o, si hay issue, `<tipo>/<issue>-<descripcion-kebab>` (p. ej. `feat/saludo-formal`, `feat/1-saludo-formal`). El issue es opcional.
  - Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
  - Urgencias de producción: `hotfix/[<issue>-]<descripcion>` desde `origin/main`.
- **Título del PR:** Conventional Commit con el mismo tipo de la rama, por ejemplo `feat(web): saludo formal`. Si hay issue, el cuerpo lleva `Closes #<issue>`.
- **Merge:** **squash** hacia staging; **merge commit** en la promoción (`staging → main`) y en la sincronización (`main → staging`).
- **Checks requeridos:** `pr-policy` y `ci-ok`, más 1 aprobación.
- **Nunca:** push directo a `main` o `staging`, `git push --force` a ramas compartidas, ni crear o mover tags `v*` a mano.

## Versionado

- Promoción: sube **minor**. Hotfix: sube **patch**. **Major** solo con la etiqueta `version:mayor` en el PR de promoción.
- Los releases se titulan `vX.Y.Z`. La promoción se hace cuando lo acumulado en staging está listo, sin calendario fijo.
- La versión oficial es el tag que crea `release.yml`: no subas versiones a mano en `package.json`.

## Verificación antes de abrir un PR (igual que el CI)

- **Demo:** `cd apps/web && npm ci && npm run lint && npm test`
- **Pipeline:** `node --test ".github/scripts/**/*.test.js"`
