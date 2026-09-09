/**
 * Defines the `/session-information` route to provide details about the user's session.
 *
 * The `sessionEndpoint` function sets up a single endpoint to return information about the current
 * session, including whether the user is logged in, the session expiration date, WebID, pods, and
 * any access grants associated with the session.
 *
 * @param {Express} app - The Express application instance on which the route is mounted.
 */

import { Express } from "express";
import log from "loglevel";
import {getPodsOptional, getSessionOptional} from "@vito-nv/weare-expressjs";
import { AccessGrant } from "@inrupt/solid-client-access-grants";
import { getPodUrlAll } from "@inrupt/solid-client";

export function sessionEndpoint(app: Express) {

  /**
   * GET /session-information
   *
   * This endpoint returns details about the user's current session, including:
   * - Whether the user is logged in.
   * - The expiration date of the session.
   * - The user's WebID (if logged in).
   * - The user's associated pods (if any).
   * - Any access grants associated with the session.
   *
   * The session data is retrieved using `getSessionOptional` and `getPodsOptional` middleware, allowing
   * the retrieval of session and pod data without requiring that the user is logged in.
   *
   * @route {GET} /session-information
   * 
   * @returns {Object} A JSON object containing session information:
   *   - isLoggedIn: {boolean} Whether the user is logged in.
   *   - expirationDate: {string} The expiration date of the session (if logged in).
   *   - accessGrantId: {string} The ID of the access grant associated with the session (if available).
   *   - accessGrantExpirationDate: {string} The expiration date of the access grant (if available).
   *   - webId: {string} The user's WebID (if available).
   *   - pods: {string[]} An array of pod URLs associated with the user (if available).
   *
   * @throws {Error} Any error that occurs during the retrieval of session data is passed to the Express error handler.
   */
  app.get("/session-information", (req, res, next) => {
      log.debug(`Endpoint GET /session-information called.`);
      next();
    }, getSessionOptional.bind({storage: globalThis.solidStorage}), getPodsOptional, async (req, res, next) => {
      try {
        const sessionInformation: {
          isLoggedIn: boolean;
          authenticationMethod?: 'oidc' | 'hti';
          htiTokenVerified?: boolean;
          expirationDate?: string;
          accessGrantId?: string;
          accessGrantExpirationDate?: string;
          webId?: string;
          pods?: string[];
          clientId?: string;
          usingCustomCredentials?: boolean;
          steps?: {
            oidcConfiguration?: unknown;
            clientAuthentication?: unknown;
            vcConfiguration?: unknown;
            accessRequestId?: string;
            umaConfiguration?: unknown;
            umaTicket?: unknown;
            umaAccessToken?: unknown;
          };
          tokens?: {
            accessToken: any;
            idToken: any;
          }
        } = { isLoggedIn: false };

        if (res.locals.session) {
          sessionInformation.isLoggedIn = res.locals.session.info.isLoggedIn;

          if(res.locals.session.info.isLoggedIn) {
            sessionInformation.authenticationMethod = 'oidc';
          }

          if(res.locals.session.info.expirationDate) {
            sessionInformation.expirationDate = new Date(res.locals.session.info.expirationDate * 1000).toISOString();
          }

          if(res.locals.session.info.webId) {
            sessionInformation.webId = res.locals.session.info.webId;
          }

          if(res.locals.pods) {
            sessionInformation.pods = res.locals.pods;
          }
        }

        // When the citizen's Web ID was obtained via the HTI flow, expose it as an authenticated context.
        if (!sessionInformation.isLoggedIn && req.session.htiWebId) {
          sessionInformation.isLoggedIn = true;
          sessionInformation.authenticationMethod = 'hti';
          sessionInformation.webId = req.session.htiWebId;
          sessionInformation.htiTokenVerified = !!req.session.htiTokenVerified;

          try {
            sessionInformation.pods = await getPodUrlAll(req.session.htiWebId);
          } catch (error) {
            log.debug(`[GET /session-information] Could not fetch pods for HTI Web ID [${req.session.htiWebId}]: ${(error as Error).message}`);
          }
        }

        sessionInformation.usingCustomCredentials = !!(req.session.clientId && req.session.clientSecret);
        if (sessionInformation.usingCustomCredentials) {
          sessionInformation.clientId = req.session.clientId;
        }

        // Summaries of the executed flow steps (mirroring the Postman collection).
        sessionInformation.steps = {
          oidcConfiguration: req.session.oidcConfiguration,
          clientAuthentication: req.session.clientAuthentication,
          vcConfiguration: req.session.vcConfiguration,
          accessRequestId: req.session.accessRequestId,
          umaConfiguration: req.session.umaConfiguration,
          umaTicket: req.session.umaTicket,
          umaAccessToken: req.session.umaAccessToken
        };

        if(req.session.accessGrant) {
          const accessGrant = JSON.parse(req.session.accessGrant!) as AccessGrant;
          if (accessGrant.id) {
            sessionInformation.accessGrantId = accessGrant.id;
          }
        }

        if (req.session.accessGrantExpirationDate) {
          sessionInformation.accessGrantExpirationDate = req.session.accessGrantExpirationDate;
        }

        // @ts-ignore
        if(req.session.tokens) {
          // @ts-ignore
          sessionInformation.tokens = req.session.tokens;
        }

        res.json(sessionInformation);
      } catch (error: any) {
        // A general error catcher which will, in turn, call the ExpressJS error handler.
        next(error);
      }
    }
  );
}
