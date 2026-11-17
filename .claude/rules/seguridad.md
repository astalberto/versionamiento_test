# Seguridad

Aplica a todo el repo.

## Secretos

- Nunca escribas secretos en código, configuración commiteada, logs ni mensajes de commit. Eso incluye `.env*`, keystores, `*.p12`, `*.pem`, cuentas de servicio y tokens.
- Si una configuración necesita valores, commitea un `.env.example` sin valores reales. En CI, los valores salen de secretos y environments de GitHub, nunca impresos en los logs.
- Si detectas un secreto en el diff, detente y avísalo: hay que rotarlo, no basta con borrarlo del commit.

## Pipeline

- Los cambios en `.github/` llevan la etiqueta `area:devsecops` y se revisan con cuidado: la política de PR corre con la versión del PR.
- `permissions` mínimos en cada workflow y acciones de terceros fijadas por SHA (detalle en `ci-cd.md`).
