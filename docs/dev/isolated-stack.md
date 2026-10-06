# A second, isolated stack

Why: a worktree session can test against its own Postgres, Keycloak, core and web without touching the default
stack (`iap-postgres`, `iap-keycloak`, `iap-core`, `iap-web`, `iap-prototype`) that another session or a phone check uses.

## What differs from the default stack

All names and host ports come from variables in `infra/dev/docker-compose.yml`. The defaults equal the original
values, so a render without variables is unchanged.

| Variable | Default | Controls |
| --- | --- | --- |
| `IAP_STACK` | `iap` | container name prefix (`<IAP_STACK>-core` ...) |
| `IAP_PORT_POSTGRES` / `_KEYCLOAK` / `_CORE` / `_WEB` / `_PROTOTYPE` | 5433 / 8180 / 3000 / 8080 / 8081 | published host ports |
| `IAP_PORT_CADDY` / `IAP_PORT_CADDY_KC` | 443 / 8443 | phone profile only; the Caddyfile still listens on 443/8443 inside |
| `IAP_KC_URL` | `http://localhost:<IAP_PORT_KEYCLOAK>` | Keycloak issuer, core `AUTH_ISSUER`, web `/config.js` authority |

The compose project name (`-p`) separates networks and volumes (`<project>_iap-pg-data`, `<project>_iap-kc-data`),
so the second stack has its own database and Keycloak realm data.

The web image is environment-neutral: it reads the Keycloak authority at runtime from `/config.js` (ADR-010), so the second
stack reuses `iap-web:dev`. `iap-core:dev` and the other images are shared too.

## Start

```
cp infra/dev/stack2.env.example infra/dev/stack2.env      # adjust ports if they clash
docker compose -p iap2 -f infra/dev/docker-compose.yml --env-file infra/dev/stack2.env --profile app --profile origin up -d --no-build
```

- The stack uses the shared `iap-core:dev` and `iap-web:dev` images. Build them first (`node scripts/build-images.mjs`) if they do
  not exist.
- The `origin` profile runs `keycloak-origin` once: `phone-client.mjs --origin http://localhost:<IAP_PORT_WEB>` adds the
  web port to the `iap-web` client (redirect URIs, web origins, post-logout URIs). It is idempotent and exits.
- Never run these commands without `-p`: the default project name is `iap-dev`.
- Urls: web `http://localhost:9080`, core `:13000`, Keycloak `:18180`, Postgres `:15433` (values from the example file).
- Demo data: `CORE_URL=http://localhost:13000 KEYCLOAK_URL=http://localhost:18180 node scripts/demo-seed.mjs`.

## Stop

```
docker compose -p iap2 -f infra/dev/docker-compose.yml --env-file infra/dev/stack2.env --profile app --profile origin down -v
```

`-v` removes only the `iap2_*` volumes. Check with `docker ps` that the five default containers still run.

## Scripts that assume the default ports

`scripts/gate.mjs` (Postgres 5433 via `DATABASE_URL` and `MIGRATION_DATABASE_URL`), `scripts/demo-seed.mjs`
(`CORE_URL`, `KEYCLOAK_URL`) and `scripts/ui-sweep.mjs` (`KEYCLOAK_URL`, `--app`, `--proto`) take overrides from
the environment or flags. `scripts/quality-report.mjs` has the same Postgres defaults as the gate.

## Phone profile

`phone.env` and the Caddyfile hard-code 443/8443 for the issuer, so run the phone profile only on the default stack.
