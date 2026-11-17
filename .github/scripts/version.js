'use strict';

// Versionado del proyecto (CONTRIBUTING.md § Versionado):
//   promoción semanal staging → main          → minor (1.0.0 → 1.1.0)
//   hotfix/* → main                           → patch (1.1.0 → 1.1.1)
//   etiqueta version:mayor en la promoción    → major (1.4.0 → 2.0.0)
// Solo cuentan los tags estables vX.Y.Z. Los prerelease (vX.Y.Z-rc.N, que
// cortaría un futuro deploy de staging) no mueven la versión base.

const SEMVER_ESTABLE = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const INCREMENTOS = ['major', 'minor', 'patch'];
const MS_DIA = 24 * 60 * 60 * 1000;

function parseVersion(tag) {
  const m = SEMVER_ESTABLE.exec(String(tag || '').trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

function comparar(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function formatear(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

// Mayor versión estable entre los tags (orden semver, no alfabético:
// v1.10.0 > v1.9.0). Devuelve { tag, version } o null si no hay ninguna.
function ultimaEstable(tags) {
  let mejor = null;
  for (const tag of tags) {
    const version = parseVersion(tag);
    if (version && (!mejor || comparar(version, mejor.version) > 0)) mejor = { tag: String(tag).trim(), version };
  }
  return mejor;
}

function siguiente(v, incremento) {
  switch (incremento) {
    case 'major':
      return { major: v.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: v.major, minor: v.minor + 1, patch: 0 };
    case 'patch':
      return { major: v.major, minor: v.minor, patch: v.patch + 1 };
    default:
      throw new Error(`Incremento desconocido: ${incremento} (usa ${INCREMENTOS.join(', ')})`);
  }
}

// ─── Semanas del proyecto ─────────────────────────────────────────────────
// Semana 1 empieza en PROJECT_START_DATE (lunes 05/10/2026) y cada semana va
// de lunes a domingo. La fecha se evalúa en la zona del equipo: un merge el
// domingo a las 23:00 en Ecuador son las 04:00 UTC del lunes, y debe contar
// en la semana anterior.

function validarIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) throw new Error(`Fecha inválida (usa AAAA-MM-DD): ${iso}`);
  return String(iso);
}

function fechaLocal(fecha, tz) {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

function aUtc(iso) {
  const [a, m, d] = validarIso(iso).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

function sumarDias(iso, dias) {
  return new Date(aUtc(iso) + dias * MS_DIA).toISOString().slice(0, 10);
}

function numeroSemana(fecha, inicio, tz) {
  const dias = Math.round((aUtc(fechaLocal(fecha, tz)) - aUtc(inicio)) / MS_DIA);
  return Math.floor(dias / 7) + 1;
}

function rangoSemana(n, inicio) {
  const lunes = sumarDias(inicio, (n - 1) * 7);
  return { lunes, domingo: sumarDias(lunes, 6) };
}

function formatoFecha(iso) {
  const [a, m, d] = validarIso(iso).split('-');
  return `${d}/${m}/${a}`;
}

// Configuración desde el entorno del workflow (variables del repo, ver
// scripts/setup-repo.sh). Los valores por defecto son los acordados.
function configSemana(env = process.env) {
  return {
    inicio: validarIso(env.PROJECT_START_DATE || '2026-10-05'),
    tz: env.TZ_EQUIPO || 'America/Guayaquil',
  };
}

module.exports = {
  INCREMENTOS,
  parseVersion,
  comparar,
  formatear,
  ultimaEstable,
  siguiente,
  numeroSemana,
  rangoSemana,
  formatoFecha,
  configSemana,
};
