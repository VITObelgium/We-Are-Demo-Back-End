/**
 * Defines the endpoints for the HTI (Health Tools Interoperability) flow.
 *
 * The HTI flow is an alternative to the full Solid OIDC login. The citizen is sent to the
 * We Are PIMS HTI launch page where they authenticate. The PIMS then issues an HTI token
 * (a JWT) containing the citizen's Web ID in the `sub` claim. That token can reach this
 * back-end in one of two ways:
 * - Automatically: the PIMS launch page auto-submits a hidden HTML form (POST) with the
 *   token to our `/hti/capture` endpoint (registered as the `redirect_uri`), which is how
 *   the real We Are backend (see `weare-backend`, `src/endpoint/hti-endpoint.ts` /
 *   `renderLaunchPage`) behaves when the launch is started without `debug=true`.
 * - Manually: with `debug=true`, the PIMS shows the token on screen for the citizen to
 *   copy and paste into `/hti/token`, instead of auto-submitting the form.
 *
 * Once resolved, the Web ID is stored on the session. Subsequent access requests and pod
 * interactions are performed using the client credentials.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */
import {Express} from "express";
import log from "loglevel";
import {randomUUID} from "crypto";
import {createRemoteJWKSet, decodeJwt, jwtVerify} from "jose";
import {SessionData, Store} from "express-session";
import {getSessionServices} from "../helper/session-services";

/** Cache of remote JWK sets, keyed by JWKS URI, so keys are not re-fetched on every verification. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Correlates a one-time `state` value (sent to, and echoed back by, the We Are PIMS) to
 * the session that started the HTI launch. This is needed because the launch page's
 * auto-submitted form POST to `/hti/capture` is a genuine cross-site request: browsers do
 * not attach the (default `SameSite=Lax`) session cookie to it, so `req.session` on that
 * request is *not* the citizen's original session. The original session is instead looked
 * up and updated directly through the session store, keyed by this `state` value.
 */
const pendingHtiCaptures = new Map<string, string>();

/** Loads a session by ID directly from the session store, bypassing the request's own cookie. */
function loadSession(store: Store, sessionId: string): Promise<SessionData | null | undefined> {
  return new Promise((resolve, reject) => {
    store.get(sessionId, (error, session) => error ? reject(error) : resolve(session));
  });
}

/** Saves a session by ID directly to the session store, bypassing the request's own cookie. */
function saveSession(store: Store, sessionId: string, session: SessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(sessionId, session, (error) => error ? reject(error) : resolve());
  });
}

/**
 * Resolves the JWKS URI of the given token issuer via OIDC discovery.
 * Falls back to the conventional `/.well-known/jwks.json` location when no
 * discovery document is published.
 */
async function resolveJwksUri(issuer: string): Promise<string> {
  const issuerBase = issuer.replace(/\/$/, "");

  for (const wellKnownPath of ["/.well-known/openid-configuration", "/.well-known/oidc-configuration"]) {
    try {
      const response = await fetch(`${issuerBase}${wellKnownPath}`, {headers: {"Accept": "application/json"}});
      if (response.ok) {
        const configuration = await response.json() as { jwks_uri?: string };
        if (configuration.jwks_uri) {
          return configuration.jwks_uri;
        }
      }
    } catch {
      // Try the next discovery location.
    }
  }

  return `${issuerBase}/.well-known/jwks.json`;
}

/**
 * Builds the URL of our own `/hti/capture` endpoint, used as the `redirect_uri` of the
 * HTI launch. The We Are Demo client is registered with a `http://localhost.*` redirect
 * URI regex, so any path on this back-end's own host/port is an accepted redirect target.
 */
function buildCaptureEndpoint(): URL {
  const captureEndpoint = new URL(`${process.env.PROTOCOL}://${process.env.HOST}:${process.env.PORT}`);
  captureEndpoint.pathname = "/hti/capture";
  return captureEndpoint;
}

/**
 * Extracts and validates the citizen's Web ID from the `sub` claim of an HTI token (JWT).
 * Throws an `Error` with a user-facing message when the token is missing, malformed or
 * has no valid Web ID subject.
 */
function extractWebIdFromHtiToken(token?: string): string {
  const trimmedToken = token?.trim();
  if (!trimmedToken) {
    throw new Error("An HTI token is required in the 'token' field.");
  }

  const parts = trimmedToken.split(".");
  if (parts.length !== 3) {
    throw new Error("The provided HTI token is not a valid JWT.");
  }

  let payload: { sub?: string };
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
  } catch {
    throw new Error("The payload of the provided HTI token could not be parsed.");
  }

  if (!payload.sub) {
    throw new Error("The provided HTI token has no 'sub' claim containing the Web ID.");
  }

  try {
    new URL(payload.sub);
  } catch {
    throw new Error(`The 'sub' claim [${payload.sub}] of the provided HTI token is not a valid Web ID URL.`);
  }

  return payload.sub;
}

