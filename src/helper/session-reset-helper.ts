/**
 * Helper to reset the flow-related session data (OIDC/HTI authentication state, flow step
 * summaries, access grants, tokens, ...) so a citizen can restart either demo flow from scratch.
 *
 * The active We Are environment and client credentials selection (see `/client-credentials`)
 * are intentionally left untouched by this helper: callers that switch environment/client
 * combine it with their own update of that selection.
 */
import {Request, Response} from "express";

/**
 * Clears all flow-related session data. Also logs out any active Solid session.
 *
 * @param {Request} req - The Express request object, containing the session.
 * @param {Response} res - The Express response object, used to access a logged-in Solid session
 *   (populated by the `getSessionOptional`/`getSessionMandatory` middleware).
 */
export async function resetFlowSession(req: Request, res: Response): Promise<void> {
    if (res.locals.session?.info?.isLoggedIn) {
        await res.locals.session.logout();
    }

    delete req.session.solidSid;
    delete req.session.redirectUrl;
    delete req.session.accessGrant;
    delete req.session.accessGrantExpirationDate;
    delete req.session.pods;
    delete req.session.locale;
    delete req.session.workaroundActive;
    delete req.session.htiWebId;
    delete req.session.htiToken;
    delete req.session.htiTokenVerified;
    delete req.session.htiLaunchState;
    delete req.session.oidcConfiguration;
    delete req.session.clientAuthentication;
    delete req.session.clientAccessToken;
    delete req.session.clientIdToken;
    delete req.session.vcConfiguration;
    delete req.session.accessRequestId;
    delete req.session.umaConfiguration;
    delete req.session.umaTicket;
    delete req.session.umaTicketValue;
    delete req.session.umaAccessToken;
    delete req.session.tokens;
}
