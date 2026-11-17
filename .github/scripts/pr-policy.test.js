'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPR, MARCADOR } = require('./pr-policy.js');
const { crearGithub, crearCore, pr, commit } = require('./fakes.js');

const AHORA = new Date('2026-10-16T12:00:00-05:00'); // viernes de la Semana 2

function contexto(pullRequest) {
  return { repo: { owner: 'org', repo: 'repo' }, payload: { pull_request: pullRequest } };
}

function prAbierto({ numero = 10, titulo, head, base = 'staging', body = '', labels = [] }) {
  return { ...pr({ numero, titulo, autor: 'alopez', head, base, sha: null, body, labels }), merged_at: null };
}

async function correr(estado, pullRequest) {
  const github = crearGithub(estado);
  const { core, estado: salida } = crearCore();
  await validarPR({ github, context: contexto(pullRequest), core, ahora: AHORA });
  const comentarios = github.escrituras('createComment').concat(github.escrituras('updateComment'));
  return { github, salida, comentario: comentarios.length ? comentarios[0].body : '' };
}

test('trabajo válido: agrega Closes #N y comenta sin errores', async () => {
  const estado = { issues: { 42: { title: 'Login con OAuth', state: 'open' } } };
  const { github, salida, comentario } = await correr(estado, prAbierto({ titulo: 'feat(web): login con OAuth', head: 'feat/42-login-oauth', body: 'Detalle' }));
  assert.equal(salida.fallo, null);
  assert.deepEqual(github.escrituras('pulls.update'), [{ owner: 'org', repo: 'repo', pull_number: 10, body: 'Detalle\n\nCloses #42\n' }]);
  assert.ok(comentario.startsWith(MARCADOR));
  assert.match(comentario, /✅ todo en orden/);
  assert.match(comentario, /Issue #42 abierto/);
  assert.deepEqual(github.escrituras('addLabels'), []);
});

test('trabajo: no duplica la referencia si el cuerpo ya la tiene', async () => {
  const estado = { issues: { 42: { title: 'x', state: 'open' } } };
  const { github } = await correr(estado, prAbierto({ titulo: 'feat: x', head: 'feat/42-x', body: 'Refs #10\nCloses #42' }));
  assert.deepEqual(github.escrituras('pulls.update'), []);
});

test('rama inválida: falla y explica cómo corregir', async () => {
  const { salida, comentario } = await correr({}, prAbierto({ titulo: 'feat: x', head: 'ana-pruebas' }));
  assert.match(salida.fallo, /1 problema/);
  assert.match(comentario, /❌ La rama `ana-pruebas` no cumple la convención/);
});

test('issue inexistente, cerrado o que es un PR', async () => {
  const casos = [
    [{}, /no existe en este repo/],
    [{ issues: { 42: { title: 'x', state: 'closed' } } }, /está cerrado/],
    [{ issues: { 42: { title: 'x', state: 'open', pull_request: {} } } }, /es un PR, no un issue/],
  ];
  for (const [estado, esperado] of casos) {
    const { salida, comentario } = await correr(estado, prAbierto({ titulo: 'feat: x', head: 'feat/42-x', body: 'Closes #42' }));
    assert.ok(salida.fallo, String(esperado));
    assert.match(comentario, esperado);
  }
});

test('hotfix que arrastra commits de staging: falla', async () => {
  const estado = {
    issues: { 57: { title: 'Crash', state: 'open' } },
    compare: { 'main...head-10': [commit('s1'), commit('h1')], 'main...staging': [commit('s1')] },
  };
  const { salida, comentario, github } = await correr(estado, prAbierto({ titulo: 'fix: crash', head: 'hotfix/57-crash', base: 'main' }));
  assert.ok(salida.fallo);
  assert.match(comentario, /trae 1 commit\(s\) de staging/);
  assert.equal(github.escrituras('pulls.update')[0].body, 'Refs #57\n');
  assert.deepEqual(github.escrituras('addLabels')[0].labels, ['hotfix']);
});

test('promoción: fija título con versión y semana, y comenta la vista previa', async () => {
  const estado = {
    tags: [{ name: 'v1.0.0', sha: 'base' }],
    compare: { 'staging...main': [], 'v1.0.0...head-10': [commit('c1')] },
    prs: [pr({ numero: 3, titulo: 'feat(web): login', autor: 'alopez', head: 'feat/42-login', sha: 'c1', labels: ['area:web'] })],
  };
  const { github, salida, comentario } = await correr(estado, prAbierto({ titulo: 'Promoción', head: 'staging', base: 'main' }));
  assert.equal(salida.fallo, null);
  assert.equal(github.escrituras('pulls.update')[0].title, 'chore(release): v1.1.0 · Semana 2');
  assert.deepEqual(github.escrituras('addLabels')[0].labels, ['promocion']);
  assert.match(comentario, /Al fusionar se publica \*\*v1\.1\.0\*\* \(minor semanal\) con 1 PR\(s\)/);
  assert.match(comentario, /<details><summary>📋 Vista previa de las notas de v1\.1\.0<\/summary>/);
  assert.match(comentario, /`@alopez`/); // sin notificar en la vista previa
});

test('promoción con version:mayor, hotfix sin sincronizar y sin cambios', async () => {
  const estado = {
    tags: [{ name: 'v1.4.0', sha: 'm4' }],
    compare: { 'staging...main': [commit('m4', { padres: 2 }), commit('h1')], 'v1.4.0...head-10': [] },
    releases: [{ name: 'v1.4.0 · Semana 2', tag_name: 'v1.4.0', draft: false, prerelease: false }],
  };
  const { github, salida, comentario } = await correr(
    estado,
    prAbierto({ titulo: 'x', head: 'staging', base: 'main', labels: ['version:mayor', 'promocion'] })
  );
  assert.equal(github.escrituras('pulls.update')[0].title, 'chore(release): v2.0.0 · Semana 2');
  assert.match(comentario, /main tiene 1 commit\(s\) de hotfix/);
  assert.match(comentario, /⚠️ Ya se publicó v1\.4\.0 en la Semana 2/);
  assert.match(comentario, /no hay nada que promover/);
  assert.match(salida.fallo, /2 problemas/);
  assert.deepEqual(github.escrituras('addLabels'), []); // ya tenía la etiqueta
});

test('dependabot con token de solo lectura: valida igual y solo avisa', async () => {
  const github = crearGithub({});
  const sinPermiso = async () => {
    throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
  };
  github.rest.issues.addLabels = sinPermiso;
  github.rest.issues.createComment = sinPermiso;
  const { core, estado } = crearCore();
  const pull = prAbierto({ titulo: 'ci(deps): bump the acciones group', head: 'dependabot/github_actions/acciones-1a2b' });
  await validarPR({ github, context: contexto(pull), core, ahora: AHORA });
  assert.equal(estado.fallo, null);
  assert.equal(estado.advertencias.length, 2);
  assert.match(estado.summary, /actualización de dependencias/);
});

test('sincronización: fija el título y actualiza el comentario existente', async () => {
  const estado = { comentarios: [{ id: 99, user: { type: 'Bot' }, body: `${MARCADOR}\nviejo` }] };
  const { github, salida } = await correr(estado, prAbierto({ titulo: 'Merge main', head: 'main' }));
  assert.equal(salida.fallo, null);
  assert.equal(github.escrituras('pulls.update')[0].title, 'chore(sync): main → staging');
  assert.equal(github.escrituras('updateComment')[0].comment_id, 99);
  assert.deepEqual(github.escrituras('createComment'), []);
});
