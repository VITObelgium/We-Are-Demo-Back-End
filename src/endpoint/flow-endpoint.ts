/**
 * Defines the endpoints that expose the individual steps of the Postman collection
 * ("We Are Pod Interaction") as explicit, session-saving actions.
 *
 * Each endpoint performs one step, stores a summary of the result on the Express session
 * and returns that summary, so the front-end can print the relevant fields per step:
 * - POST /flow/oidc-configuration   (Postman 01: Fetch and save OIDC configuration)
 * - POST /flow/client-authentication (Postman 05: Perform client authentication)
 * - POST /flow/vc-configuration     (Postman 06: Fetch and save VC configuration)
 * - POST /flow/uma-configuration    (Postman 10: Fetch UMA configuration)
 * - POST /flow/uma-ticket           (Postman 11: Get UMA ticket)
 * - POST /flow/uma-token            (Postman 12: Exchange UMA ticket and Access Grant for Access Token)
 *
 * Secrets (access tokens, the UMA ticket) are kept server-side on the session; only
 * previews are exposed to the front-end.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */
import {Express, Request, Response} from "express";
import log from "loglevel";
import {TokenService} from "@vito-nv/weare-core";
import {getPodUrlAll} from "@inrupt/solid-client";
import {getAuthenticatedWebId, getSessionServices} from "../helper/session-services";

/** The relative resource written to / read from the pod by this demo. */
const DEMO_RESOURCE = "book_index";

/** Returns a short, non-sensitive preview of a secret value. */
function preview(value: string, length: number = 32): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

/**
 * Resolves the URL of the demo resource on the citizen's pod.
 * The Web ID must be resolved on `res.locals.webId` (via `getAuthenticatedWebId`).
 */
async function resolveDemoResource(req: Request, res: Response): Promise<URL | undefined> {
  const webId = res.locals.webId as string | undefined;
  if (!webId) {
    res.status(401).send("No authenticated Web ID available on the session. Authenticate first.");
    return undefined;
  }

  const pods = await getPodUrlAll(webId);
  if (!pods.length) {
    res.status(404).send(`No pod found for Web ID [${webId}].`);
    return undefined;
  }

  return new URL(DEMO_RESOURCE, pods[0]);
}

/**
 * Performs an unauthenticated request on a UMA-protected resource and parses the
 * `WWW-Authenticate` header, which carries the UMA authorization server (`as_uri`)
 * and a fresh permission `ticket`.
 */
async function fetchUmaChallenge(resource: URL): Promise<{ asUri?: string, ticket?: string, header: string | null }> {
  const response = await fetch(resource.href, {method: "HEAD"});
  const header = response.headers.get("www-authenticate");

  return {
    asUri: header?.match(/as_uri="([^"]+)"/)?.[1],
    ticket: header?.match(/ticket="([^"]+)"/)?.[1],
    header
  };
}

