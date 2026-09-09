/**
 * Defines the `/client-credentials` endpoints to manage custom client credentials on the session.
 *
 * By default the back-end uses the client credentials configured in the `.env` file.
 * These endpoints allow a caller to override the client ID and client secret for the
 * current session. All subsequent calls in the session will use the custom credentials.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */
import {Express} from "express";
import log from "loglevel";

export function credentialsEndpoint(app: Express) {

  /**
   * PUT /client-credentials
   *
   * Stores a custom client ID and client secret on the current session.
   *
   * @route {PUT} /client-credentials
   * @body {string} clientId - The client ID to use for this session.
   * @body {string} clientSecret - The client secret to use for this session.
   * @returns {Object} A JSON object with the stored client ID.
   */
  app.put("/client-credentials", (req, res, next) => {
    log.debug(`Endpoint PUT /client-credentials called.`);
    next();
  }, async (req, res, next) => {
    try {
      const {clientId, clientSecret} = req.body ?? {};

      if (!clientId || !clientSecret || typeof clientId !== "string" || typeof clientSecret !== "string") {
        res.status(400).send("Both 'clientId' and 'clientSecret' are required.");
        return;
      }

      req.session.clientId = clientId.trim();
      req.session.clientSecret = clientSecret.trim();

      res.json({clientId: req.session.clientId, usingCustomCredentials: true});
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * DELETE /client-credentials
   *
   * Removes the custom client credentials from the current session,
   * reverting to the default credentials configured on the back-end.
   *
   * @route {DELETE} /client-credentials
   */
  app.delete("/client-credentials", (req, res, next) => {
    log.debug(`Endpoint DELETE /client-credentials called.`);
    next();
  }, async (req, res, next) => {
    try {
      delete req.session.clientId;
      delete req.session.clientSecret;

      res.json({usingCustomCredentials: false});
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
}