/**
 * Saves the resolved Web ID (and the raw token, for later signature verification) on the given session.
 */
function saveHtiToken(session: Pick<SessionData, "htiWebId" | "htiToken" | "htiTokenVerified">, token: string, webId: string): void {
  session.htiWebId = webId;
  session.htiToken = token.trim();
  session.htiTokenVerified = false;
}

export function htiEndpoint(app: Express) {

  /**
   * GET /hti/launch-url
   *
   * Builds the We Are PIMS HTI launch URL for the client configured on this session.
   * The `redirect_uri` points to our own `/hti/capture` endpoint, so the HTI token is
   * captured automatically instead of requiring a manual copy/paste. A one-time `state`
   * value correlates the (cross-site) capture request back to this session, since the
   * PIMS auto-submits its form directly to `/hti/capture` without our session cookie.
   *
   * @route {GET} /hti/launch-url
   * @query {string} [debug] - When `"true"`, the PIMS shows the token on screen for
   *   manual copy/paste (via `/hti/token`) instead of auto-submitting it to `/hti/capture`.
   *   Defaults to `false`.
   * @returns {Object} A JSON object containing the `launchUrl` and the resolved `debug` flag.
   */
  app.get("/hti/launch-url", (req, res, next) => {
    log.debug(`Endpoint GET /hti/launch-url called.`);
    next();
  }, async (req, res, next) => {
    try {
      const {oidcConfig} = getSessionServices(req);
      const clientId = oidcConfig.clientId;
      const debug = req.query["debug"] === "true";

      // The client ID is a dereferenceable URL pointing to the client document. It is
      // fetched here only to give an early, friendly error when the 'hti' scope is not
      // registered on it; the redirect URI itself is our own capture endpoint below.
      const clientDocumentResponse = await fetch(clientId, {headers: {"Accept": "application/ld+json"}});
      if (!clientDocumentResponse.ok) {
        res.status(502).send(`Could not fetch the client document from [${clientId}]: ${clientDocumentResponse.status} ${clientDocumentResponse.statusText}`);
        return;
      }

      const clientDocument = await clientDocumentResponse.json() as { scope?: string };
      if (!(clientDocument.scope ?? "").split(" ").includes("hti")) {
        res.status(400).send(`The client document [${clientId}] does not have the 'hti' scope registered.`);
        return;
      }

      // A fresh, one-time state value lets the (cross-site) /hti/capture request find its
      // way back to this session. Saving it on the session also guarantees the session is
      // persisted (and its cookie sent to the browser) even if nothing else has written to
      // it yet.
      const state = randomUUID();
      req.session.htiLaunchState = state;
      pendingHtiCaptures.set(state, req.sessionID);

      const launchUrl = new URL(process.env.WEARE_PIMS_URL!);
      launchUrl.pathname = "/nl/hti/launch";
      launchUrl.searchParams.set("client_id", clientId);
      launchUrl.searchParams.set("redirect_uri", buildCaptureEndpoint().href);
      launchUrl.searchParams.set("debug", debug ? "true" : "false");
      launchUrl.searchParams.set("state", state);

      res.json({launchUrl: launchUrl.href, debug});
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /hti/capture
   *
   * Receives the HTI token auto-submitted by the We Are PIMS launch page (a regular HTML
   * form POST, `application/x-www-form-urlencoded`, with `token` and `state` fields) when
   * the launch was started without `debug=true`. This is the same contract as the real We
   * Are backend's launch page (see `weare-backend` `renderLaunchPage`:
   * `<form method="post" action="${redirect_uri}"><input name="token"><input name="state">`).
   *
   * Because the request is a genuine cross-site browser navigation, the (`SameSite=Lax`)
   * session cookie of the session that started the launch is *not* sent along with it, so
   * `req.session` here belongs to a different, throwaway session. The `state` field is used
   * to look up and update the *original* session directly through the session store. The
   * citizen is then redirected back to the front-end, with the outcome in the query string.
   *
   * @route {POST} /hti/capture
   * @body {string} token - The HTI token (JWT), as submitted by the PIMS launch page.
   * @body {string} state - The one-time state value returned by `/hti/launch-url`.
   */
  app.post("/hti/capture", (req, res, next) => {
    log.debug(`Endpoint POST /hti/capture called.`);
    next();
  }, async (req, res) => {
    const redirectUrl = new URL(globalThis.frontendUrl.href);
    redirectUrl.searchParams.set("flow", "hti");

    try {
      const state = req.body?.state as string | undefined;
      const sessionId = state ? pendingHtiCaptures.get(state) : undefined;
      if (!sessionId) {
        throw new Error("The HTI launch state is unknown or has expired. Please restart the HTI launch.");
      }
      pendingHtiCaptures.delete(state!);

      const token = req.body?.token as string | undefined;
      const webId = extractWebIdFromHtiToken(token);

      const session = (await loadSession(req.sessionStore, sessionId)) ?? ({} as SessionData);
      saveHtiToken(session, token!, webId);
      delete session.htiLaunchState;
      await saveSession(req.sessionStore, sessionId, session);

      log.debug(`[POST /hti/capture] Captured Web ID [${webId}] from an auto-submitted HTI token.`);

      redirectUrl.searchParams.set("hti-captured", "true");
    } catch (error) {
      log.debug(`[POST /hti/capture] Capturing the HTI token failed: ${(error as Error).message}`);

      redirectUrl.searchParams.set("hti-captured", "false");
      redirectUrl.searchParams.set("hti-error", (error as Error).message);
    }

    res.redirect(302, redirectUrl.href);
  });

  /**
   * POST /hti/token
   *
   * Exchanges an HTI token (a base64-encoded JWT issued by the We Are PIMS) for the
   * citizen's Web ID. The Web ID (`sub` claim) is stored on the session, after which
   * the regular access request / access grant / pod endpoints can be used.
   *
   * @route {POST} /hti/token
   * @body {string} token - The base64-encoded HTI token (JWT).
   * @returns {Object} A JSON object containing the resolved `webId`.
   */
  app.post("/hti/token", (req, res, next) => {
    log.debug(`Endpoint POST /hti/token called.`);
    next();
  }, async (req, res, next) => {
    try {
      const token = req.body?.token as string | undefined;

      let webId: string;
      try {
        webId = extractWebIdFromHtiToken(token);
      } catch (error) {
        res.status(400).send((error as Error).message);
        return;
      }

      saveHtiToken(req.session, token!, webId);

      log.debug(`[POST /hti/token] Saved Web ID [${webId}] from HTI token on the session.`);

      res.json({webId});
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * POST /hti/token/verify
   *
   * Verifies the signature of the HTI token stored on the session against the JWKS of its
   * issuer (`iss` claim). The JWKS is resolved via OIDC discovery on the issuer. Standard
   * time-based claims (`exp`, `nbf`) are validated as well. On success the verification
   * result is stored on the session.
   *
   * @route {POST} /hti/token/verify
   * @returns {Object} A JSON object with `verified`, `issuer`, `subject`, `algorithm`,
   *                   `keyId` and `expiresAt`.
   */
  app.post("/hti/token/verify", (req, res, next) => {
    log.debug(`Endpoint POST /hti/token/verify called.`);
    next();
  }, async (req, res, next) => {
    try {
      const token = req.session.htiToken;
      if (!token) {
        res.status(400).send("No HTI token is present on the session. Exchange an HTI token first.");
        return;
      }

      let issuer: string | undefined;
      try {
        issuer = decodeJwt(token).iss;
      } catch {
        res.status(400).send("The HTI token on the session could not be decoded.");
        return;
      }

      if (!issuer) {
        res.status(400).send("The HTI token has no 'iss' claim, so its signature cannot be verified.");
        return;
      }

      const jwksUri = await resolveJwksUri(issuer);
      let jwks = jwksCache.get(jwksUri);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(jwksUri));
        jwksCache.set(jwksUri, jwks);
      }

      try {
        const {payload, protectedHeader} = await jwtVerify(token, jwks, {issuer});

        req.session.htiTokenVerified = true;

        log.debug(`[POST /hti/token/verify] Verified HTI token for subject [${payload.sub}] against JWKS [${jwksUri}].`);

        res.json({
          verified: true,
          issuer,
          subject: payload.sub,
          algorithm: protectedHeader.alg,
          keyId: protectedHeader.kid,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined
        });
      } catch (error) {
        req.session.htiTokenVerified = false;

        const reason = (error as Error).message;
        log.debug(`[POST /hti/token/verify] Verification of the HTI token failed: ${reason}`);
        res.status(400).json({verified: false, issuer, jwksUri, reason});
      }
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
}
