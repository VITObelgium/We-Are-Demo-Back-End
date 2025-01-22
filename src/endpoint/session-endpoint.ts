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
          expirationDate?: string;
          accessGrantId?: string;
          accessGrantExpirationDate?: string;
          webId?: string;
          pods?: string[];
        } = { isLoggedIn: false };

        if (res.locals.session) {
          sessionInformation.isLoggedIn = res.locals.session.info.isLoggedIn;
          sessionInformation.expirationDate = new Date(res.locals.session.info.expirationDate * 1000).toISOString();

          if(res.locals.session.info.webId) {
            sessionInformation.webId = res.locals.session.info.webId;
          }

          if(res.locals.pods) {
            sessionInformation.pods = res.locals.pods;
          }
        }

        if(req.session.accessGrant) {
          const accessGrant = JSON.parse(req.session.accessGrant!) as AccessGrant;
          if (accessGrant.id) {
            sessionInformation.accessGrantId = accessGrant.id;
          }
        }

        if (req.session.accessGrantExpirationDate) {
          sessionInformation.accessGrantExpirationDate = req.session.accessGrantExpirationDate;
        }

        res.json(sessionInformation);
      } catch (error: any) {
        // A general error catcher which will, in turn, call the ExpressJS error handler.
        next(error);
      }
    }
  );
}
