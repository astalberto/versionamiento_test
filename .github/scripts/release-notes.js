'use strict';

// Notas de versión en estilo changelog: una lista corta por sección y una
// línea por PR. Las usan release.js (GitHub Release en main y resumen de
// staging) y pr-policy.js (vista previa en el PR de promoción).

const { parseRama, parseTitulo, issueEnCuerpo } = require('./rules.js');

// Lo que ve quien usa el proyecto va primero; lo interno (docs, CI, pruebas,
// dependencias…) se agrupa al final en Mantenimiento.
const SECCIONES = [
  { titulo: 'Agregado o cambiado', tipos: ['feat', 'perf', 'refactor'] },
  { titulo: 'Corregido', tipos: ['fix'] },
  { titulo: 'Revertido', tipos: ['revert'] },
  { titulo: 'Mantenimiento', tipos: null }, // el resto de tipos y los bots
];
// Promociones (head staging) y sincronizaciones (head main) solo mueven
// trabajo entre ramas: no son aporte nuevo y no van en las notas.
const HEADS_EXCLUIDOS = new Set(['staging', 'main']);
const POR_PAGINA = 100;
const MAX_PAGINAS_COMPARE = 20;
const MARGEN_MS = 2 * 24 * 60 * 60 * 1000;

// ─── Lectura del repo ─────────────────────────────────────────────────────

async function listarTags({ github, owner, repo }) {
  const tags = await github.paginate(github.rest.repos.listTags, { owner, repo, per_page: POR_PAGINA });
  return tags.map((t) => ({ name: t.name, sha: t.commit.sha }));
}

// Commits de base...head por ancestría: lo que head tiene y base no. Es lo
// mismo que `git log base..head`, sin depender de fechas.
async function commitsEntre({ github, owner, repo, base, head }) {
  const commits = [];
  for (let page = 1; page <= MAX_PAGINAS_COMPARE; page++) {
    const { data } = await github.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${base}...${head}`,
      per_page: POR_PAGINA,
      page,
    });
    commits.push(...data.commits);
    if (data.commits.length < POR_PAGINA) break;
  }
  return commits;
}

// PR fusionado cuyo merge commit es `sha`. El recién fusionado está entre los
// últimos PRs cerrados hacia `base`.
async function prFusionadoEn({ github, owner, repo, base, sha }) {
  const { data } = await github.rest.pulls.list({ owner, repo, state: 'closed', base, sort: 'updated', direction: 'desc', per_page: 30 });
  return data.find((pr) => pr.merged_at && pr.merge_commit_sha === sha) || null;
}

// PRs fusionados cuyo commit de merge (squash en staging, merge commit en
// main) está en base...head. No se usa la API "PRs asociados a un commit":
// para commits que no están en la rama por defecto (staging) solo devuelve
// PRs abiertos, y los merges de main no están en staging.
async function recolectarPRs({ github, owner, repo, base, head }) {
  const commits = await commitsEntre({ github, owner, repo, base, head });
  if (commits.length === 0) return [];
  const shas = new Set(commits.map((c) => c.sha));
  const desde = Math.min(...commits.map((c) => Date.parse(c.commit.committer.date))) - MARGEN_MS;

  const prs = new Map();
  for (const rama of ['staging', 'main']) {
    const paginas = github.paginate.iterator(github.rest.pulls.list, {
      owner,
      repo,
      state: 'closed',
      base: rama,
      sort: 'updated',
      direction: 'desc',
      per_page: POR_PAGINA,
    });
    recorrido: for await (const { data } of paginas) {
      for (const pr of data) {
        // updated_at ≥ merged_at: pasado el límite ya no quedan PRs del rango.
        if (Date.parse(pr.updated_at) < desde) break recorrido;
        if (pr.merged_at && shas.has(pr.merge_commit_sha) && !HEADS_EXCLUIDOS.has(pr.head.ref)) prs.set(pr.number, pr);
      }
    }
  }

  return [...prs.values()].map(normalizarPR).sort((a, b) => a.numero - b.numero);
}

function normalizarPR(pr) {
  const t = parseTitulo(pr.title);
  const rama = parseRama(pr.head.ref);
  return {
    numero: pr.number,
    url: pr.html_url,
    titulo: pr.title,
    tipo: t ? t.tipo : 'otro',
    scope: t ? t.scope : null,
    breaking: t ? t.breaking : false,
    descripcion: t ? t.descripcion : pr.title,
    autor: pr.user.login,
    esBot: pr.user.type === 'Bot' || rama.clase === 'dependabot',
    issue: rama.issue || issueEnCuerpo(pr.body),
    rama: pr.head.ref,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────

function seccionDe(pr) {
  if (pr.esBot) return 'Mantenimiento';
  const s = SECCIONES.find((x) => x.tipos && x.tipos.includes(pr.tipo));
  return s ? s.titulo : 'Mantenimiento';
}

// "función despedir" → "- Función despedir (#2)", con aviso si rompe compatibilidad.
function linea(pr) {
  const texto = String(pr.descripcion).replace(/\r?\n/g, ' ').trim();
  const frase = texto.charAt(0).toUpperCase() + texto.slice(1);
  return `- ${pr.breaking ? '**Incompatible:** ' : ''}${frase} ([#${pr.numero}](${pr.url}))`;
}

function renderizarNotas({ prs, titulo = null, subtitulo = '', compareUrl = null }) {
  const lineas = [];
  if (titulo) lineas.push(`## ${titulo}`, '');

  if (prs.length === 0) {
    lineas.push('Sin cambios.', '');
  } else {
    for (const { titulo: seccion } of SECCIONES) {
      const deSeccion = prs.filter((p) => seccionDe(p) === seccion);
      if (deSeccion.length > 0) lineas.push(`### ${seccion}`, ...deSeccion.map(linea), '');
    }
  }

  const pie = [subtitulo];
  if (compareUrl) pie.push(`[Ver cambios](${compareUrl})`);
  const meta = pie.filter(Boolean).join(' · ');
  if (meta) lineas.push(`<sub>${meta}</sub>`);

  return `${lineas.join('\n').trimEnd()}\n`;
}

module.exports = {
  listarTags,
  commitsEntre,
  prFusionadoEn,
  recolectarPRs,
  normalizarPR,
  renderizarNotas,
};
