'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarEquipo, recolectarPRs, normalizarPR, renderizarNotas } = require('./release-notes.js');
const { crearGithub, pr, commit } = require('./fakes.js');

const EQUIPO = {
  integrantes: [
    { github: 'ALopez', nombre: 'Ana López', rol: 'FrontEnd' },
    { github: 'lgarcia', nombre: 'Luis García', rol: 'BackEnd' },
  ],
  areas: { 'area:web': { nombre: 'Web' }, 'area:api': { nombre: 'API' }, 'area:docs': { nombre: 'Docs' } },
};

function escenario() {
  return {
    compare: { 'v1.0.0...head': [commit('c1'), commit('c2'), commit('c3'), commit('c4', { padres: 2 })] },
    prs: [
      pr({ numero: 3, titulo: 'feat(web): login con OAuth', autor: 'alopez', head: 'feat/42-login-oauth', sha: 'c1', labels: ['area:web'] }),
      pr({ numero: 4, titulo: 'fix(api): timeout | proxy', autor: 'lgarcia', head: 'fix/50-timeout-proxy', sha: 'c2', labels: ['area:api', 'area:docs'] }),
      pr({ numero: 5, titulo: 'ci(deps): bump actions/checkout', autor: 'dependabot[bot]', head: 'dependabot/github_actions/x', sha: 'c3', bot: true }),
      // Sincronización main → staging: mueve trabajo, no es aporte.
      pr({ numero: 6, titulo: 'chore(sync): main → staging', autor: 'jtorres', head: 'main', sha: 'c4' }),
      // Fusionado antes del rango: no debe aparecer.
      pr({ numero: 2, titulo: 'feat: viejo', autor: 'alopez', head: 'feat/1-viejo', sha: 'viejo', fecha: '2026-10-01T15:00:00Z' }),
    ],
    reviews: {
      3: [
        { state: 'APPROVED', user: { login: 'mperez' } },
        { state: 'APPROVED', user: { login: 'mperez' } },
        { state: 'COMMENTED', user: { login: 'csilva' } },
      ],
      4: [{ state: 'APPROVED', user: { login: 'lgarcia' } }], // auto-aprobación: no cuenta
    },
  };
}

test('recolectarPRs: PRs del rango por ancestría, sin promociones ni sincronizaciones', async () => {
  const github = crearGithub(escenario());
  const prs = await recolectarPRs({ github, owner: 'org', repo: 'repo', base: 'v1.0.0', head: 'head' });
  assert.deepEqual(
    prs.map((p) => p.numero),
    [3, 4, 5]
  );
  assert.deepEqual(prs[0].aprobadores, ['mperez']);
  assert.deepEqual(prs[1].aprobadores, []);
  assert.equal(prs[0].issue, 42);
  assert.equal(prs[2].esBot, true);
});

test('recolectarPRs: rango vacío no consulta PRs', async () => {
  const github = crearGithub({ compare: {} });
  assert.deepEqual(await recolectarPRs({ github, owner: 'o', repo: 'r', base: 'v1.0.0', head: 'x' }), []);
});

test('normalizarPR: issue desde el cuerpo si la rama no lo trae', () => {
  const p = normalizarPR(pr({ numero: 9, titulo: 'Arreglo', autor: 'x', head: 'dependabot/npm/y', sha: 's', body: 'Refs #77' }));
  assert.equal(p.tipo, 'otro');
  assert.equal(p.issue, 77);
});

test('renderizarNotas: aporte por integrante, tablas por tipo y dependencias', async () => {
  const github = crearGithub(escenario());
  const prs = await recolectarPRs({ github, owner: 'org', repo: 'repo', base: 'v1.0.0', head: 'head' });
  const md = renderizarNotas({ prs, equipo: EQUIPO, titulo: 'v1.1.0', subtitulo: '16/10/2026', compareUrl: 'https://x/compare' });

  assert.match(md, /^## v1\.1\.0$/m);
  assert.match(md, /_16\/10\/2026 · 3 PRs · 2 integrantes · \[ver diferencias\]\(https:\/\/x\/compare\)_/);
  // Mapeo de login sin importar mayúsculas y conteos por tipo.
  assert.match(md, /\| Ana López \(@alopez\) \| FrontEnd \| 1 \| 1 \| 0 \| 0 \| Web \|/);
  assert.match(md, /\| Luis García \(@lgarcia\) \| BackEnd \| 1 \| 0 \| 1 \| 0 \| API, Docs \|/);
  assert.match(md, /### ✨ Funcionalidades/);
  assert.match(md, /\| \[#3\]\(https:\/\/github\.com\/org\/repo\/pull\/3\) \| `web` login con OAuth \| Ana López \| Web \| #42 \| @mperez \|/);
  // El "|" del título no rompe la tabla.
  assert.match(md, /timeout \\\| proxy/);
  assert.match(md, /### 🤖 Dependencias\n\n- \[#5\]/);
  assert.doesNotMatch(md, /#6|#2\b/);
});

test('renderizarNotas: sin menciones en la vista previa y fallback @login', () => {
  const prs = [normalizarPR(pr({ numero: 1, titulo: 'feat!: nueva API', autor: 'desconocido', head: 'feat/1-api', sha: 's' }), ['revisor'])];
  const md = renderizarNotas({ prs, equipo: EQUIPO, menciones: false });
  assert.match(md, /\| `@desconocido` \| — \| 1 \| 1 \| 0 \| 0 \| General \|/);
  assert.match(md, /⚠️ \*\*BREAKING\*\* nueva API/);
  assert.match(md, /`@revisor`/);
  assert.doesNotMatch(md, /(^|[^`])@revisor/);
});

test('renderizarNotas: rango vacío', () => {
  assert.match(renderizarNotas({ prs: [], equipo: EQUIPO }), /Sin cambios en este rango\./);
});

test('cargarEquipo: sin equipo.json devuelve un equipo vacío', () => {
  const raiz = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'equipo-'));
  assert.deepEqual(cargarEquipo(raiz), { integrantes: [], areas: {} });
});
