/**
 * Extends the Express session data interface with demo-specific properties:
 * - Custom client credentials set at runtime via the `/client-credentials` endpoint.
 * - The citizen's Web ID obtained via the HTI (Health Tools Interoperability) flow.
 * - Summaries of the individual flow steps (`/flow/*` endpoints), printed by the front-end.
 */
import {WeAreEnvironment} from "../helper/environment-helper";

/** Summary of the fetched OpenID provider configuration (Postman step 01). */
export interface OidcConfigurationStep {
    fetchedFrom: string;
    issuer?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksUri?: string;
}

/** Summary of the client credentials authentication (Postman step 05). */
export interface ClientAuthenticationStep {
    tokenType?: string;
    expiresIn?: number;
    scope?: string;
    accessTokenPreview: string;
    idTokenPreview?: string;
    obtainedAt: string;
}

/** Summary of the fetched VC provider configuration (Postman step 06). */
export interface VcConfigurationStep {
    fetchedFrom: string;
    issuerService?: string;
    derivationService?: string;
    queryService?: string;
}

/** Summary of the discovered UMA authorization server (Postman step 10). */
export interface UmaConfigurationStep {
    asUri: string;
    fetchedFrom: string;
    issuer?: string;
    tokenEndpoint?: string;
}

/** Summary of the obtained UMA permission ticket (Postman step 11). */
export interface UmaTicketStep {
    resource: string;
    ticketPreview: string;
    obtainedAt: string;
}

/** Summary of the UMA access token obtained via the ticket exchange (Postman step 12). */
export interface UmaAccessTokenStep {
    tokenType?: string;
    expiresIn?: number;
    accessTokenPreview: string;
    obtainedAt: string;
}

/** Tokens saved on the session via the `saveTokens` login workaround. */
export interface SessionTokens {
    idToken: string;
    accessToken: string;
}

/** A custom (volatile, session-only) client credential pair, not persisted in the back-end's `.env` file. */
export interface CustomClientCredentials {
    clientId: string;
    clientSecret: string;
    displayName?: string;
}

declare module "express-session" {
    interface SessionData {
        /** The We Are platform environment (DEV/TST/ACC/PRD) selected for this session, see `/client-credentials`. */
        weAreEnvironment?: WeAreEnvironment;
        /** The configured client credential index selected for this session, see `/client-credentials`. */
        clientIndex?: number;
        /**
         * Custom (volatile) client credentials entered for this session, keyed by environment.
         * Kept around per environment so switching environments/back doesn't lose them, but they
         * are never persisted beyond the session (unlike the `.env`-configured client options).
         */
        customCredentials?: Partial<Record<WeAreEnvironment, CustomClientCredentials>>;
        /** Whether the custom credentials for the active environment are currently selected (vs. `clientIndex`). */
        usingCustomCredentials?: boolean;
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
        /** Tokens saved on the session via the `saveTokens` login workaround. */
        tokens?: SessionTokens;
    }
}

export function extendSessionData() {
    // Dummy function, importing this function will extend the ExpressJS session data interface.
}
