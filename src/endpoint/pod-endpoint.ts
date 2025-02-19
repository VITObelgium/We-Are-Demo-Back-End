/**
 * Defines the `/read` and `/write` endpoints for interacting with resources in a Solid Pod.
 *
 * The `podEndpoint` function sets up two endpoints for reading and writing data to a Solid Pod:
 * - `/read`: Retrieves a resource from the Solid Pod and returns it as Turtle.
 * - `/write`: Writes a new resource to the Solid Pod.
 *
 * Both endpoints make use of session management, access grant validation, and resource management functionality.
 *
 * @param {Express} app - The Express application instance on which the routes are mounted.
 */
import { solidDatasetAsTurtle } from "@inrupt/solid-client";
import { Express } from "express";
import log from "loglevel";
import {
  validateAccessGrant,
  getSession,
  getResource,
  writeFile, getFile, writeResource
} from "@vito-nv/weare-expressjs"

export default function podEndpoint(app: Express) {

  /**
   * GET /read
   *
   * This endpoint reads a resource from the Solid Pod based on the provided `resourceUrl` query parameter.
   * The resource is retrieved and returned in Turtle format.
   *
   * @route {GET} /read
   *
   * @query {string} resourceUrl - The URL of the resource to read from the Solid Pod.
   *
   * @returns {string} The resource in Turtle format.
   *
   * @throws {Error} If an error occurs during resource retrieval, it will be passed to the Express error handler.
   */
  // @ts-ignore
  app.get("/read", async (req, res, next) => {
    log.debug("Endpoint '/read' called");
    next();
  }, getSession.bind({ storage: globalThis.solidStorage }), validateAccessGrant, getResource.bind({ resourceUrlParameterKey: "resourceUrl", podService: globalThis.podService }), async (req, res, next) => {
    const turtle = await solidDatasetAsTurtle(res.locals.solidDataset);
    res.send(turtle);
  });

  app.get("/read-file", async (req, res, next) => {
    log.debug("Endpoint '/read' called");
    next();
  }, getSession.bind({ storage: globalThis.solidStorage }), validateAccessGrant, getFile.bind({ fileUrlParameterKey: "fileUrl", podService: globalThis.podService }), async (req, res, next) => {
    res.send(res.locals.payload);
  });

  /**
   * POST /write
   *
   * This endpoint writes a new resource to the Solid Pod based on the provided `resourceUrl` query parameter and body content.
   * It expects the resource data to be sent in the request body.
   *
   * @route {POST} /write
   *
   * @query {string} resourceUrl - The URL of the resource to write to the Solid Pod.
   *
   * @body {any} The data to write to the resource. This should be in RDF/turtle format.
   *
   * @returns {string} A success message confirming resource creation.
   *
   * @throws {Error} If an error occurs during resource creation, it will be passed to the Express error handler.
   */
  app.post("/write", async (req, res, next) => {
    log.debug("Endpoint '/write' called");
    next();
  }, getSession.bind({ storage: globalThis.solidStorage }), validateAccessGrant, writeResource.bind({ resourceUrlParameterKey: "resourceUrl", podService: globalThis.podService! }), async (req, res, next) => {
    res.send("Resource created");
  });

  // @ts-ignore
  app.post("/write-file", async (req, res, next) => {
    log.debug("Endpoint '/write-file' called");
    next();
  }, getSession.bind({ storage: globalThis.solidStorage }), validateAccessGrant, writeFile.bind({ fileUrlParameterKey: "fileUrl", podService: globalThis.podService! }), async (req, res, next) => {
    res.send("File created");
  });

}
