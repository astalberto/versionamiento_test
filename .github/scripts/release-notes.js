'use strict';

// Notas de versión: quién hizo qué, de qué área y quién lo aprobó. Las usan
// release.js (GitHub Release en main y resumen de staging) y pr-policy.js
// (vista previa en el PR de promoción).

const fs = require('node:fs');
const path = require('node:path');
const { parseRama, parseTitulo, issueEnCuerpo } = require('./rules.js');

const SECCIONES = [
  { titulo: '✨ Funcionalidades', tipos: ['feat'] },
  { titulo: '🐛 Correcciones', tipos: ['fix'] },
  { titulo: '⚡ Rendimiento', tipos: ['perf'] },
  { titulo: '♻️ Refactorización', tipos: ['refactor'] },
  { titulo: '📚 Documentación', tipos: ['docs'] },
  { titulo: '✅ Pruebas', tipos: ['test'] },
  { titulo: '🏗️ Build y CI', tipos: ['build', 'ci'] },
  { titulo: '🧹 Mantenimiento', tipos: ['chore', 'style'] },
  { titulo: '⏪ Reversiones', tipos: ['revert'] },
];
// Promociones (head staging) y sincronizaciones (head main) solo mueven
// trabajo entre ramas: no son aporte nuevo y no van en las notas.
const HEADS_EXCLUIDOS = new Set(['staging', 'main']);
const POR_PAGINA = 100;
const MAX_PAGINAS_COMPARE = 20;
const MARGEN_MS = 2 * 24 * 60 * 60 * 1000;

// equipo.json es opcional: sin él, las notas muestran el @login de cada autor
// y el área sale del nombre de la etiqueta (area:web → web).
function cargarEquipo(raiz = process.env.GITHUB_WORKSPACE || process.cwd()) {
  try {
    return JSON.parse(fs.readFileSync(path.join(raiz, '.github', 'equipo.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { integrantes: [], areas: {} };
    throw e;
  }
}

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
// para commits que no están en la rama por defecto solo devuelve PRs
// abiertos, y los squash de staging no están en main hasta la promoción.
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

  const resultado = [];
  for (const pr of prs.values()) {
    const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number: pr.number, per_page: POR_PAGINA });
    // Evidencia de revisión por pares: quién aprobó (sin contar al autor).
    const aprobadores = [
      ...new Set(reviews.filter((r) => r.state === 'APPROVED' && r.user && r.user.login !== pr.user.login).map((r) => r.user.login)),
    ];
    resultado.push(normalizarPR(pr, aprobadores));
  }
  return resultado.sort((a, b) => a.numero - b.numero);
}

function normalizarPR(pr, aprobadores = []) {
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
    areas: (pr.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter((n) => n.startsWith('area:')),
    issue: rama.issue || issueEnCuerpo(pr.body),
    rama: pr.head.ref,
    aprobadores,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────

function escapar(texto) {
  return String(texto).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// En el Release las menciones (@login) enlazan a los contribuidores; en el
// comentario de vista previa van como código para no notificar en cada push.
function usuario(login, menciones) {
  return menciones ? `@${login}` : `\`@${login}\``;
}

function integrante(login, equipo) {
  const buscado = login.toLowerCase();
  const m = (equipo.integrantes || []).find((i) => i.github && i.github.toLowerCase() === buscado);
  return m ? { nombre: m.nombre, rol: m.rol } : { nombre: null, rol: '—' };
}

function areasDe(pr, equipo) {
  if (pr.areas.length === 0) return ['General'];
  return pr.areas.map((label) => ((equipo.areas || {})[label] ? equipo.areas[label].nombre : label.replace(/^area:/, '')));
}

function plural(n, palabra) {
  return `${n} ${palabra}${n === 1 ? '' : 's'}`;
}

function renderizarNotas({ prs, equipo, titulo = null, subtitulo = '', compareUrl = null, menciones = true }) {
  const humanos = prs.filter((p) => !p.esBot);
  const bots = prs.filter((p) => p.esBot);
  const autores = [...new Set(humanos.map((p) => p.autor))];

  const lineas = [];
  if (titulo) lineas.push(`## ${titulo}`, '');
  const meta = [subtitulo, plural(prs.length, 'PR'), plural(autores.length, 'integrante')];
  if (compareUrl) meta.push(`[ver diferencias](${compareUrl})`);
  lineas.push(`_${meta.filter(Boolean).join(' · ')}_`, '');

  if (prs.length === 0) {
    lineas.push('Sin cambios en este rango.');
    return `${lineas.join('\n')}\n`;
  }

  if (humanos.length > 0) {
    const filas = autores.map((login) => {
      const suyos = humanos.filter((p) => p.autor === login);
      const info = integrante(login, equipo);
      const feat = suyos.filter((p) => p.tipo === 'feat').length;
      const fix = suyos.filter((p) => p.tipo === 'fix').length;
      return {
        orden: [-suyos.length, info.nombre || login],
        celdas: [
          info.nombre ? `${info.nombre} (${usuario(login, menciones)})` : usuario(login, menciones),
          info.rol,
          suyos.length,
          feat,
          fix,
          suyos.length - feat - fix,
          [...new Set(suyos.flatMap((p) => areasDe(p, equipo)))].join(', '),
        ],
      };
    });
    filas.sort((a, b) => a.orden[0] - b.orden[0] || a.orden[1].localeCompare(b.orden[1], 'es'));
    lineas.push('### 👥 Aporte por integrante', '');
    lineas.push('| Integrante | Rol | PRs | ✨ feat | 🐛 fix | Otros | Áreas |', '|---|---|---:|---:|---:|---:|---|');
    for (const f of filas) lineas.push(`| ${f.celdas.map(escapar).join(' | ')} |`);
    lineas.push('');
  }

  const conocidos = new Set(SECCIONES.flatMap((s) => s.tipos));
  for (const s of [...SECCIONES, { titulo: '📦 Otros', tipos: null }]) {
    const deTipo = humanos.filter((p) => (s.tipos ? s.tipos.includes(p.tipo) : !conocidos.has(p.tipo)));
    if (deTipo.length === 0) continue;
    lineas.push(`### ${s.titulo}`, '');
    lineas.push('| PR | Cambio | Integrante | Área | Issue | Aprobó |', '|---|---|---|---|---|---|');
    for (const p of deTipo) {
      const cambio = `${p.scope ? `\`${p.scope}\` ` : ''}${p.breaking ? '⚠️ **BREAKING** ' : ''}${p.descripcion}`;
      const autor = integrante(p.autor, equipo).nombre || usuario(p.autor, menciones);
      const aprobo = p.aprobadores.length ? p.aprobadores.map((a) => usuario(a, menciones)).join(', ') : '—';
      const celdas = [cambio, autor, areasDe(p, equipo).join(', '), p.issue ? `#${p.issue}` : '—', aprobo].map(escapar);
      lineas.push(`| [#${p.numero}](${p.url}) | ${celdas.join(' | ')} |`);
    }
    lineas.push('');
  }

  if (bots.length > 0) {
    lineas.push('### 🤖 Dependencias', '');
    for (const p of bots) lineas.push(`- [#${p.numero}](${p.url}) ${escapar(p.titulo)}`);
    lineas.push('');
  }

  return `${lineas.join('\n').trimEnd()}\n`;
}

module.exports = {
  cargarEquipo,
  listarTags,
  commitsEntre,
  prFusionadoEn,
  recolectarPRs,
  normalizarPR,
  renderizarNotas,
};
