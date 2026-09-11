/**
 * Helpers to resolve the We Are services for the current session.
 *
 * The session can select a We Are environment (TST/ACC/PRD) and either a configured client
 * credential index or a fully custom client ID/secret pair (via the `/client-credentials`
 * endpoint). New service instances are built for that environment/client combination.
 * Otherwise the default (global, startup-configured) services are returned.
 *
 * Service instances are cached per environment/credential pair so the OIDC / VC discovery
 * documents are only fetched once per combination.
 */
import {NextFunction, Request, Response} from "express";
import {WebIdConfig, WebIdService, OidcConfig, OidcService, PodService, VcConfig, VcService} from "@vito-nv/weare-core";
import {getSession} from "@vito-nv/weare-expressjs";
import {WeAreEnvironment, getClientCredentials, getDefaultClientIndex, getEnvVar} from "./environment-helper";

export interface SessionServices {
    environment: WeAreEnvironment;
    clientIndex?: number;
    clientId: string;
    displayName: string;
    usingCustomCredentials: boolean;
    oidcConfig: OidcConfig;
    oidcService: OidcService;
    vcService: VcService;
    podService: PodService;
    webIdService: WebIdService;
    pimsUrl: URL;
}

const serviceCache = new Map<string, SessionServices>();

/**
 * Returns the services configured for the current session.
 * Falls back to the globally configured default environment/client when the session has no
 * active selection.
 *
 * @param {Request} req - The Express request object, containing the session.
 * @returns {SessionServices} The services to use for this request.
 */
export function getSessionServices(req: Request): SessionServices {
    const environment: WeAreEnvironment = req.session?.weAreEnvironment ?? globalThis.weAreDefaultEnvironment;
    const customCredentials = req.session?.customCredentials?.[environment];
    const isCustomCredentials = !!req.session?.usingCustomCredentials && !!customCredentials;

    let clientId: string;
    let clientSecret: string;
    let displayName: string;
    let clientIndex: number | undefined;

    if (isCustomCredentials) {
        clientId = customCredentials!.clientId;
        clientSecret = customCredentials!.clientSecret;
        displayName = customCredentials!.displayName ?? "Custom credentials";
        clientIndex = undefined;
    } else {
        const index: number = req.session?.clientIndex ?? getDefaultClientIndex(environment);
        clientIndex = index;
        const credentials = getClientCredentials(environment, index);
        clientId = credentials.clientId;
        clientSecret = credentials.clientSecret;
        displayName = credentials.displayName;
    }

    // No session overrides at all: reuse the globally configured default services as-is.
    if (!isCustomCredentials && environment === globalThis.weAreDefaultEnvironment
        && clientId === globalThis.weAreOidcConfig.clientId) {
        return {
            environment,
            clientIndex,
            clientId,
            displayName,
            usingCustomCredentials: isCustomCredentials,
            oidcConfig: globalThis.weAreOidcConfig,
            oidcService: globalThis.oidcService,
            vcService: globalThis.vcService,
            podService: globalThis.podService,
            webIdService: globalThis.webIdService,
            pimsUrl: new URL(getEnvVar("WEARE_PIMS_URL", environment))
        };
    }

    const cacheKey = `${environment}::${clientId}::${clientSecret}`;
    let services = serviceCache.get(cacheKey);
    if (!services) {
        const oidcConfig = new OidcConfig(
            new URL(getEnvVar("WEARE_OIDC_URL", environment)),
            clientId,
            clientSecret,
            {
                clientName: process.env.WEARE_OIDC_CLIENT_NAME!,
                redirectEndpoint: globalThis.weAreOidcConfig.redirectEndpoint
            }
        );
        const vcConfig = new VcConfig(new URL(getEnvVar("WEARE_VC_SERVICE", environment)));
        const webIdService = new WebIdService(new WebIdConfig(new URL(getEnvVar("WEARE_WEB_ID_PROVISION_SERVICE", environment)), process.env.WEARE_WEB_ID_PROVISION_SERVICE_PATH!));

        services = {
            environment,
            clientIndex,
            clientId,
            displayName,
            usingCustomCredentials: isCustomCredentials,
            oidcConfig,
            oidcService: new OidcService(oidcConfig),
            vcService: new VcService(oidcConfig, vcConfig),
            podService: new PodService(oidcConfig),
            webIdService,
            pimsUrl: new URL(getEnvVar("WEARE_PIMS_URL", environment))
        };
        serviceCache.set(cacheKey, services);
    }

    return services;
}

/**
 * Middleware that resolves an authenticated Web ID context for the request.
 * Accepts either:
 * - An HTI-based context: the Web ID saved on the session via the HTI token exchange, or
 * - A Solid OIDC session: resolved via the standard `getSession` middleware.
 *
 * The resolved Web ID is exposed on `res.locals.webId`.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} next - The next middleware function.
 */
export async function getAuthenticatedWebId(req: Request, res: Response, next: NextFunction) {
    if (req.session?.htiWebId) {
        res.locals.webId = req.session.htiWebId;
        next();
        return;
    }

    await getSession.call({storage: globalThis.solidStorage}, req, res, (error?: any) => {
        if (error) {
            next(error);
            return;
        }

        res.locals.webId = res.locals.session?.info?.webId;
        next();
    });
}
