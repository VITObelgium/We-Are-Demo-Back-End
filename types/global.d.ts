/**
 * Extends the Express session data interface with:
 * - Solid session/authentication properties (`solidSid`, `pods`, `accessGrant`, `workaroundActive`, ...)
 *   normally shipped by `@vito-nv/weare-expressjs`'s own `types/global.d.ts`. That file is not
 *   currently wired into this package's build (its declarations aren't referenced from the
 *   published `dist/index.d.ts`, nor covered by this project's `tsconfig.json`), so its
 *   `SessionData` properties are re-declared here to remain visible on `req.session`.
 * - Demo-specific properties:
 *   - Custom client credentials set at runtime via the `/client-credentials` endpoint.
 *   - The citizen's Web ID obtained via the HTI (Health Tools Interoperability) flow.
 *   - Summaries of the individual flow steps (`/flow/*` endpoints), printed by the front-end.
 *
 * This file is included directly via `tsconfig.json` (see the `include` option), so its
 * declarations are ambient and available project-wide without needing to be imported.
 *
 * The `export {}` below makes this file a module rather than a global script. Without it,
 * `declare module "express-session"` would be parsed as a brand-new ambient module declaration
 * instead of a module augmentation, so it would not merge with the real `SessionData` interface
 * shipped by `@types/express-session`, leaving these custom properties invisible everywhere
 * `req.session` is used.
 */
export {};

/** Summary of the fetched OpenID provider configuration (Postman step 01). */
interface OidcConfigurationStep {
    fetchedFrom: string;
    issuer?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksUri?: string;
}

/** Summary of the client credentials authentication (Postman step 05). */
interface ClientAuthenticationStep {
    tokenType?: string;
    expiresIn?: number;
    scope?: string;
    accessTokenPreview: string;
    idTokenPreview?: string;
    obtainedAt: string;
}

/** Summary of the fetched VC provider configuration (Postman step 06). */
interface VcConfigurationStep {
    fetchedFrom: string;
    issuerService?: string;
    derivationService?: string;
    queryService?: string;
}

/** Summary of the discovered UMA authorization server (Postman step 10). */
interface UmaConfigurationStep {
    asUri: string;
    fetchedFrom: string;
    issuer?: string;
    tokenEndpoint?: string;
}

/** Summary of the obtained UMA permission ticket (Postman step 11). */
interface UmaTicketStep {
    resource: string;
    ticketPreview: string;
    obtainedAt: string;
}

/** Summary of the UMA access token obtained via the ticket exchange (Postman step 12). */
interface UmaAccessTokenStep {
    tokenType?: string;
    expiresIn?: number;
    accessTokenPreview: string;
    obtainedAt: string;
}

declare module "express-session" {
    interface SessionData {
        /** The Solid session ID correlating this Express session to an in-memory `solidStorage` entry. */
        solidSid?: string;
        locale?: string;
        pods?: string[];
        redirectUrl?: string; // Used to redirect the user after returning from IdP and some other cases.
        accessGrant?: string;
        accessGrantExpirationDate?: string;
        workaroundActive?: 'create_web_id' | 'delete_pod' | 'save_tokens';
        clientId?: string;
        clientSecret?: string;
        htiWebId?: string;
        htiToken?: string;
        htiTokenVerified?: boolean;
        /** One-time state value correlating a pending HTI launch to this session (see `/hti/capture`). */
        htiLaunchState?: string;
        oidcConfiguration?: OidcConfigurationStep;
        clientAuthentication?: ClientAuthenticationStep;
        clientAccessToken?: string;
        clientIdToken?: string;
        vcConfiguration?: VcConfigurationStep;
        accessRequestId?: string;
        umaConfiguration?: UmaConfigurationStep;
        umaTicket?: UmaTicketStep;
        umaTicketValue?: string;
        umaAccessToken?: UmaAccessTokenStep;
    }
}
