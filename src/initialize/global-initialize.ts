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
 * These globals only represent the *default* We Are environment and client (as configured via
 * `WEARE_ENVIRONMENT` and the lowest-indexed `WEARE_OIDC_CLIENT_ID_<index>_<env>`). Sessions can
 * select a different environment/client at runtime (see `src/helper/session-services.ts` and the
 * `/client-credentials` endpoint).
 *
 * If any critical environment variables are missing or contain invalid URLs, an error is thrown.
 *
 * Example usage:
 * ```
 * initializeGlobal();
 * ```
 */

import {WebIdConfig, OidcConfig, PodService, VcService, OidcService, WebIdService, VcConfig} from "@vito-nv/weare-core";
import {IStorage} from "@inrupt/solid-client-authn-node";
import {InMemoryStorage} from "@inrupt/solid-client-authn-core";
import {WeAreEnvironment, getDefaultEnvironment, getEnvVar, getDefaultClientIndex, getClientCredentials} from "../helper/environment-helper";

declare global {
  var weAreDefaultEnvironment: WeAreEnvironment
  var weAreOidcConfig: OidcConfig
  var weAreVcConfig: VcConfig
  var podService: PodService
  var vcService: VcService
  var oidcService: OidcService
  var webIdService: WebIdService
  var frontendUrl: URL
  var frontendLoginUrl: URL
  var backendUrl: URL
  var solidStorage: IStorage
  var sessionCookieName: string
}

export function initializeGlobal() {
  globalThis.weAreDefaultEnvironment = getDefaultEnvironment();
  const environment = globalThis.weAreDefaultEnvironment;

  globalThis.weAreVcConfig = new VcConfig(new URL(getEnvVar("WEARE_VC_SERVICE", environment)));

  try {
    globalThis.frontendUrl = new URL(process.env.FRONTEND_URL!);
    globalThis.frontendLoginUrl = new URL(`${process.env.FRONTEND_URL!}${process.env.FRONTEND_LOGIN_PATH}`);
    globalThis.backendUrl = new URL(process.env.BACKEND_URL!);
  } catch (error) {
    throw new Error('Not a valid URL found forming back-end and front-end URLs');
  }

  const oidcRedirectUrl = globalThis.backendUrl
  oidcRedirectUrl.pathname = '/oidc-redirect'

  const defaultClientIndex = getDefaultClientIndex(environment);
  const defaultCredentials = getClientCredentials(environment, defaultClientIndex);

  globalThis.weAreOidcConfig = new OidcConfig(
    new URL(getEnvVar("WEARE_OIDC_URL", environment)),
    defaultCredentials.clientId,
    defaultCredentials.clientSecret,
    {
      clientName: process.env.WEARE_OIDC_CLIENT_NAME!,
      redirectEndpoint: oidcRedirectUrl
    }
  );

  globalThis.podService = new PodService(globalThis.weAreOidcConfig);
  globalThis.vcService = new VcService(globalThis.weAreOidcConfig, globalThis.weAreVcConfig);
  globalThis.oidcService = new OidcService(globalThis.weAreOidcConfig);
  globalThis.webIdService = new WebIdService(new WebIdConfig(new URL(getEnvVar("WEARE_WEB_ID_PROVISION_SERVICE", environment)), process.env.WEARE_WEB_ID_PROVISION_SERVICE_PATH!));

  globalThis.solidStorage = new InMemoryStorage();
  globalThis.sessionCookieName = "weare-demo-session";
}
