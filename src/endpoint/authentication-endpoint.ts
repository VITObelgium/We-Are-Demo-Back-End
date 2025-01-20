
/**
 * Defines the authentication-related endpoints: `/login`, `/logout`, and `/oidc-redirect`.
 *
 * This module provides routes for handling Solid OIDC authentication, including:
 * - `/login`: Initiates the login process with Solid OIDC.
 * - `/logout`: Logs the user out of their session.
 * - `/oidc-redirect`: Handles the OIDC redirect after authentication, including a workaround for missing WebID claims.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */
import {Session} from "@inrupt/solid-client-authn-node";
import { Express } from "express";
import log from "loglevel";
import { getSession, getSessionOptional } from "@weare/weare-expressjs";

export function authenticationEndpoint(app: Express) {

   /**
   * GET /login
   *
   * Initiates the Solid OIDC login flow. A session is created, and the user is redirected to the Solid OIDC provider's login page.
   * The login URL is modified to include additional OAuth scopes (e.g., `rrn`) and identity switching when needed.
   *
   * @route {GET} /login
   *
   * @query {string} redirectUrl - (Optional) A URL to redirect the user to after successful login.
   * @query {boolean} switchIdentity - (Optional) If `true`, includes a login hint to switch the user's identity during authentication.
   *
   * @throws {Error} If an error occurs during the login process, it will be passed to the Express error handler.
   */
  app.get("/login", (req, res, next) => {
    log.debug(`Endpoint GET /login called.`);
    next();
  }, async (req, res, next) => {
    try {
      const session = new Session( {storage: globalThis.solidStorage!, keepAlive: false});
      req.session.solidSid = session.info.sessionId;

      if (req.query.redirectUrl) req.session.redirectUrl = (new URL(req.query.redirectUrl as string)).href;

      await globalThis.oidcService.login(session, (url: string) => {
        // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
        const loginUrl = new URL(url);
        let scope = loginUrl.searchParams.get('scope');
        if (scope)
          scope += " rrn";
        else
          scope = "rrn";
        loginUrl.searchParams.set('scope', scope);

        if(req.query.switchIdentity) {
          // Static string to switch identity, see https://vlaamseoverheid.atlassian.net/wiki/spaces/IKPubliek/pages/6336381158/Wisselen+van+account+doelgroepen
          loginUrl.searchParams.set('login_hint', 'eyJzd2l0Y2hfaWQiOiB0cnVlfQ==');
        }

        res.redirect(loginUrl.href);
      });
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * GET /logout
   *
   * Logs the user out of their Solid session and clears session-related data. After logging out, the user is redirected to a success page.
   *
   * @route {GET} /logout
   *
   * @returns {string} A URL redirecting to the logout success page or an error page in case of failure.
   *
   * @throws {Error} If an error occurs during the logout process, it will be passed to the Express error handler.
   */
  app.get("/logout", (req, res, next) => {
      log.debug(`Endpoint GET /logout called.`);
      next();
    }, getSession.bind({storage: globalThis.solidStorage}), async (req, res, next) => {
      try {
        log.debug(`[GET /logout] Log out for Web ID [${res.locals.session.info.webId}]`);
        await res.locals.session.logout();

        delete req.session.accessGrant;
        delete req.session.accessGrantExpirationDate;
        delete req.session.pods;
        delete req.session.locale;
        delete req.session.workaroundActive;

        const successUrl = new URL(globalThis.frontendUrl);
        successUrl.searchParams.set("logout", "success");
        res.redirect(successUrl.href);
      } catch (error: any) {
        const errorUrl = new URL(globalThis.frontendUrl);
        errorUrl.searchParams.set("logout", "error");
        res.redirect(errorUrl.href);
      }
    }
  );

   /**
   * GET /oidc-redirect
   *
   * Handles the OIDC redirect after the user has authenticated with the Solid OIDC provider.
   * Includes a workaround to provision a WebID if the token lacks a 'webid' claim, meaning the pod and webId don't exist yet.
   *
   * @route {GET} /oidc-redirect
   *
   * @query {string} code - The authorization code from the OIDC provider.
   * @query {string} state - The OIDC state parameter for session management.
   *
   * @returns {string} A redirect to the frontend on successful login or a retry mechanism in case of missing claims.
   *
   * @throws {Error} If an error occurs during the redirect handling, it will be passed to the Express error handler.
   */
  app.get("/oidc-redirect", getSessionOptional.bind({storage: globalThis.solidStorage}), (req, res, next) => {
      log.debug(`Endpoint GET /oidc-redirect called.`);
      next();
    }, async (req, res, next) => {
      try {
        const fullUrl = `${process.env['PROTOCOL']}://${req.get("host")}${req.originalUrl}`;

        log.debug(`Full URL [${fullUrl}].`);

        if(!req.session.workaroundActive) {
          try {
            log.debug(`Handling incoming redirect for URL [${fullUrl}], checking if web id is present.`);
            await res.locals.session!.handleIncomingRedirect(fullUrl);

            if (!res.locals.session || !res.locals.session.info.isLoggedIn) {
              const errorUrl = globalThis.frontendUrl;
              errorUrl.searchParams.set("login", "failed");
              res.redirect(errorUrl.href);
              return;
            }

            if(req.session.redirectUrl) {
              const successUrl = new URL(req.session.redirectUrl);
              successUrl.searchParams.set('login', 'success');
              res.redirect(successUrl.href);
              delete req.session.redirectUrl;
            } else {
              const successUrl = new URL(globalThis.frontendUrl)
              successUrl.searchParams.set('login', 'success');
              res.redirect(successUrl.href);
            }
            return;
          } catch (error: any) {
            if (error.message.startsWith("The token has no 'webid' claim")) {
              req.session.workaroundActive = "create_web_id";
              await globalThis.oidcService.login(res.locals.session!, (url: string) => {
                // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
                const loginUrl = new URL(url);
                let scope = loginUrl.searchParams.get('scope');
                if (scope)
                  scope += " rrn";
                else
                  scope = "rrn";
                loginUrl.searchParams.set('scope', scope);

                res.redirect(loginUrl.href);
              });
              return; // Login redirects the user away from the application.
            }

            throw error;
          }
        } else if (req.session.workaroundActive === "create_web_id") {
          const solidSession = JSON.parse((await globalThis.solidStorage.get(`solidClientAuthenticationUser:${req.session.solidSid}`))!);
          const codeVerifier = solidSession.codeVerifier
          const data = await globalThis.oidcService.getToken(req.query.code as string, codeVerifier, req.query.state as string)
          const idToken = data.id_token;
          await globalThis.athumiService.provisionWebId(idToken);
          delete req.session.workaroundActive;
          await globalThis.oidcService.login(res.locals.session!, (url: string) => {
            // In this case also switch identity to refresh the session to include the provided web id.
            // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
            const loginUrl =  new URL(url);
            let scope = loginUrl.searchParams.get('scope');
            if(scope)
              scope += " rrn";
            else
              scope = "rrn";
            loginUrl.searchParams.set('scope', scope);

            // Static string to switch identity, see https://vlaamseoverheid.atlassian.net/wiki/spaces/IKPubliek/pages/6336381158/Wisselen+van+account+doelgroepen
            loginUrl.searchParams.set('login_hint', 'eyJzd2l0Y2hfaWQiOiB0cnVlfQ==');

            res.redirect(loginUrl.href);
          });
        } else if(req.session.workaroundActive == 'delete_pod') {

        }
      } catch (error) {
        // A general error catcher which will, in turn, call the ExpressJS error handler.
        next(error);
      }
    }
  );
}
