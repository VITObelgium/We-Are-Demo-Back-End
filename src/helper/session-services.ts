/**
 * Helpers to resolve the We Are services for the current session.
 *
 * When custom client credentials are stored on the Express session (via the
 * `/client-credentials` endpoint), new service instances are created using those
 * credentials. Otherwise the default (global) services are returned.
 *
 * Service instances are cached per credential pair so the OIDC / VC discovery
 * documents are only fetched once per credential pair.
 */
import {NextFunction, Request, Response} from "express";
import {OidcConfig, OidcService, PodService, VcService} from "@vito-nv/weare-core";
import {getSession} from "@vito-nv/weare-expressjs";

export interface SessionServices {
    oidcConfig: OidcConfig;
    oidcService: OidcService;
    vcService: VcService;
    podService: PodService;
}

const serviceCache = new Map<string, SessionServices>();

/**
 * Returns the services configured for the current session.
 * Falls back to the globally configured services when no custom credentials are set.
 *
 * @param {Request} req - The Express request object, containing the session.
 * @returns {SessionServices} The services to use for this request.
 */
export function getSessionServices(req: Request): SessionServices {
    const clientId = req.session?.clientId;
    const clientSecret = req.session?.clientSecret;

    if (!clientId || !clientSecret) {
        return {
            oidcConfig: globalThis.weAreOidcConfig,
            oidcService: globalThis.oidcService,
            vcService: globalThis.vcService,
            podService: globalThis.podService
        };
    }

    const cacheKey = `${clientId}::${clientSecret}`;
    let services = serviceCache.get(cacheKey);
    if (!services) {
        const oidcConfig = new OidcConfig(
            new URL(process.env.WEARE_OIDC_URL!),
            clientId,
            clientSecret,
            {
                clientName: process.env.WEARE_OIDC_CLIENT_NAME!,
                redirectEndpoint: globalThis.weAreOidcConfig.redirectEndpoint
            }
        );

        services = {
            oidcConfig,
            oidcService: new OidcService(oidcConfig),
            vcService: new VcService(oidcConfig, globalThis.weAreVcConfig),
            podService: new PodService(oidcConfig)
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
