# Configuration

Every setting is an environment variable read when the Node server starts (`runtimeConfig`),
so the same image works for any server: changing a value only requires restarting the process
or the pod.

## Server connection

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_ZOO_BASEURL` | — | Root URL of the ZOO-Project server **as seen by the browser**. The UI calls `<NUXT_ZOO_BASEURL>/ogc-api/...`. |
| `NUXT_ZOO_INTERNAL_BASEURL` | `NUXT_ZOO_BASEURL` | Address of the ZOO-Project **as seen by the UI server** (used by `/api/openapi` to fetch the document), e.g. `http://zoo-project-dru-service` inside the cluster. Without it, the public URL is tried first, then the origin of `SUBSCRIBERURL`. |
| `NUXT_WS_URL` | derived from the page URL | WebSocket endpoint of `websocketd` (e.g. `ws://localhost:8888`, `wss://ws.example.org`). Used by asynchronous executions for live progress. |
| `SUBSCRIBERURL` | — | URL of the server's `publish.py` used as `subscriber` in execute requests (e.g. `http://zoo-project-dru-service/cgi-bin/publish.py` inside the cluster). |
| `ZOO_OGCAPI_REQUIRES_BEARER_TOKEN` | `true` | `false` when anonymous calls are accepted: pages load without login. `true` when the API is protected: pages wait for the token (up to 4 s) and show a *sign in* notice. |
| `ZOO_IAM_ENABLED` | `false` | `true` when an IAM gateway (APISIX...) protects the per-user API URLs: Swagger then uses the static base URL. |

The Swagger page loads the OpenAPI document through the UI's own server (`/api/openapi`),
which bundles the external schema files referenced by the ZOO-Project document; the UI
container therefore needs outbound HTTPS access to `schemas.opengis.net` and
`raw.githubusercontent.com` (otherwise the raw document is served and Swagger reports the
unresolved references in a banner).

The ZOO-Project must answer with CORS headers (`cors=true` in `main.cfg`, enabled in the Helm
chart) since the browser calls it directly.

## Authentication (OpenID Connect)

| Variable | Description |
|----------|-------------|
| `NUXT_OIDC_ISSUER` | Issuer URL, e.g. `https://auth.example.org/realms/zooproject`. The server side of the UI fetches `<issuer>/.well-known/openid-configuration`; the browser is redirected to the authorization endpoint found there. The issuer must therefore be reachable from both the UI container and the browser under the same URL. |
| `NUXT_OIDC_CLIENT_ID` | Confidential client identifier (default `webapp` in the chart). |
| `NUXT_OIDC_CLIENT_SECRET` | Its secret. |
| `AUTH_ORIGIN` | Public URL of the UI, e.g. `https://webui.example.org` or `http://localhost:3058`. The OIDC redirect URI is `<AUTH_ORIGIN>/api/auth/callback/keycloak`. |
| `NEXTAUTH_URL`, `NUXT_BASE_URL` | Same value as `AUTH_ORIGIN`. |
| `NUXT_AUTH_SECRET` | Random string used to encrypt the session cookie (`openssl rand -base64 32`). |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` to accept self-signed certificates on the issuer (development only). |

When the three `NUXT_OIDC_*` variables are not all set, login is disabled: the header shows no
*Authenticate* button and the UI works anonymously.

### Identity provider requirements

- A **confidential** OpenID Connect client (`client_id` / `client_secret`), standard
  (authorization code) flow enabled.
- Valid redirect URI: `<AUTH_ORIGIN>/api/auth/callback/keycloak`; valid post-logout redirect
  URI: `<AUTH_ORIGIN>/*`; web origin: `<AUTH_ORIGIN>`.
- The access token must carry the audience expected by the ZOO-Project (`iam.audience` in the
  chart, `zoo-project-webapp` by default): in Keycloak add an *Audience* mapper to the client.
- The ZOO-Project validates the token signature against `<issuer>/protocol/openid-connect/certs`
  and the `iss` claim against `iam.issuer`: both sides must point to the same issuer URL.

Token lifetimes are those of the identity provider: the UI refreshes the access token server
side with the refresh token, and treats the session as over when the refresh fails. For a
development realm, lifetimes of 1 h (access token) and 12 h (SSO idle) avoid frequent re-logins.

The ZOO-Project repository ships a ready-to-use local Keycloak (`docker/keycloak/start.sh`)
with a realm, the `webapp` client and a test user, wired by the `keycloak` skaffold profile.

## Helm chart mapping

With the `zoo-project-dru` chart (`webui.enabled=true`):

| Chart value | Environment variable(s) |
|-------------|-------------------------|
| `ingress.hosturl` / default `http://localhost:8080` | `NUXT_ZOO_BASEURL` |
| `webui.url` | `AUTH_ORIGIN`, `NEXTAUTH_URL`, `NUXT_BASE_URL` |
| `webui.wsurl` | `NUXT_WS_URL` |
| `webui.oidc.issuer`, `webui.oidc.clientId`, `webui.oidc.clientSecret` | `NUXT_OIDC_ISSUER`, `NUXT_OIDC_CLIENT_ID`, `NUXT_OIDC_CLIENT_SECRET` |
| `webui.authSecret` | `NUXT_AUTH_SECRET` |
| `webui.requiresBearerToken` (string `"true"`/`"false"`) | `ZOO_OGCAPI_REQUIRES_BEARER_TOKEN` |
| `iam.enabled` | `ZOO_IAM_ENABLED` |
| `webui.nodeTlsRejectUnauthorized` | `NODE_TLS_REJECT_UNAUTHORIZED` |
| `webui.extraEnv` / `webui.envFrom` | any additional variable |

Note that the chart's JSON schema requires `webui.requiresBearerToken` to be a **string**:
pass it through a values file rather than `--set` (which turns `false` into a boolean).

## Build-time settings

| Variable | Description |
|----------|-------------|
| `NUXT_APP_BASE_URL` | Base path when the UI is served under a sub path (e.g. `/webui/`). Read at build time. |
| `HOST`, `PORT` (`NITRO_HOST`, `NITRO_PORT`) | Listening address of the Node server (defaults `0.0.0.0:3000` in the image). |
