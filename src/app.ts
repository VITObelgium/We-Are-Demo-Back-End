/**
 * Import necessary modules and middleware.
 * `express`: A web framework for Node.js to create server-side applications.
 * `body-parser`: Middleware to parse incoming request bodies.
 * `authenticationEndpoint`: Custom module to handle authentication logic.
 * `podEndpoint`: Custom module to handle pod-specific logic.
 * `overrideSessionData`: Function from an external package to modify session data handling.
 * `initializeGlobal`: Custom function to initialize global settings.
 * `express-session`: Middleware for session management.
 * `dotenv`: Loads environment variables from a `.env` file.
 * `sessionEndpoint`: Custom module to handle session-related endpoints.
 * `vcEndpoint`: Custom module to handle verifiable credentials logic.
 * `initializeEnvironment`: Custom function to validate and initialize the environment configuration.
 * `path`: Node.js module to handle file paths.
 */

import express, { Request as ExpressRequest, Response as ExpressResponse } from "express";
import bodyParser from "body-parser";
import { authenticationEndpoint } from "./endpoint/authentication-endpoint";
import podEndpoint from "./endpoint/pod-endpoint";
import { overrideSessionData } from "@vito-nv/weare-expressjs";
import { initializeGlobal } from "./initialize/global-initialize";
import session from "express-session";
import dotEnv from "dotenv";
import {sessionEndpoint} from "./endpoint/session-endpoint";
import vcEndpoint from "./endpoint/vc-endpoint";
import {initializeEnvironment} from "./validate/environment-validate";
import path from "path";

// Load environment variables from the `.env` file into `process.env`
dotEnv.config();

// Initialize Express application
const app = express();
const cors = require("cors");

/**
 * Call function to customize the express-session
 */
overrideSessionData();

/**
 * Helper function to validate that all necessary environment variables are set.
 */
initializeEnvironment(path.join(__dirname, "../", ".env.example"));

/**
 * Call function to initialize global settings: environment variables used and initialization of services.
 */
initializeGlobal();

/**
 * Configure session handling middleware.
 * This middleware creates and manages user sessions with cookies.
 * Options:
 * - `name`: The name of the session cookie.
 * - `resave`: Avoid resaving session if not modified.
 * - `saveUninitialized`: Don't create session until data is stored.
 * - `secret`: Secret key used to sign the session ID.
 * - `cookie`: Session cookie configuration.
 */
app.use(
  session({
    name: "weare-demo-session",
    resave: false,
    saveUninitialized: false,
    secret: "wearedemobackendcookiesecret",
    cookie: {
      httpOnly: false,
      secure: false,
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);


/**
 * Enable CORS (Cross-Origin Resource Sharing) to allow requests from the frontend.
 * - `origin`: URL of the frontend.
 * - `credentials`: Whether to allow credentials (e.g., cookies, authorization headers).
 */
app.use(
  cors({
    origin: globalThis.frontendUrl,
    credentials: true,
  })
);


/**
 * Middleware to parse incoming request bodies in different formats.
 * - `urlencoded`: Parses URL-encoded bodies (from form submissions).
 * - `text`: Parses text/plain requests.
 * - `json`: Parses JSON bodies.
 * - `raw`: Parses raw binary bodies.
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(express.json());
app.use(bodyParser.raw());



/**
 * Register application endpoints.
 * These functions define routes and their handlers for the application.
 */
authenticationEndpoint(app);
podEndpoint(app);
sessionEndpoint(app);
vcEndpoint(app);

/**
 * Root endpoint that responds with a status message.
 */
app.use("/", (req: ExpressRequest, res: ExpressResponse): void => {
  res.send("Demo We Are backend is up and running!");
});

/**
 * Start the web server on the port specified in the `.env` file.
 */
app.listen(process.env.PORT, (): void => {
  console.log("Server is up on port", process.env.PORT);
});
