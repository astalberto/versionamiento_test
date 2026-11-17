#!/usr/bin/env bash
# Detecta qué proyectos del monorepo cambiaron y con qué stack se verifican.
# Lo usa el job `detect` de ci.yml. Escribe en $GITHUB_OUTPUT:
#   flutter   ["apps/mobile", …]                                (pubspec.yaml)
#   node      [{"dir","pm","lock","pnpm_version"}, …]           (package.json)
#   python    ["services/core-backend", …]                      (pyproject.toml)
#   pipeline  true|false                                        (cambió .github/)
#
# Proyecto = carpeta de apps/* o services/* (o services/*/*, para varios
# servicios agrupados) con su manifiesto. El stack se detecta por manifiesto
# en lugar de fijarlo en el CI, así la plantilla sirve para cualquier repo.
#
# Mismo criterio que la referencia de deploy: solo lo afectado y, ante la
# duda (sin base, diff fallido, cambio del propio CI o ejecución manual con
# `todos`), se verifica TODO.
set -euo pipefail

BASE_SHA="${BASE_SHA:-}"
HEAD_SHA="${HEAD_SHA:-HEAD}"
TODOS="${TODOS:-false}"
SALIDA="${GITHUB_OUTPUT:-/dev/stdout}"
RESUMEN="${GITHUB_STEP_SUMMARY:-/dev/null}"
CERO="0000000000000000000000000000000000000000"

todo=false
motivo="solo los proyectos con cambios"
cambios=""
if [[ "$TODOS" == "true" ]]; then
  todo=true
  motivo="todos: ejecución manual"
elif [[ -z "$BASE_SHA" || "$BASE_SHA" == "$CERO" ]]; then
  todo=true
  motivo="todos: no hay commit base (rama nueva o primer push)"
elif ! cambios="$(git diff --name-only "$BASE_SHA" "$HEAD_SHA" 2>/dev/null)"; then
  todo=true
  motivo="todos: no se pudo calcular el diff contra ${BASE_SHA:0:7}"
  echo "::warning::No se pudo calcular el diff contra $BASE_SHA; se verifican todos los proyectos."
elif grep -qE '^\.github/(workflows/ci\.yml|scripts/detect-projects\.sh)$' <<<"$cambios"; then
  todo=true
  motivo="todos: cambió el propio CI"
fi

# ¿Algún archivo cambiado está dentro de la carpeta $1? (prefijo exacto, sin regex)
afectado() {
  [[ "$todo" == true ]] && return 0
  local archivo
  while IFS= read -r archivo; do
    [[ "$archivo" == "$1/"* ]] && return 0
  done <<<"$cambios"
  return 1
}

json() {
  local IFS=,
  echo "[$*]"
}

flutter=()
node=()
python=()
filas=()
while IFS= read -r manifiesto; do
  dir="$(dirname "$manifiesto")"
  case "$(basename "$manifiesto")" in
    pubspec.yaml) stack=flutter ;;
    package.json) stack=node ;;
    *) stack=python ;;
  esac
  if ! afectado "$dir"; then
    filas+=("| \`$dir\` | $stack | — sin cambios |")
    continue
  fi
  case "$stack" in
    flutter) flutter+=("\"$dir\"") ;;
    python) python+=("\"$dir\"") ;;
    node)
      # El gestor sale del lockfile. Sin lockfile el job falla a propósito:
      # sin él la instalación no es reproducible.
      pm=npm lock="" pnpm_version=""
      if [[ -f "$dir/pnpm-lock.yaml" ]]; then
        pm=pnpm lock="$dir/pnpm-lock.yaml"
        # pnpm/action-setup lee "packageManager" del package.json; si no
        # está declarado hay que pasarle una versión explícita.
        grep -qE '"packageManager"[[:space:]]*:[[:space:]]*"pnpm@' "$dir/package.json" || pnpm_version=10
      elif [[ -f "$dir/yarn.lock" ]]; then
        pm=yarn lock="$dir/yarn.lock"
      elif [[ -f "$dir/package-lock.json" ]]; then
        lock="$dir/package-lock.json"
      fi
      node+=("{\"dir\":\"$dir\",\"pm\":\"$pm\",\"lock\":\"$lock\",\"pnpm_version\":\"$pnpm_version\"}")
      stack="node ($pm)"
      ;;
  esac
  filas+=("| \`$dir\` | $stack | ✅ se verifica |")
done < <(find apps services -mindepth 2 -maxdepth 3 \
  \( -name pubspec.yaml -o -name package.json -o -name pyproject.toml \) \
  -not -path '*/node_modules/*' -not -path '*/.dart_tool/*' -not -path '*/build/*' 2>/dev/null | sort)

pipeline=false
if [[ "$todo" == true ]] || grep -q '^\.github/' <<<"$cambios"; then
  pipeline=true
fi

{
  echo "flutter=$(json ${flutter[@]+"${flutter[@]}"})"
  echo "node=$(json ${node[@]+"${node[@]}"})"
  echo "python=$(json ${python[@]+"${python[@]}"})"
  echo "pipeline=$pipeline"
} >>"$SALIDA"

{
  echo "### Proyectos detectados"
  echo
  echo "Criterio: ${motivo}. Scripts del pipeline (\`.github/\`): $([[ "$pipeline" == true ]] && echo "✅ se verifican" || echo "— sin cambios")."
  echo
  if [[ ${#filas[@]} -eq 0 ]]; then
    echo "Aún no hay proyectos con manifiesto en \`apps/\` ni \`services/\`."
  else
    echo "| Proyecto | Stack | Estado |"
    echo "|---|---|---|"
    printf '%s\n' "${filas[@]}"
  fi
} >>"$RESUMEN"
