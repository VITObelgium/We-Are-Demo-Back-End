/**
 * This module defines routes for handling access requests and access grants using Verifiable Credentials (VC).
 *
 * The `vcEndpoint` function sets up the following endpoints:
 * 1. `/access-request`: Allows clients to request access credentials based on provided data.
 * 2. `/access-grant`: Retrieves an access grant and stores it in the session for future use.
 * 3. `/access-request/consent`: Redirects the browser to the We Are Access Management
 *    Application (AMA) so the citizen can consent to a pending access request.
 *
 * The function integrates with session management, logging, and error handling.
 * It uses the global `vcService` to interact with the VC backend, and `solidStorage` for session storage.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */

import {Express} from "express";
import log from "loglevel";
import httpContext from "express-http-context";
import {getAuthenticatedWebId, getSessionServices} from "../helper/session-services";
import {getEnvVar} from "../helper/environment-helper";

export default function vcEndpoint(app: Express) {
    app.post('/access-request', (req, res, next) => {
      log.debug(`Calling POST /access-request`);
      next();
    }, getAuthenticatedWebId, async (req, res, next) => {
      try {
        const accessRequest = await getSessionServices(req).vcService.issueAccessRequest(req.body.data, req.body.webId, req.body.purpose, new Date(req.body.expirationDate), req.body.access, httpContext.get('correlationId'))

          // Keep the access request ID on the session so the consent step can be shown separately.
          if (accessRequest?.id) {
            req.session.accessRequestId = accessRequest.id;
          }

          res.status(201).send(accessRequest);
      } catch(error) {
        // A general error catcher which will, in turn, call the ExpressJS error handler.
        next(error);
      }
    });

  app.post('/access-grant', (req, res, next) => {
    log.debug(`Calling GET /access-grant`);
    next();
  }, getAuthenticatedWebId, async (req, res, next) => {
    try {
      const accessGrantId = req.body.accessGrantId as string;
      const accessGrant = await getSessionServices(req).vcService.fetchAccessGrant(accessGrantId, httpContext.get('correlationId'))
      req.session.accessGrant = JSON.stringify(accessGrant);
      req.session.accessGrantExpirationDate = new Date(accessGrant.expirationDate!).toISOString();

      res.status(200).send('Access grant set on session');
    } catch(error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  app.get('/access-grant', (req, res, next) => {
    log.debug(`Calling GET /access-grant`);
    next();
  }, getAuthenticatedWebId, async (req, res, next) => {
    try {
      const accessGrants = await getSessionServices(req).vcService.fetchAccessGrants(httpContext.get('correlationId'), {ownerWebId: res.locals.webId});
      res.status(200).send(JSON.stringify(accessGrants));
    } catch(error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * GET /access-request/consent
   *
   * Redirects the citizen's browser to the We Are Access Management Application (AMA) so they
   * can consent to the pending access request (created via `POST /access-request`, its ID is
   * kept on the session as `accessRequestId`).
   *
   * The AMA is configured per We Are environment (`AMA_URL_<ENV>` / `AMA_CONSENT_PATH_<ENV>`),
   * resolved for the session's currently active environment. After consent, the AMA redirects
   * the browser back to the front-end (optionally carrying the `flow` query parameter along,
   * so the correct tab is shown) with an `access-grant-id` query parameter.
   *
   * @route {GET} /access-request/consent
   * @query {string} [flow] - The active front-end flow ('oidc' or 'hti'), passed back through
   *   the AMA redirect so the front-end can restore the correct tab.
   */
  app.get('/access-request/consent', (req, res, next) => {
    log.debug(`Calling GET /access-request/consent`);
    next();
  }, (req, res, next) => {
    try {
      const accessRequestId = req.session.accessRequestId;
      if (!accessRequestId) {
        res.status(400).send("No access request found on the session. Create one via POST /access-request first.");
        return;
      }

      const environment = getSessionServices(req).environment;
      const amaConsentUrl = new URL(getEnvVar("AMA_URL", environment) + getEnvVar("AMA_CONSENT_PATH", environment));

      const redirectUrl = new URL(globalThis.frontendUrl.href);
      const flow = req.query.flow;
      if (typeof flow === "string") {
        redirectUrl.searchParams.set('flow', flow);
      }

      amaConsentUrl.searchParams.set('requestVcUrl', accessRequestId);
      amaConsentUrl.searchParams.set('redirectUrl', redirectUrl.href);

      res.redirect(amaConsentUrl.href);
    } catch(error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
}
