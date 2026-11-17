<!--
Título del PR = Conventional Commit con el mismo tipo de la rama:
  rama feat/42-login-oauth  →  título "feat(web): login con OAuth"
El bot valida rama y título; si la rama lleva issue, lo valida y agrega "Closes #N" si falta.
-->

## Issue (opcional)

<!-- Si hay issue, "Closes #<número>". Si la rama lleva el número y lo olvidas, el bot lo agrega. -->

## ¿Qué cambia?

<!-- 1 a 3 líneas: qué hace este PR y por qué. -->

## ¿Cómo se probó?

- [ ] CI en verde (`ci-ok`)
- [ ] Probado localmente (comandos de `.claude/CLAUDE.md` § Verificación)
- [ ] Capturas o video si cambia la interfaz

## Checklist

- [ ] Sin secretos en el diff (`.env`, llaves, keystores, tokens)
- [ ] Documentación al día si cambia el comportamiento
