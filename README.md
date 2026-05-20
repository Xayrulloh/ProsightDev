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

## Setup

```bash
pnpm install
cp .env.example .env       # already points at the public RNAcentral DB
pnpm start                 # http://localhost:3000/api
pnpm start:dev             # watch mode
pnpm test                  # unit
pnpm test:e2e              # e2e
```

Swagger UI: <http://localhost:3000/docs> — basic auth: `admin` / `password`.

## Users (hardcoded, plaintext)

These three users are baked into `src/config/users/users.config.ts`. Plaintext
is intentional for this test task so the reviewer can read them directly.

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
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r .accessToken)

# Basic list
curl -s "http://localhost:3000/api/locus?pageSize=2" \
  -H "authorization: Bearer $TOKEN" | jq

# Sideloaded list
curl -s "http://localhost:3000/api/locus?pageSize=2&sideload=locusMembers" \
  -H "authorization: Bearer $TOKEN" | jq

# normal user trying to sideload -> 403
NTOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"normal","password":"normal123"}' | jq -r .accessToken)
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/locus?sideload=locusMembers" \
  -H "authorization: Bearer $NTOKEN"
```

## Spec ambiguities (and how they were resolved)

- **`id` and `regionId` typed as "enum" in spec** — interpreted as **csv -> int[]**
  filters. Both columns have huge cardinality; a literal enum makes no sense.
- **`assemblyId` typed as int in spec, but examples show `"WEWSeq_v.1.0"`** —
  followed the examples → `string`.
- **`rld` table referenced in spec** — interpreted as **`rlm`**
  (`rnc_locus_members`) — the only reading consistent with the SQL in the spec.
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
  modules/auth/              POST /auth/login
  modules/locus/             GET /locus
  shared/types/              AuthenticatedRequest, JwtPayload
  utils/constants.ts         GLOBAL_PREFIX, UserRole, LIMITED_ROLE_ALLOWED_REGION_IDS
test/
  locus.e2e-spec.ts          login + role flows
  jest-e2e.json
```
