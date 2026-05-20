# Locus API

NestJS test task: a single `GET /locus` endpoint over the public RNAcentral
Postgres database, with JWT auth, role-based permissions, filtering, sorting,
pagination, sideloading, and auto-generated Swagger docs.

## Stack

- **NestJS 11** + **TypeScript**
- **TypeORM** — entities + relations, no raw SQL
- **nestjs-zod** v5 — request validation + response serialization + OpenAPI
- **@nestjs/jwt** + **passport-jwt** — Bearer auth
- **Swagger UI** (gated by HTTP basic auth)
- **Biome** for lint + format
- **Jest** for unit + e2e tests
- **Docker** + **docker-compose** for one-command deploy

## Quick start (pnpm)

```bash
pnpm install
cp .env.example .env       # already points at the public RNAcentral DB
pnpm start                 # http://localhost:5555/api
```

## Quick start (Docker)

The DB is the public RNAcentral instance, so docker-compose only needs to run
the API container — no local Postgres required.

```bash
cp .env.example .env
docker compose up --build  # http://localhost:5555/api
```

The image is built via a multi-stage `Dockerfile` (build → prune dev deps → tiny
runtime image, ~150 MB on `node:22-alpine`). The compose file reads the host
`.env`, exposes port 5555, runs as the non-root `node` user, and includes a
healthcheck against `GET /api`.

To stop:

```bash
docker compose down
```

## Available scripts

| Script               | What it does                                            |
|----------------------|---------------------------------------------------------|
| `pnpm start`         | Build + run                                             |
| `pnpm start:dev`     | Watch mode                                              |
| `pnpm start:prod`    | Run pre-built `dist/`                                   |
| `pnpm build`         | Compile to `dist/`                                      |
| `pnpm test`          | Unit tests (Jest, `*.spec.ts`)                          |
| `pnpm test:watch`    | Unit tests in watch mode                                |
| `pnpm test:cov`      | Unit tests + coverage report                            |
| `pnpm test:e2e`      | End-to-end tests against the live DB                    |
| `pnpm format`        | Biome: report formatting issues (no writes)             |
| `pnpm format:write`  | Biome: auto-format files in place                       |
| `pnpm lint`          | Biome: report lint issues (no writes)                   |
| `pnpm lint:write`    | Biome: auto-apply safe lint fixes                       |
| `pnpm check`         | Biome: format + lint + import sort (no writes, CI gate) |
| `pnpm check:write`   | Biome: format + lint + import sort (auto-fix all)       |

Swagger UI: <http://localhost:5555/docs> — basic auth `admin` / `password`.

## Users (hardcoded, plaintext)

These three users live in `src/config/users/users.config.ts`. Plaintext is
intentional for this test task so the reviewer can read them directly.

| Role    | Username | Password    |
|---------|----------|-------------|
| admin   | admin    | admin123    |
| normal  | normal   | normal123   |
| limited | limited  | limited123  |

## Endpoints

```
POST /api/auth/login   body: { username, password }   -> { accessToken, username, role }
GET  /api/locus        header: Authorization: Bearer <accessToken>
```

### `GET /api/locus` — query params

| Param              | Type                                                    | Default | Notes                                              |
|--------------------|---------------------------------------------------------|---------|----------------------------------------------------|
| `id`               | csv of ints, e.g. `?id=1,2,3`                           | —       | filters `rl.id`                                    |
| `assemblyId`       | string, e.g. `?assemblyId=WEWSeq_v.1.0`                 | —       | filters `rl.assembly_id`                           |
| `regionId`         | csv of ints, e.g. `?regionId=86118093,86696489`         | —       | filters `rlm.region_id` (uses EXISTS subquery)     |
| `membershipStatus` | string, e.g. `?membershipStatus=member`                 | —       | filters `rlm.membership_status`                    |
| `sideload`         | `locusMembers`                                          | —       | includes related `rnc_locus_members` array         |
| `page`             | int ≥ 1                                                 | 1       |                                                    |
| `pageSize`         | int 1–1000                                              | 1000    | per spec                                           |
| `sortBy`           | `id` \| `locusName` \| `locusStart`                     | `id`    |                                                    |
| `sortOrder`        | `ASC` \| `DESC`                                         | `ASC`   |                                                    |

### Role rules

| Role    | Behavior                                                                                          |
|---------|---------------------------------------------------------------------------------------------------|
| admin   | full access, all filters and sideloading allowed                                                  |
| normal  | rl-only fields, **`sideload=locusMembers` returns 403**                                           |
| limited | rl-only fields, result restricted to `regionId IN (86118093, 86696489, 88186467)` via EXISTS join |

