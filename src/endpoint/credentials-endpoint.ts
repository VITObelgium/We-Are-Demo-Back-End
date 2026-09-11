/**
 * Defines the `/client-credentials` endpoints to manage the active We Are environment and
 * client credentials on the session.
 *
 * By default the back-end uses the environment and client credentials configured in the
 * `.env` file (`WEARE_ENVIRONMENT` and the lowest-indexed `WEARE_OIDC_CLIENT_ID_<index>_<env>`).
 * These endpoints allow a caller to:
 * - switch the active We Are environment (TST/ACC/PRD) and select one of the configured client
 *   credential pairs for it, or
 * - override the client ID/secret entirely with custom values (for testing credentials that
 *   are not configured in `.env`).
 *
 * All subsequent calls in the session will use the selected environment/credentials.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */
import {Express} from "express";
import log from "loglevel";
import {getSessionOptional} from "@vito-nv/weare-expressjs";
import {WEARE_ENVIRONMENTS, getClientCredentialOptions, parseWeAreEnvironment} from "../helper/environment-helper";
import {getSessionServices} from "../helper/session-services";
import {resetFlowSession} from "../helper/session-reset-helper";

export function credentialsEndpoint(app: Express) {

  /**
   * GET /client-credentials/options
   *
   * Lists the available We Are environments and, for each of them, the configured client
   * credential pairs (index + display name only, secrets are never exposed), plus the
   * environment/client currently active on this session.
   *
   * @route {GET} /client-credentials/options
   */
  app.get("/client-credentials/options", (req, res, next) => {
    log.debug(`Endpoint GET /client-credentials/options called.`);
    next();
  }, async (req, res, next) => {
    try {
      const clientsByEnvironment = Object.fromEntries(
        WEARE_ENVIRONMENTS.map((environment) => [environment, getClientCredentialOptions(environment)])
      );
      // Indicates, per environment, whether custom (volatile, session-only) credentials were
      // previously entered for it, so the front-end can offer them as a selectable option again
      // without the caller having to re-type the client secret.
      const customCredentialsByEnvironment = Object.fromEntries(
        WEARE_ENVIRONMENTS.map((environment) => {
          const custom = req.session?.customCredentials?.[environment];
          return [environment, custom ? {displayName: custom.displayName ?? "Custom credentials"} : undefined];
        })
      );
      const active = getSessionServices(req);

      res.json({
        environments: WEARE_ENVIRONMENTS,
        clientsByEnvironment,
        customCredentialsByEnvironment,
        active: {
          environment: active.environment,
          clientIndex: active.clientIndex,
          displayName: active.displayName,
          usingCustomCredentials: active.usingCustomCredentials
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /client-credentials
   *
   * Selects the active We Are environment and client credentials for the current session.
   * Accepts one of:
   * - `{ environment, clientIndex }` to select one of the configured client credential pairs,
   * - `{ clientId, clientSecret, environment?, displayName? }` for a fully custom (volatile,
   *   session-only) credential pair, or
   * - `{ environment, useCustomCredentials: true }` to re-select custom credentials previously
   *   entered for that environment, without having to re-type the client secret.
   *
   * @route {PUT} /client-credentials
   * @body {string} [environment] - One of TST, ACC, PRD. Defaults to the currently active environment.
   * @body {number} [clientIndex] - The configured client credential index to use for the environment.
   * @body {string} [clientId] - A custom client ID to use for this session, instead of `clientIndex`.
   * @body {string} [clientSecret] - A custom client secret to use for this session, instead of `clientIndex`.
   * @body {string} [displayName] - Display name shown for a custom `clientId`/`clientSecret` pair.
   * @body {boolean} [useCustomCredentials] - Re-selects the custom credentials already stored for
   *   `environment` (set via a previous call with `clientId`/`clientSecret`), instead of providing them again.
   * @returns {Object} A JSON object describing the now-active environment/client selection.
   *
   * Switching the active environment/client invalidates any in-progress flow state tied to the
   * previous identity (tokens, access grants, ...); this endpoint resets that flow state first.
   */
  app.put("/client-credentials", (req, res, next) => {
    log.debug(`Endpoint PUT /client-credentials called.`);
    next();
  }, getSessionOptional.bind({storage: globalThis.solidStorage}), async (req, res, next) => {
    try {
      const {environment: rawEnvironment, clientIndex, clientId, clientSecret, displayName, useCustomCredentials} = req.body ?? {};

      if (rawEnvironment !== undefined && parseWeAreEnvironment(rawEnvironment) === undefined) {
        res.status(400).send(`'environment' must be one of ${WEARE_ENVIRONMENTS.join(", ")}.`);
        return;
      }
      const environment = parseWeAreEnvironment(rawEnvironment) ?? req.session?.weAreEnvironment ?? globalThis.weAreDefaultEnvironment;

      const hasCustomCredentials = clientId !== undefined || clientSecret !== undefined;
      if (hasCustomCredentials) {
        if (!clientId || !clientSecret || typeof clientId !== "string" || typeof clientSecret !== "string") {
          res.status(400).send("Both 'clientId' and 'clientSecret' are required when providing custom credentials.");
          return;
        }

        await resetFlowSession(req, res);
        req.session.weAreEnvironment = environment;
        req.session.customCredentials = {
          ...req.session.customCredentials,
          [environment]: {
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim(),
            displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : undefined
          }
        };
        req.session.usingCustomCredentials = true;
        delete req.session.clientIndex;
      } else if (useCustomCredentials === true) {
        if (!req.session?.customCredentials?.[environment]) {
          res.status(400).send(`No custom credentials were previously entered for the '${environment}' environment.`);
          return;
        }

        await resetFlowSession(req, res);
        req.session.weAreEnvironment = environment;
        req.session.usingCustomCredentials = true;
        delete req.session.clientIndex;
      } else {
        if (typeof clientIndex !== "number" || !Number.isInteger(clientIndex)) {
          res.status(400).send("'clientIndex' (or 'clientId'/'clientSecret' for custom credentials) is required.");
          return;
        }
        const options = getClientCredentialOptions(environment);
        if (!options.some((option) => option.index === clientIndex)) {
          res.status(400).send(`No client credentials configured for index [${clientIndex}] in the '${environment}' environment.`);
          return;
        }

        await resetFlowSession(req, res);
        req.session.weAreEnvironment = environment;
        req.session.clientIndex = clientIndex;
        req.session.usingCustomCredentials = false;
      }

      const active = getSessionServices(req);
      res.json({
        environment: active.environment,
        clientIndex: active.clientIndex,
        displayName: active.displayName,
        usingCustomCredentials: active.usingCustomCredentials
      });
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });

  /**
   * DELETE /client-credentials
   *
   * Removes the environment/client selection from the current session, including any custom
   * (volatile) credentials entered for any environment, reverting to the default environment
   * and credentials configured on the back-end.
   * Also resets any in-progress flow state tied to the previous identity.
   *
   * @route {DELETE} /client-credentials
   */
  app.delete("/client-credentials", (req, res, next) => {
    log.debug(`Endpoint DELETE /client-credentials called.`);
    next();
  }, getSessionOptional.bind({storage: globalThis.solidStorage}), async (req, res, next) => {
    try {
      await resetFlowSession(req, res);

      delete req.session.weAreEnvironment;
      delete req.session.clientIndex;
      delete req.session.customCredentials;
      delete req.session.usingCustomCredentials;

      const active = getSessionServices(req);
      res.json({
        environment: active.environment,
        clientIndex: active.clientIndex,
        displayName: active.displayName,
        usingCustomCredentials: false
      });
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
}
