'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { publicar, resumenStaging } = require('./release.js');
const { crearGithub, crearCore, pr, commit } = require('./fakes.js');

const AHORA = new Date('2026-10-16T18:00:00-05:00'); // viernes de la Semana 2

function contexto(sha, ref = 'refs/heads/main') {
  return { repo: { owner: 'org', repo: 'repo' }, sha, ref, serverUrl: 'https://github.com' };
}

async function correr(fn, estado, ctx) {
  const github = crearGithub(estado);
  const { core, estado: salida } = crearCore();
  await fn({ github, context: ctx, core, ahora: AHORA });
  return { github, salida };
}

function semana() {
  return {
    tags: [{ name: 'v1.0.0', sha: 'base' }],
    compare: { 'v1.0.0...m1': [commit('c1'), commit('c2'), commit('m1', { padres: 2 })] },
    prs: [
      pr({ numero: 3, titulo: 'feat(web): login', autor: 'alopez', head: 'feat/42-login', sha: 'c1', labels: ['area:web'] }),
      pr({ numero: 4, titulo: 'fix(api): timeout', autor: 'lgarcia', head: 'fix/50-timeout', sha: 'c2' }),
      pr({ numero: 7, titulo: 'chore(release): v1.1.0 · Semana 2', autor: 'mperez', head: 'staging', base: 'main', sha: 'm1' }),
    ],
  };
}

test('promoción fusionada: publica v1.1.0 · Semana 2 con las notas', async () => {
  const { github, salida } = await correr(publicar, semana(), contexto('m1'));
  const [release] = github.escrituras('createRelease');
  assert.equal(release.tag_name, 'v1.1.0');
  assert.equal(release.name, 'v1.1.0 · Semana 2');
  assert.equal(release.target_commitish, 'm1');
  assert.equal(release.make_latest, 'true');
  assert.match(release.body, /Promoción \[#7\]/);
  assert.match(release.body, /👥 Aporte por integrante/);
  assert.match(release.body, /\[#3\]/);
  assert.doesNotMatch(release.body, /\[#7\]\(https:\/\/github\.com\/org\/repo\/pull\/7\) \|/); // la promoción no es un aporte
  assert.deepEqual(salida.outputs, { publicado: 'true', version: '1.1.0', tag: 'v1.1.0' });
  assert.doesNotMatch(salida.summary, /Falta sincronizar/);
});

test('etiqueta version:mayor en la promoción: publica major', async () => {
  const estado = semana();
  estado.prs[2].labels = [{ name: 'version:mayor' }];
  const { github } = await correr(publicar, estado, contexto('m1'));
  assert.equal(github.escrituras('createRelease')[0].tag_name, 'v2.0.0');
});

test('hotfix fusionado: publica patch y pide sincronizar staging', async () => {
  const estado = {
    tags: [
      { name: 'v1.0.0', sha: 'base' },
      { name: 'v1.1.0', sha: 'm1' },
    ],
    compare: { 'v1.1.0...h1': [commit('f1'), commit('h1', { padres: 2 })] },
    prs: [pr({ numero: 8, titulo: 'fix(web): crash al cargar', autor: 'alopez', head: 'hotfix/57-crash-carga', base: 'main', sha: 'h1' })],
  };
  const { github, salida } = await correr(publicar, estado, contexto('h1'));
  const [release] = github.escrituras('createRelease');
  assert.equal(release.tag_name, 'v1.1.1');
  assert.match(release.body, /Hotfix \[#8\]/);
  assert.match(release.body, /\[#8\]/);
  assert.match(salida.summary, /Falta sincronizar staging/);
  assert.match(salida.summary, /compare\/staging\.\.\.main\?expand=1&title=chore\(sync\)/);
});

test('re-ejecución: no duplica la versión ya publicada en el commit', async () => {
  const estado = semana();
  estado.tags.push({ name: 'v1.1.0', sha: 'm1' });
  const { github, salida } = await correr(publicar, estado, contexto('m1'));
  assert.deepEqual(github.escrituras('createRelease'), []);
  assert.deepEqual(salida.outputs, { publicado: 'false', version: '1.1.0', tag: 'v1.1.0' });
});

test('push a main sin PR de promoción ni hotfix: no publica', async () => {
  const { github, salida } = await correr(publicar, semana(), contexto('directo'));
  assert.deepEqual(github.escrituras('createRelease'), []);
  assert.equal(salida.outputs.publicado, 'false');
  assert.match(salida.summary, /sin versión nueva/);
});

test('sin tag base v1.0.0: falla con instrucción clara', async () => {
  const estado = semana();
  estado.tags = [];
  await assert.rejects(correr(publicar, estado, contexto('m1')), /setup-repo\.sh/);
});

test('staging: resume lo acumulado y la próxima versión sin publicar nada', async () => {
  const estado = { tags: [{ name: 'v1.0.0', sha: 'base' }], compare: { 'v1.0.0...s9': [commit('c1')] }, prs: semana().prs };
  const { github, salida } = await correr(resumenStaging, estado, contexto('s9', 'refs/heads/staging'));
  assert.deepEqual(github.escrituras('createRelease'), []);
  assert.match(salida.summary, /Aporte acumulado · Semana 2 · próxima v1\.1\.0/);
  assert.match(salida.summary, /12\/10\/2026 – 18\/10\/2026 · desde v1\.0\.0/);
});
