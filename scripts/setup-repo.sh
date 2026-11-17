#!/usr/bin/env bash
# Configura un repo de GitHub con el flujo de ramas y versiones del equipo
# (CONTRIBUTING.md § Configuración inicial). Es idempotente: se puede volver
# a correr para re-aplicar la configuración.
#
# Uso, como admin del repo y con gh autenticado (gh auth login):
#   scripts/setup-repo.sh <owner>/<repo>
#
# Requisitos: gh y node. Córrelo justo después de subir esta base a main: el
# commit actual de main queda como línea base v1.0.0.
set -euo pipefail

REPO="${1:?Uso: scripts/setup-repo.sh <owner/repo>}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZONA="${TZ_EQUIPO:-America/Guayaquil}"

paso() { printf '\n▶ %s\n' "$*"; }
aviso() { printf '  ⚠️  %s\n' "$*" >&2; }

# Lee un campo de un JSON por stdin (evita problemas de rutas en Windows).
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{$1})"; }

command -v gh >/dev/null || { echo "Falta gh: https://cli.github.com" >&2; exit 1; }
command -v node >/dev/null || { echo "Falta node (lee los JSON de .github/)" >&2; exit 1; }
gh auth status >/dev/null

paso "Repositorio $REPO"
VISIBILIDAD="$(gh repo view "$REPO" --json visibility --jq .visibility)"
MAIN_SHA="$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)"
echo "  visibilidad: $VISIBILIDAD · main en ${MAIN_SHA:0:7}"

paso "Rama staging (desde main)"
if gh api "repos/$REPO/git/ref/heads/staging" >/dev/null 2>&1; then
  echo "  staging ya existe"
else
  gh api "repos/$REPO/git/refs" -f ref=refs/heads/staging -f sha="$MAIN_SHA" >/dev/null
  echo "  staging creada en ${MAIN_SHA:0:7}"
fi

paso "Ajustes de merge"
# Squash para el trabajo hacia staging (un PR = un commit con el título del
# PR); merge commit para la promoción y la sincronización. Rebase desactivado:
# reescribe commits y rompe la comparación entre ramas. main queda como rama
# por defecto: el trabajo igual va a staging (pr-policy rechaza PRs de trabajo
# hacia main) y los issues se cierran cuando el cambio llega a producción.
gh api -X PATCH "repos/$REPO" \
  -f default_branch=main \
  -F allow_squash_merge=true -F allow_merge_commit=true -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY \
  -f merge_commit_title=PR_TITLE -f merge_commit_message=PR_BODY >/dev/null
echo "  rama por defecto: main · squash y merge commit · sin rebase"

paso "Etiquetas"
# Las area:* salen de .github/labeler.yml, la misma fuente que etiqueta los PRs.
{
  sed -nE 's/^"(area:[^"]+)":.*/\1/p' "$RAIZ/.github/labeler.yml" | while read -r area; do
    printf '%s\t%s\t%s\n' "$area" ededed "Área: ${area#area:}"
  done
  printf '%s\t%s\t%s\n' \
    promocion 0e8a16 "Promoción staging → main (sube minor)" \
    hotfix d93f0b "Corrección urgente directa a main (sube patch)" \
    sincronizacion c5def5 "Sincronización main → staging tras un hotfix" \
    dependencias bfdadc "Actualizaciones de Dependabot" \
    version:mayor b60205 "En una promoción: publica MAJOR en vez de minor"
} | while IFS=$'\t' read -r nombre color descripcion; do
  gh label create "$nombre" --repo "$REPO" --color "$color" --description "$descripcion" --force >/dev/null
  echo "  ✓ $nombre"
done

paso "Variables del repo"
# Zona horaria de las fechas de los releases.
gh variable set TZ_EQUIPO --repo "$REPO" --body "$ZONA"
echo "  TZ_EQUIPO = $ZONA"

paso "Línea base v1.0.0"
if gh api "repos/$REPO/git/ref/tags/v1.0.0" >/dev/null 2>&1; then
  echo "  v1.0.0 ya existe"
else
  gh release create v1.0.0 --repo "$REPO" --target "$MAIN_SHA" --latest \
    --title "v1.0.0 · Línea base" \
    --notes "Línea base del proyecto. Desde aquí, cada promoción staging → main publica un minor y cada hotfix un patch." >/dev/null
  echo "  v1.0.0 creada en ${MAIN_SHA:0:7}"
fi

paso "Rulesets (.github/rulesets)"
reglas_ok=true
for archivo in "$RAIZ"/.github/rulesets/*.json; do
  nombre="$(json 'console.log(JSON.parse(s).name)' <"$archivo")"
  id="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$nombre\") | .id" 2>/dev/null || true)"
  if [[ -n "$id" ]]; then
    metodo=PUT ruta="repos/$REPO/rulesets/$id"
  else
    metodo=POST ruta="repos/$REPO/rulesets"
  fi
  if salida="$(gh api -X "$metodo" "$ruta" --input - <"$archivo" 2>&1)"; then
    echo "  ✓ $nombre"
  else
    reglas_ok=false
    aviso "No se pudo aplicar «$nombre»: $salida"
  fi
done

paso "Borrado automático de ramas fusionadas"
# Solo con rulesets: ellos impiden que se borren main y staging cuando son la
# rama de origen de un PR (sincronización y promoción). Sin ellos, fusionar
# la sincronización borraría main.
if [[ "$reglas_ok" == true ]]; then
  gh api -X PATCH "repos/$REPO" -F delete_branch_on_merge=true >/dev/null
  echo "  activado"
else
  gh api -X PATCH "repos/$REPO" -F delete_branch_on_merge=false >/dev/null
  aviso "Desactivado: sin rulesets, main y staging no están protegidas."
  if [[ "$VISIBILIDAD" != "PUBLIC" ]]; then
    aviso "En el plan Free los rulesets solo funcionan en repos públicos (o con GitHub Team/Pro)."
    aviso "Sin ellos los checks informan pero no bloquean: el flujo queda a disciplina del equipo."
  fi
fi

printf '\n✅ Listo. Siguientes pasos:\n'
echo "  1. (Opcional) Crear .github/equipo.json con nombres y roles para las notas (PR a staging)."
echo "  2. Cada integrante: git fetch && git switch staging."
echo "  3. Para publicar: PR staging → main («Create a merge commit») → Release."