export function flowEndpoint(app: Express) {

  /**
   * POST /flow/oidc-configuration
   *
   * Fetches the `.well-known/openid-configuration` of the We Are OIDC provider and
   * saves the relevant endpoints on the session.
   */
  app.post("/flow/oidc-configuration", (req, res, next) => {
    log.debug(`Endpoint POST /flow/oidc-configuration called.`);
    next();
  }, async (req, res, next) => {
    try {
      const {oidcConfig} = getSessionServices(req);
      const configuration = await oidcConfig.discover();

      req.session.oidcConfiguration = {
        fetchedFrom: oidcConfig.discoveryEndpoint.href,
        issuer: configuration.issuer,
        authorizationEndpoint: configuration.authorization_endpoint,
        tokenEndpoint: configuration.token_endpoint,
        jwksUri: configuration.jwks_uri
      };

      res.json(req.session.oidcConfiguration);
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /flow/client-authentication
   *
   * Performs the client credentials grant on the We Are OIDC token endpoint and saves
   * a summary (plus the raw token, server-side only) on the session. The raw token is
   * used later in the UMA token exchange.
   */
  app.post("/flow/client-authentication", (req, res, next) => {
    log.debug(`Endpoint POST /flow/client-authentication called.`);
    next();
  }, async (req, res, next) => {
    try {
      const {oidcConfig} = getSessionServices(req);
      const tokenResponse = await new TokenService(oidcConfig).requestAccessToken();

      if (!tokenResponse?.access_token) {
        res.status(502).send(`Client authentication failed: ${JSON.stringify(tokenResponse)}`);
        return;
      }

      req.session.clientAccessToken = tokenResponse.access_token;
      req.session.clientIdToken = tokenResponse.id_token;
      req.session.clientAuthentication = {
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        scope: tokenResponse.scope,
        accessTokenPreview: preview(tokenResponse.access_token),
        idTokenPreview: tokenResponse.id_token ? preview(tokenResponse.id_token) : undefined,
        obtainedAt: new Date().toISOString()
      };

      res.json(req.session.clientAuthentication);
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /flow/vc-configuration
   *
   * Fetches the `.well-known/vc-configuration` of the VC provider and saves the
   * resolved service endpoints on the session.
   */
  app.post("/flow/vc-configuration", (req, res, next) => {
    log.debug(`Endpoint POST /flow/vc-configuration called.`);
    next();
  }, async (req, res, next) => {
    try {
      const vcConfig = globalThis.weAreVcConfig;
      await vcConfig.discover();

      req.session.vcConfiguration = {
        fetchedFrom: vcConfig.discoveryEndpoint.href,
        issuerService: vcConfig.issueEndpoint?.href,
        derivationService: vcConfig.deriveEndpoint?.href,
        queryService: vcConfig.queryEndpoint?.href
      };

      res.json(req.session.vcConfiguration);
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /flow/uma-configuration
   *
   * Discovers the UMA authorization server protecting the citizen's pod (via the
   * `WWW-Authenticate` challenge on the demo resource) and fetches its
   * `.well-known/uma2-configuration`. The token endpoint is saved on the session.
   */
  app.post("/flow/uma-configuration", (req, res, next) => {
    log.debug(`Endpoint POST /flow/uma-configuration called.`);
    next();
  }, getAuthenticatedWebId, async (req, res, next) => {
    try {
      const resource = await resolveDemoResource(req, res);
      if (!resource) return;

      const challenge = await fetchUmaChallenge(resource);
      if (!challenge.asUri) {
        res.status(502).send(`Could not discover the UMA authorization server from [${resource.href}]. WWW-Authenticate: ${challenge.header}`);
        return;
      }

      const discoveryUrl = `${challenge.asUri.replace(/\/$/, "")}/.well-known/uma2-configuration`;
      const response = await fetch(discoveryUrl, {headers: {"Accept": "application/json"}});
      if (!response.ok) {
        res.status(502).send(`Could not fetch the UMA configuration from [${discoveryUrl}]: ${response.status} ${response.statusText}`);
        return;
      }

      const configuration = await response.json() as { issuer?: string, token_endpoint?: string };

      req.session.umaConfiguration = {
        asUri: challenge.asUri,
        fetchedFrom: discoveryUrl,
        issuer: configuration.issuer,
        tokenEndpoint: configuration.token_endpoint
      };

      res.json(req.session.umaConfiguration);
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /flow/uma-ticket
   *
   * Requests the demo resource without authorization to obtain a UMA permission ticket
   * from the `WWW-Authenticate` challenge. The ticket is kept server-side on the session.
   */
  app.post("/flow/uma-ticket", (req, res, next) => {
    log.debug(`Endpoint POST /flow/uma-ticket called.`);
    next();
  }, getAuthenticatedWebId, async (req, res, next) => {
    try {
      const resource = await resolveDemoResource(req, res);
      if (!resource) return;

      const challenge = await fetchUmaChallenge(resource);
      if (!challenge.ticket) {
        res.status(502).send(`No UMA ticket found on [${resource.href}]. WWW-Authenticate: ${challenge.header}`);
        return;
      }

      req.session.umaTicketValue = challenge.ticket;
      req.session.umaTicket = {
        resource: resource.href,
        ticketPreview: preview(challenge.ticket),
        obtainedAt: new Date().toISOString()
      };

      res.json(req.session.umaTicket);
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /flow/uma-token
   *
   * Exchanges the UMA ticket and the access grant (wrapped in a Verifiable Presentation
   * claim token) for a UMA access token on the UMA token endpoint. Requires the client
   * authentication, UMA configuration, UMA ticket and access grant steps to be completed.
   */
  app.post("/flow/uma-token", (req, res, next) => {
    log.debug(`Endpoint POST /flow/uma-token called.`);
    next();
  }, async (req, res, next) => {
    try {
      const tokenEndpoint = req.session.umaConfiguration?.tokenEndpoint;
      if (!tokenEndpoint) {
        res.status(400).send("No UMA token endpoint known. Fetch the UMA configuration first.");
        return;
      }

      const ticket = req.session.umaTicketValue;
      if (!ticket) {
        res.status(400).send("No UMA ticket on the session. Get a UMA ticket first.");
        return;
      }

      if (!req.session.accessGrant) {
        res.status(400).send("No access grant on the session. Complete the consent and access grant steps first.");
        return;
      }

      if (!req.session.clientIdToken) {
        res.status(400).send("No client ID token on the session. Perform the client authentication step first.");
        return;
      }

      // Wrap the access grant in a Verifiable Presentation, as expected by the UMA server.
      const claimToken = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiablePresentation"],
        "verifiableCredential": [JSON.parse(req.session.accessGrant)]
      };

      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:uma-ticket",
        ticket,
        claim_token: Buffer.from(JSON.stringify(claimToken)).toString("base64"),
        claim_token_format: "https://www.w3.org/TR/vc-data-model/#json-ld"
      });

      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          // The UMA server expects the client's ID token (not the access token) as bearer.
          "Authorization": `Bearer ${req.session.clientIdToken}`
        },
        body: body.toString()
      });

      if (!response.ok) {
        res.status(502).send(`The UMA token exchange failed: ${response.status} ${response.statusText} — ${await response.text()}`);
        return;
      }

      const tokenResponse = await response.json() as { access_token?: string, token_type?: string, expires_in?: number };
      if (!tokenResponse.access_token) {
        res.status(502).send(`The UMA token exchange returned no access token: ${JSON.stringify(tokenResponse)}`);
        return;
      }

      // A UMA ticket is single-use: clear it so the step can be repeated cleanly.
      delete req.session.umaTicketValue;

      req.session.umaAccessToken = {
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        accessTokenPreview: preview(tokenResponse.access_token),
        obtainedAt: new Date().toISOString()
      };

      res.json(req.session.umaAccessToken);
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
}
