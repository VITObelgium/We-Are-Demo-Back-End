/**
 * This module defines routes for handling access requests and access grants using Verifiable Credentials (VC).
 *
 * The `vcEndpoint` function sets up the following endpoints:
 * 1. `/access-request`: Allows clients to request access credentials based on provided data.
 * 2. `/access-grant`: Retrieves an access grant and stores it in the session for future use.
 *
 * The function integrates with session management, logging, and error handling.
 * It uses the global `vcService` to interact with the VC backend, and `solidStorage` for session storage.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */

import {Express} from "express";
import log from "loglevel";
import { getSession, getPods } from "@weare/weare-expressjs";
import httpContext from "express-http-context";

export default function vcEndpoint(app: Express) {
    app.post('/access-request', (req, res, next) => {
      log.debug(`Calling POST /access-request`);
      next();
    }, getSession.bind({storage: globalThis.solidStorage}), getPods, async (req, res, next) => {
      try {
        const accessRequest = await globalThis.vcService.issueAccessRequest(req.body.data, req.body.webId, req.body.purpose, new Date(req.body.expirationDate), req.body.access, httpContext.get('correlationId'))

        res.status(201).send(accessRequest);
      } catch(error) {
        // A general error catcher which will, in turn, call the ExpressJS error handler.
        next(error);
      }
    });

  app.post('/access-grant', (req, res, next) => {
    log.debug(`Calling GET /access-grant`);
    next();
  }, getSession.bind({storage: globalThis.solidStorage}), async (req, res, next) => {
    try {
      const accessGrantId = req.body.accessGrantId as string;
      const accessGrant = await globalThis.vcService.fetchAccessGrant(accessGrantId, httpContext.get('correlationId'))
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
  }, getSession.bind({storage: globalThis.solidStorage}), async (req, res, next) => {
    try {
      const accessGrants = await globalThis.vcService.fetchAccessGrants(httpContext.get('correlationId'), {ownerWebId: res.locals.session.info.webId});
      res.status(200).send(JSON.stringify(accessGrants));
    } catch(error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
}
