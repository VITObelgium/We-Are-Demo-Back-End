# Introduction

## We Are Project and We Are Platform

The We Are partnership, consisting of the Flemish Institute for Technological Research (VITO) – Flemish Patients' Platform (VPP) – Domus Medica (DM) – Zorgnet Icuro (ZI), is committed to enabling the ethical and safe reuse of personal health data for both public and private purposes, with the citizen at the center. The project collaborates closely with Athumi, the provider of the [SOLID](https://solidproject.org/TR/) data vault system in Flanders. This system allows citizens to securely store their data in vaults and share it with third parties based on consent. This project was made possible thanks to the European recovery fund; the Department of Economy, Science & Innovation; the Department of Care & the Department of Digital Flanders. More information at [www.we-are-health.be](https://www.we-are-health.be).

## What

This is the We Are Demo Back-End, an ExpressJS application that showcases an example implementation on the We Are platform. It demonstrates how a user agent interacts with Solid vaults (pods) using SOLID — Social Linked Data — technology, building on the [Inrupt SDK](https://docs.inrupt.com/developer-tools/javascript/client-libraries/) through the We Are libraries `@vito-nv/weare-core` and `@vito-nv/weare-expressjs`.

# Setup

Run `npm install` to install all dependencies for the project.

Before running this application, copy the `.env.example` file to a new `.env` file. DotEnv is used to provide the environment variables for the application. The most important variables are:

- `WEARE_ENVIRONMENT` — the We Are platform environment active by default (`DEV`, `TST`, `ACC` or `PRD`).
- `WEARE_OIDC_CLIENT_ID_1_<ENV>` / `WEARE_OIDC_CLIENT_SECRET_1_<ENV>` — client credentials per environment. Multiple pairs can be configured by incrementing the index. Acquire your credentials from your VITO NV - We Are contact person; before retrieving these credentials you will need to enroll with We Are.
- `BACKEND_URL` / `FRONTEND_URL` — the public URLs of this back end and the front end, used for redirects and CORS.

See the comments in `.env.example` for the full list of variables.

After saving the credentials to the `.env` file, run the application with:

```
npm run start
```

No build is required.

# API overview

The endpoints fall into two groups: endpoints that demonstrate the **Inrupt SDK / SOLID capabilities** (acting on vaults, issuing verifiable credentials, the OIDC flow and the HTI flow), and a small set of **application-specific endpoints** that support the demo front end.

## Inrupt SDK (SOLID) endpoints

### OIDC flow

These endpoints implement the Solid OIDC authentication flow. They are called from the front end, or via redirects as part of the OIDC protocol.

| Endpoint | Method | Description |
| --- | --- | --- |
| `/login` | GET | Starts the Solid OIDC flow. Creates a new Inrupt `Session` and redirects the citizen to the We Are OpenID provider. |
| `/oidc-redirect` | GET | OIDC callback endpoint. Exchanges the authorization code for tokens via `session.handleIncomingRedirect()` and redirects back to the front end. |
| `/logout` | GET | Logs the Solid session out, removes the access grant and session data, and redirects back to the front end. |

Notes on the implementation:

- The session storage is defined globally (`globalThis.solidStorage`, an Inrupt `InMemoryStorage` initialized in `global-initialize.ts`), so sessions are kept in memory and not persisted. Persistent storage or cookie-based storage (for a stateless back end) can be used instead.
- A workaround adds the extra `rrn` scope to the authorization request during login.
- `/login` supports a `switchIdentity` query parameter, which sets a `login_hint` to force an account/target-group switch at the identity provider.
- `/oidc-redirect` contains a workaround for citizens that do not have a Web ID and vault yet: a Web ID is provisioned via the Athumi pod platform (`provisionWebId`) and the login is retried.

### HTI flow

The HTI (Health Tools Interoperability) flow is an alternative to the full Solid OIDC login. The citizen authenticates on the We Are PIMS HTI launch page, which issues an HTI token (a JWT) containing the citizen's Web ID in the `sub` claim. Once the Web ID is resolved, the access request, access grant and vault endpoints below can be used with client credentials.

| Endpoint | Method | Description |
| --- | --- | --- |
| `/hti/launch-url` | GET | Builds the We Are PIMS HTI launch URL. With `?debug=true` the PIMS shows the token for manual copy/paste instead of auto-submitting it. |
| `/hti/capture` | POST | Registered as the `redirect_uri` of the launch: receives the HTI token auto-submitted by the PIMS launch page and stores the Web ID on the session. |
| `/hti/token` | POST | Manually exchanges a copy/pasted HTI token for the citizen's Web ID and stores it on the session. |
| `/hti/token/verify` | POST | Verifies the signature of the HTI token on the session against the JWKS of its issuer (resolved via OIDC discovery). |

### Verifiable credentials (access requests and access grants)

Access to a citizen's vault is consent-based and modelled with [verifiable credentials](https://www.w3.org/TR/vc-data-model/), using the [Inrupt access grants library](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-access-grants/).

| Endpoint | Method | Description |
| --- | --- | --- |
| `/access-request` | POST | Issues an [AccessRequest](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-access-grants/modules/gConsent.html#accessrequest) (`issueAccessRequest`) for the given resources, purpose and access modes. The front end uses the result to send the citizen to the We Are consent (Access Management) application. |
| `/access-request/consent` | GET | Redirects the citizen's browser to the We Are Access Management Application (AMA) to consent to the pending access request. |
| `/access-grant` | POST | Fetches the [AccessGrant](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-access-grants/modules/gConsent.html#accessgrant) (`fetchAccessGrant`) resulting from the citizen's consent and stores it on the session; it authorizes subsequent vault access. |
| `/access-grant` | GET | Lists the access grants issued for the authenticated citizen's Web ID (`fetchAccessGrants`). |

### Acting on vaults

These endpoints read and write resources in a citizen's Solid vault. They require an authenticated Web ID (OIDC or HTI) and a valid access grant, both validated by middleware from `@vito-nv/weare-expressjs`.

| Endpoint | Method | Description |
| --- | --- | --- |
| `/read` | GET | Reads the RDF resource at the `resourceUrl` query parameter from the vault and returns it as Turtle. |
| `/write` | POST | Writes the RDF (Turtle) resource in the request body to the vault at the `resourceUrl` query parameter. |
| `/read-file` | GET | Reads a (non-RDF) file at the `fileUrl` query parameter from the vault. |
| `/write-file` | POST | Writes a (non-RDF) file in the request body to the vault at the `fileUrl` query parameter. |

## Application-specific endpoints

These endpoints exist to support the demo front end and are only summarized here; see the source files in `src/endpoint/` for details.

- **Session endpoints** (`session-endpoint.ts`): `GET /session-information` returns the state of the current session (login status, Web ID, vaults, access grant, executed flow steps); `POST /session/reset` resets the flow-related session state.
- **Credentials endpoints** (`credentials-endpoint.ts`): `GET /client-credentials/options`, `PUT /client-credentials` and `DELETE /client-credentials` list and switch the active We Are environment (DEV/TST/ACC/PRD) and client credential pair for the session.
- **Flow endpoints** (`flow-endpoint.ts`): `POST /flow/*` endpoints expose the individual protocol steps (OIDC/VC/UMA configuration discovery, client authentication, UMA ticket and token exchange) as explicit, session-saving actions so the front end can visualize them step by step.
