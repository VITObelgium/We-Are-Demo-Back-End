/**
 * Helpers to resolve the We Are platform environment (development/test/acceptance/production)
 * and the client credential pairs configured for it.
 *
 * Environment-scoped configuration values are stored in `process.env` with a `_DEV`, `_TST`,
 * `_ACC` or `_PRD` suffix (e.g. `WEARE_OIDC_URL_ACC`). Client credentials additionally support an
 * enumeration index so multiple pairs can be configured per environment
 * (e.g. `WEARE_OIDC_CLIENT_ID_1_ACC`, `WEARE_OIDC_CLIENT_ID_2_ACC`, ...).
 */

/** The We Are platform environments supported by this application. */
export type WeAreEnvironment = 'DEV' | 'TST' | 'ACC' | 'PRD';

export const WEARE_ENVIRONMENTS: WeAreEnvironment[] = ['DEV', 'TST', 'ACC', 'PRD'];

/** A configured client credential pair, without exposing the secret. */
export interface ClientCredentialOption {
    index: number;
    displayName: string;
}

/** Resolved client credentials for a given environment and index. */
export interface ClientCredentials {
    index: number;
    clientId: string;
    clientSecret: string;
    displayName: string;
}

function isWeAreEnvironment(value: string | undefined): value is WeAreEnvironment {
    return !!value && (WEARE_ENVIRONMENTS as string[]).includes(value);
}

/**
 * Returns the environment that is active by default at startup, as configured via the
 * `WEARE_ENVIRONMENT` environment variable.
 *
 * @throws {Error} When `WEARE_ENVIRONMENT` is missing or not one of `DEV`, `TST`, `ACC`, `PRD`.
 */
export function getDefaultEnvironment(): WeAreEnvironment {
    const configured = process.env.WEARE_ENVIRONMENT;
    if (!isWeAreEnvironment(configured)) {
        throw new Error(`Environment variable [WEARE_ENVIRONMENT] must be one of ${WEARE_ENVIRONMENTS.join(', ')}, got '${configured}'.`);
    }
    return configured;
}

/**
 * Parses and validates a candidate environment value (e.g. coming from a request), falling
 * back to `undefined` when it is not a recognized environment.
 */
export function parseWeAreEnvironment(value: unknown): WeAreEnvironment | undefined {
    return typeof value === "string" && isWeAreEnvironment(value) ? value : undefined;
}

/**
 * Reads an environment-scoped configuration variable, e.g. `getEnvVar('WEARE_OIDC_URL', 'ACC')`
 * reads `WEARE_OIDC_URL_ACC`.
 *
 * @throws {Error} When the resulting environment variable is missing or empty.
 */
export function getEnvVar(base: string, environment: WeAreEnvironment): string {
    const key = `${base}_${environment}`;
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing environment variable [${key}] for the '${environment}' environment.`);
    }
    return value;
}

/**
 * Lists the client credential pairs configured for the given environment (by index),
 * without exposing the client secrets. Intended for the front-end's environment/client switcher.
 */
export function getClientCredentialOptions(environment: WeAreEnvironment): ClientCredentialOption[] {
    const prefix = "WEARE_OIDC_CLIENT_ID_";
    const suffix = `_${environment}`;
    const options: ClientCredentialOption[] = [];

    for (const key of Object.keys(process.env)) {
        if (!key.startsWith(prefix) || !key.endsWith(suffix) || !process.env[key]) {
            continue;
        }
        const indexPart = key.slice(prefix.length, key.length - suffix.length);
        const index = Number(indexPart);
        if (!Number.isInteger(index) || index <= 0) {
            continue;
        }
        options.push({
            index,
            displayName: process.env[`WEARE_OIDC_CLIENT_DISPLAY_NAME_${index}_${environment}`] || `Client ${index}`
        });
    }

    return options.sort((a, b) => a.index - b.index);
}

/**
 * Resolves the client credentials configured for the given environment and index.
 *
 * @throws {Error} When no client ID/secret is configured for that environment/index pair.
 */
export function getClientCredentials(environment: WeAreEnvironment, index: number): ClientCredentials {
    const clientId = process.env[`WEARE_OIDC_CLIENT_ID_${index}_${environment}`];
    const clientSecret = process.env[`WEARE_OIDC_CLIENT_SECRET_${index}_${environment}`];
    if (!clientId || !clientSecret) {
        throw new Error(`No client credentials configured for index [${index}] in the '${environment}' environment. Configure WEARE_OIDC_CLIENT_ID_${index}_${environment} and WEARE_OIDC_CLIENT_SECRET_${index}_${environment}.`);
    }
    const displayName = process.env[`WEARE_OIDC_CLIENT_DISPLAY_NAME_${index}_${environment}`] || `Client ${index}`;
    return {index, clientId, clientSecret, displayName};
}

/**
 * Returns the first (lowest index) configured client credential index for the environment.
 *
 * @throws {Error} When no client credentials at all are configured for that environment.
 */
export function getDefaultClientIndex(environment: WeAreEnvironment): number {
    const options = getClientCredentialOptions(environment);
    if (options.length === 0) {
        throw new Error(`No client credentials configured for the '${environment}' environment. Configure at least WEARE_OIDC_CLIENT_ID_1_${environment} and WEARE_OIDC_CLIENT_SECRET_1_${environment}.`);
    }
    return options[0].index;
}
