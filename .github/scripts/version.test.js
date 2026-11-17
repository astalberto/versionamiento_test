'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('./version.js');

test('parseVersion: solo tags estables vX.Y.Z', () => {
  assert.deepEqual(v.parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3 });
  for (const t of ['1.2.3', 'v1.2', 'v1.2.3-rc.1', 'v01.2.3', 'release-1.0.0']) assert.equal(v.parseVersion(t), null, t);
});

test('ultimaEstable: orden semver e ignora prerelease', () => {
  const r = v.ultimaEstable(['v1.0.0', 'v1.9.0', 'v1.10.0', 'v1.11.0-rc.2', 'otro']);
  assert.equal(r.tag, 'v1.10.0');
  assert.equal(v.ultimaEstable(['v1.0.0-rc.1', 'x']), null);
});

test('siguiente: minor por semana, patch por hotfix, major manual', () => {
  const base = { major: 1, minor: 4, patch: 2 };
  assert.equal(v.formatear(v.siguiente(base, 'minor')), '1.5.0');
  assert.equal(v.formatear(v.siguiente(base, 'patch')), '1.4.3');
  assert.equal(v.formatear(v.siguiente(base, 'major')), '2.0.0');
  assert.throws(() => v.siguiente(base, 'otro'));
});

test('numeroSemana: semana 1 = lunes 05/10/2026 en hora de Ecuador', () => {
  const ini = '2026-10-05';
  const tz = 'America/Guayaquil';
  assert.equal(v.numeroSemana(new Date('2026-10-05T12:00:00-05:00'), ini, tz), 1);
  assert.equal(v.numeroSemana(new Date('2026-10-11T23:59:00-05:00'), ini, tz), 1);
  assert.equal(v.numeroSemana(new Date('2026-10-12T00:00:00-05:00'), ini, tz), 2);
  assert.equal(v.numeroSemana(new Date('2026-10-13T10:00:00-05:00'), ini, tz), 2);
  // Domingo 23:00 en Ecuador = lunes 04:00 UTC: sigue siendo la semana anterior.
  assert.equal(v.numeroSemana(new Date('2026-10-19T04:00:00Z'), ini, tz), 2);
  assert.equal(v.numeroSemana(new Date('2026-10-19T05:00:00Z'), ini, tz), 3);
});

test('rangoSemana y formatoFecha', () => {
  assert.deepEqual(v.rangoSemana(2, '2026-10-05'), { lunes: '2026-10-12', domingo: '2026-10-18' });
  assert.deepEqual(v.rangoSemana(13, '2026-10-05'), { lunes: '2026-12-28', domingo: '2027-01-03' });
  assert.equal(v.formatoFecha('2026-10-05'), '05/10/2026');
});

test('configSemana: valores acordados por defecto y validación', () => {
  assert.deepEqual(v.configSemana({}), { inicio: '2026-10-05', tz: 'America/Guayaquil' });
  assert.deepEqual(v.configSemana({ PROJECT_START_DATE: '2026-11-02', TZ_EQUIPO: 'UTC' }), { inicio: '2026-11-02', tz: 'UTC' });
  assert.throws(() => v.configSemana({ PROJECT_START_DATE: '05/10/2026' }));
});
