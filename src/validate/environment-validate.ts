/**
 * Validates the environment configuration by checking for required environment variables.
 * The function reads from a provided `.env.example` file and compares it with the current environment variables.
 *
 * @param {string} examplePath - The file path to the `.env.example` file containing example environment variables.
 *
 * This function performs the following steps:
 * 1. Reads the `.env.example` file to extract all required environment variables.
 * 2. Iterates over each line, ignoring comments and empty lines, to determine which environment variables are required.
 * 3. Checks if each required environment variable is defined in `process.env`.
 * 4. If any required environment variables are missing or empty, logs an error and throws an exception.
 *
 * Example usage:
 * ```
 * initializeEnvironment('/path/to/.env.example');
 * ```
 *
 * If any required environment variables are missing, an error like the following will be thrown:
 * ```
 * Error: Missing or empty environment variables: DB_HOST, API_KEY
 * ```
 */
import log from "loglevel";
import fs from "fs";
import path from "path";

export function initializeEnvironment(examplePath: string): void {
  const envExample = fs.readFileSync(path.resolve(examplePath), "utf8");
  const envExampleLines = envExample.split("\n");
  const missing: string[] = [];
  envExampleLines.forEach((line) => {
    const uncommented = line.split("#")[0];
    const splitted = uncommented.split("=");

    if (splitted.length > 1) {
      const [key] = splitted;
      if (!process.env[key] || process.env[key] === "") {
        missing.push(key);
      }
    }
  });

  if (missing.length > 0) {
    const message = `Missing or empty environment variables: ${missing.join(", ")}`;
    log.error(message);
    throw new Error(message);
  }
}