## curl walkthrough

```bash
BASE=http://localhost:5555/api

# Login (admin)
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r .accessToken)

# Basic list
curl -s "$BASE/locus?pageSize=2" -H "authorization: Bearer $TOKEN" | jq

# Sideloaded list (includes locusMembers array)
curl -s "$BASE/locus?pageSize=2&sideload=locusMembers" \
  -H "authorization: Bearer $TOKEN" | jq

# Filter + sort + paginate
curl -s "$BASE/locus?regionId=86118093,86696489&sortBy=locusStart&sortOrder=DESC&pageSize=5" \
  -H "authorization: Bearer $TOKEN" | jq

# normal user trying to sideload -> 403
NTOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"normal","password":"normal123"}' | jq -r .accessToken)
curl -s -o /dev/null -w "%{http_code}\n" \
  "$BASE/locus?sideload=locusMembers" \
  -H "authorization: Bearer $NTOKEN"
# -> 403

# limited user — every returned locus has at least one allowlisted region member
LTOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"limited","password":"limited123"}' | jq -r .accessToken)
curl -s "$BASE/locus?pageSize=5&sideload=locusMembers" \
  -H "authorization: Bearer $LTOKEN" | jq '.[].locusMembers[]?.regionId' | sort -u
```

## Environment variables

| Var                | Required | Default     | Notes                                          |
|--------------------|----------|-------------|------------------------------------------------|
| `PORT`             | no       | `5555`      | Port the API listens on                        |
| `DATABASE_URL`     | yes      | —           | Postgres connection string                     |
| `JWT_SECRET`       | yes      | —           | ≥16 chars, used to sign access tokens          |
| `JWT_EXPIRES_IN`   | no       | `1h`        | Any `ms`-compatible duration (`30m`, `7d`, …)  |
| `SWAGGER_USER`     | no       | `admin`     | Basic-auth user for `/docs`                    |
| `SWAGGER_PASSWORD` | no       | `password`  | Basic-auth password for `/docs`                |

`.env.example` has working values for the public RNAcentral DB so you can copy
it as-is for local dev.

## Spec ambiguities (and how they were resolved)

- **`id` and `regionId` typed as "enum" in spec** — interpreted as **csv -> int[]**
  filters. Both columns have huge cardinality; a literal enum makes no sense.
- **`assemblyId` typed as int in spec, but examples show `"WEWSeq_v.1.0"`** —
  followed the examples → `string`.
- **`rld` table referenced in spec** — interpreted as **`rlm`**
  (`rnc_locus_members`) — the only reading consistent with the SQL in the spec.
- **`urs_taxid` shown at the locus level in the with-sideload example** but
  physically lives on `rnc_locus_members` in the DB. We promote the first
  member's value to the locus level when sideloading; otherwise omit it.
- **What if `normal` requests sideloading?** — return **403** rather than
  silently ignoring (clearer signal to the API consumer).
- **`limited` user's regionId clamp** — always applied as an additional `IN`
  filter, intersecting with any user-supplied `regionId` filter.
- **Pagination + rlm filters** — implemented via an `EXISTS` subquery on the
  rlm side so the rl `LIMIT`/`OFFSET` page count stays correct. No raw SQL —
  the subquery is built with the same TypeORM `QueryBuilder`.

## Layout

```
src/
  app.module.ts
  main.ts
  config/env/                Zod-validated env + ConfigModule
  config/swagger/            Swagger UI + nestjs-zod cleanupOpenApiDoc
  config/users/              3 hardcoded users
  common/filters/            Zod + HttpException filters
  common/guards/             JwtAuthGuard
  common/strategies/         JwtStrategy (Bearer-only)
  common/decorators/         @CurrentUser()
  database/                  TypeOrmModule + entities (rnc_locus, rnc_locus_members)
                             + bigint <-> number transformer
  modules/auth/              POST /auth/login
  modules/locus/             GET /locus
  shared/types/              AuthenticatedRequest, JwtPayload
  utils/constants.ts         GLOBAL_PREFIX, UserRole, LIMITED_ROLE_ALLOWED_REGION_IDS
test/
  locus.e2e-spec.ts          login + role + validation flows (26 e2e tests)
  jest-e2e.json
Dockerfile                   multi-stage build, runs as non-root
docker-compose.yml           one-command deploy (api only, DB is external)
.dockerignore                keep image small
biome.json                   lint + format config (param-decorators enabled)
```
