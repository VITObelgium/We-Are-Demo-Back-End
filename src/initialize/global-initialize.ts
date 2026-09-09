/**
 * Initializes global configurations and services required for OIDC (OpenID Connect),
 * VC (Verifiable Credentials), and Pod services.
 *
 * This function sets various global variables (`globalThis`) that will be used throughout the application.
 * These variables are configured using environment variables, which must be defined in the runtime environment.
 *
 * The configuration includes:
 * - OIDC for authentication.
 * - VC for creating access requests and access grants.
 * - Pod services for reading and writing data.
 * - URLs for frontend and backend communication.
 * - Solid storage for in-memory session handling.
 *
 * If any critical environment variables are missing or contain invalid URLs, an error is thrown.
 *
 * Example usage:
 * ```
 * initializeGlobal();
 * ```
 */

import {AthumiConfig, OidcConfig, PodService, VcService, OidcService, AthumiService, VcConfig} from "@vito-nv/weare-core";
import {IStorage} from "@inrupt/solid-client-authn-node";
import {InMemoryStorage} from "@inrupt/solid-client-authn-core";

declare global {
  var weAreOidcConfig: OidcConfig
  var weAreVcConfig: VcConfig
  var podService: PodService
  var vcService: VcService
  var oidcService: OidcService
  var athumiService: AthumiService
  var frontendUrl: URL
  var frontendLoginUrl: URL
  var backendUrl: URL
  var solidStorage: IStorage
  var sessionCookieName: string
}

export function initializeGlobal() {
  globalThis.weAreVcConfig = new VcConfig(new URL(process.env.WEARE_VC_SERVICE!));

  try {
    globalThis.frontendUrl = new URL(process.env.FRONTEND_URL!);
    globalThis.frontendLoginUrl = new URL(`${process.env.FRONTEND_URL!}${process.env.FRONTEND_LOGIN_PATH}`);
    globalThis.backendUrl = new URL(`${process.env.PROTOCOL}://${process.env.HOST}:${process.env.PORT}`);
  } catch (error) {
    throw new Error('Not a valid URL found forming back-end and front-end URLs');
  }

  const oidcRedirectUrl = globalThis.backendUrl
  oidcRedirectUrl.pathname = '/oidc-redirect'
  globalThis.weAreOidcConfig = new OidcConfig(
    new URL(process.env.WEARE_OIDC_URL!),
    process.env.WEARE_OIDC_CLIENT_ID!,
    process.env.WEARE_OIDC_CLIENT_SECRET!,
    {
      clientName: process.env.WEARE_OIDC_CLIENT_NAME!,
      redirectEndpoint: oidcRedirectUrl
    }
  );

  globalThis.podService = new PodService(globalThis.weAreOidcConfig);
  globalThis.vcService = new VcService(globalThis.weAreOidcConfig, globalThis.weAreVcConfig);
  globalThis.oidcService = new OidcService(globalThis.weAreOidcConfig);
  globalThis.athumiService = new AthumiService(new AthumiConfig(new URL(process.env.ATHUMI_POD_PLATFORM_URL!), process.env.ATHUMI_POD_PLATFORM_WEB_ID_PATH!));

  globalThis.solidStorage = new InMemoryStorage();
  globalThis.sessionCookieName = "weare-demo-session";
}
