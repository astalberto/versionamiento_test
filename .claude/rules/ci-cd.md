---
paths:
  - ".github/**"
  - "scripts/**"
---

# Pipeline (GitHub Actions) y gobierno del repo

Plantilla reutilizable: nada de aquí depende del stack de las apps.

## Qué hay

- **`.github/workflows/pr-policy.yml`:** check requerido `pr-policy`. Valida rama, título e issue, fija el título de la promoción y la sincronización, y pone etiquetas de área.
- **`.github/workflows/ci.yml`:** CI por app afectada (`.github/scripts/detect-projects.sh`). El check requerido es `ci-ok`.
- **`.github/workflows/release.yml`:** publica `vX.Y.Z` al fusionar en main; en staging solo resume lo acumulado. Es reutilizable con `workflow_call`.
- **`.github/scripts/*.js`:** la lógica, con pruebas `node --test ".github/scripts/**/*.test.js"`. Las reglas de ramas y títulos viven **solo** en `rules.js`.
- **`.github/rulesets/*.json` y `scripts/setup-repo.sh`** (en la raíz): protección de ramas y tags, nombres de rama permitidos y ajustes de merge.

## Convenciones de los workflows

- `runs-on: ubuntu-24.04`, fijado (no `ubuntu-latest`), y `timeout-minutes` en cada job.
- `permissions` mínimos a nivel workflow; cada job eleva solo lo que necesita.
- `concurrency` explícito: el CI de un PR cancela la corrida anterior; release y deploy encolan y nunca cancelan a la mitad.
- Las acciones de terceros van fijadas por SHA con comentario de versión (`# v2.23.0`); Dependabot las actualiza. Las `actions/*` van por versión mayor.
- `actions/checkout` con `persist-credentials: false` salvo que el job haga push.
- Los comentarios en español explican el porqué de cada decisión no obvia.

## Cuidado con

- **No renombrar los jobs `pr-policy` ni `ci-ok`:** los rulesets los exigen por nombre. Un check requerido se satisface con cualquier job del mismo nombre, así que los cambios en `.github/` se revisan con lupa.
- **No usar `pull_request_target`:** desde el 02/11/2026 GitHub lo bloquea por defecto en repos públicos. Usa `pull_request`.
- **`GITHUB_TOKEN` no dispara otros workflows:** encadena con `needs` o `workflow_call`, no con eventos como `release` o `push` creados por el bot.
- **Promoción con merge commit y trabajo con squash:** las notas y el versionado dependen de esa historia. No habilites rebase.
- **Si cambia una regla de flujo:** actualiza `rules.js`, sus tests, `CONTRIBUTING.md` y `.claude/CLAUDE.md` en el mismo PR.
- **Workspace pnpm/turbo:** si el equipo adopta uno en la raíz (como la referencia de deploy), hay que adaptar `detect-projects.sh` y el job `node`, que hoy suponen un lockfile por proyecto.
