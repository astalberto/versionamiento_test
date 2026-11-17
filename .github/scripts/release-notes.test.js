'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recolectarPRs, normalizarPR, renderizarNotas } = require('./release-notes.js');
const { crearGithub, pr, commit } = require('./fakes.js');

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
  };
}

test('recolectarPRs: PRs del rango por ancestría, sin promociones ni sincronizaciones', async () => {
  const github = crearGithub(escenario());
  const prs = await recolectarPRs({ github, owner: 'org', repo: 'repo', base: 'v1.0.0', head: 'head' });
  assert.deepEqual(
    prs.map((p) => p.numero),
    [3, 4, 5]
  );
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

test('renderizarNotas: listas por sección, una línea por PR y pie con fecha y enlace', async () => {
  const github = crearGithub(escenario());
  const prs = await recolectarPRs({ github, owner: 'org', repo: 'repo', base: 'v1.0.0', head: 'head' });
  const md = renderizarNotas({ prs, titulo: 'v1.1.0', subtitulo: '16/10/2026', compareUrl: 'https://x/compare' });

  assert.equal(
    md,
    [
      '## v1.1.0',
      '',
      '### Agregado o cambiado',
      '- Login con OAuth ([#3](https://github.com/org/repo/pull/3))',
      '',
      '### Corregido',
      '- Timeout | proxy ([#4](https://github.com/org/repo/pull/4))',
      '',
      '### Mantenimiento',
      '- Bump actions/checkout ([#5](https://github.com/org/repo/pull/5))',
      '',
      '<sub>16/10/2026 · [Ver cambios](https://x/compare)</sub>',
      '',
    ].join('\n')
  );
  assert.doesNotMatch(md, /#6|#2\b/); // sin sincronizaciones ni PRs fuera del rango
});

test('renderizarNotas: un título con ! se marca como incompatible', () => {
  const prs = [normalizarPR(pr({ numero: 1, titulo: 'feat!: nueva API', autor: 'x', head: 'feat/1-api', sha: 's' }))];
  const md = renderizarNotas({ prs });
  assert.match(md, /^- \*\*Incompatible:\*\* Nueva API \(\[#1\]/m);
  assert.doesNotMatch(md, /<sub>/); // sin fecha ni enlace, no hay pie
});

test('renderizarNotas: rango vacío', () => {
  assert.match(renderizarNotas({ prs: [] }), /^Sin cambios\.$/m);
});
