# Development

## Prerequisites

- Node.js 20 or 22 (the Docker image uses Node 22), npm.
- An OGC API - Processes server to talk to. The easiest is the ZOO-Project skaffold stack
  (`skaffold dev -p hostpath,webui` in the ZOO-Project repository) which exposes the API on
  `http://localhost:8080` and `websocketd` on `ws://localhost:8888`.

## Setup

```bash
npm install
cp env_sample .env
```

A minimal `.env` for a local anonymous server:

```dotenv
NUXT_ZOO_BASEURL=http://localhost:8080
NUXT_WS_URL=ws://localhost:8888
SUBSCRIBERURL=http://zoo-project-dru-service/cgi-bin/publish.py
ZOO_OGCAPI_REQUIRES_BEARER_TOKEN=false
AUTH_ORIGIN=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NUXT_BASE_URL=http://localhost:3000
NUXT_AUTH_SECRET=dev-secret
```

Add the `NUXT_OIDC_*` variables to test the login (the redirect URI
`http://localhost:3000/api/auth/callback/keycloak` must be allowed by the client).

```bash
npm run dev            # http://localhost:3000 (use --port to change it)
npm run test           # vitest
npm run build          # .output/
node .output/server/index.mjs
```

## Project layout

```
pages/                 routes (index, processes/, jobs/, swagger, conformance, ogc-api, logout)
components/
  common/              CopyButton, JsonBlock, GeoPreview (OpenLayers), ConformanceBadges
  jobs/                JobStatusChip, JobResultsPanel, JobLinksList
  layout/              headers/footers of the two layouts, SettingsMenu
  help/                in-app help texts (HTML strings) shown by the Help buttons
  SwaggerUI.vue        Swagger UI wrapper
composables/
  useOgcApiServer.ts   base URL resolution, auth headers, readiness, apiFetch()
  useJobsApi.ts        /jobs endpoints
  utils/jobs.ts        pure helpers: statuses, durations, links, query params (unit tested)
  utils/ogcError.ts    normalisation of OGC API exceptions (unit tested)
  utils/auth.ts        token usability / session expiry checks (unit tested)
  utils/cwl.ts         CWL summary/validation (unit tested)
  utils/metadataParser.ts  schema.org metadata extraction (unit tested)
server/api/
  auth/[...].ts        @sidebase/nuxt-auth handler (OIDC provider, token refresh)
  token.get.ts         exposes the OIDC tokens of the session to the browser
  openapi.get.ts       bundles the server's OpenAPI document (external $ref) for Swagger UI
stores/auth.ts         Pinia store: isAuthenticated, user, token
plugins/auth.js        hydrates the store from the session and /api/token
i18n/locales/          en.json, fr.json (flat keys = English source strings)
tests/                 vitest unit tests
```

## How requests reach the server

1. `useOgcApiServer()` resolves the API base: `servers[0].url` of `<NUXT_ZOO_BASEURL>/ogc-api/api`
   when available (this is the per-user URL once authenticated), otherwise
   `<NUXT_ZOO_BASEURL>/ogc-api`.
2. `getRequestHeaders()` adds `Accept-Language` and, when the auth store holds a token,
   `Authorization: Bearer ...`.
3. `waitUntilReady()` waits for the token when `ZOO_OGCAPI_REQUIRES_BEARER_TOKEN=true`; pages
   call it before their first request so that anonymous and protected deployments share the
   same code.
4. `apiFetch(path, options)` wraps `$fetch` and converts failures into `OgcApiError`
   objects (`status`, `title`, `detail`, `message`) that pages display with `errorSummary()`.
   A `401` received while a bearer was sent marks the session as expired (`authStore.markExpired()`),
   and the request is retried once without the token when anonymous calls are allowed.
5. The Swagger page does not load the document directly: `/api/openapi?url=...` (see
   `server/api/openapi.get.ts`) fetches it from the kernel (`NUXT_ZOO_INTERNAL_BASEURL`, then
   the public URL, then the origin of `SUBSCRIBERURL`) and bundles its external `$ref` with
   json-schema-ref-parser.

## Authentication flow

`server/api/auth/[...].ts` configures the `keycloak` OAuth provider from the environment. The
browser is sent to the issuer's authorization endpoint, comes back on
`/api/auth/callback/keycloak`, and the session (JWT cookie) stores the access, refresh and ID
tokens. `plugins/auth.js` fetches them through `/api/token` and fills the Pinia store; the
access token is refreshed server side when it expires. When the refresh fails (SSO session
over) the handler drops the tokens and flags the session with `error`; the plugin then calls
`markExpired()` so the header shows *Session expired* with the sign-in button. When the OIDC
variables are missing the handler registers no provider and the UI stays anonymous.

## Adding a page

- Create the `.vue` file under `pages/`, use `useOgcApiServer()`/`useJobsApi()` for requests
  and `await waitUntilReady()` before the first call.
- Use `t('English text')` for every label and add the French translation to
  `i18n/locales/fr.json` (and the key to `en.json`).
- Prefer the shared components (`JsonBlock`, `CopyButton`, `JobStatusChip`...) over ad-hoc
  markup; keep pure logic in `composables/utils/` with a unit test.

## Docker image

`Dockerfile.nuxt` is a two-stage build (dependencies + `nuxt build`, then Node 22 slim with
`.output/` only, running as the `node` user on port 3000). The GitHub workflow
`docker-multiarch.yml` publishes `zooproject/nuxt-client:<tag>` for `linux/amd64` and
`linux/arm64` on each release.
