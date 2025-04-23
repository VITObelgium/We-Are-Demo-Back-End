import {Express} from "express";
import {createLaunchToken} from "../service/hti-service";
import {getSessionMandatory} from "@vito-nv/weare-expressjs";
import log from "loglevel";

export function htiEndpoint(app: Express) {
    app.get("/create-hti", async (req, res, next) => {
        log.debug("Endpoint '/create-hti' called");

        if (!req.query.webId || !req.query.redirectUrl) {
            res.status(400).send("Missing webId or redirectUrl in the request query parameters.");
            return;
        }

        next();
    }, getSessionMandatory.bind({ storage: globalThis.solidStorage }), async (req, res) => {
        let launchToken = await createLaunchToken(
            new URL(`${process.env['PROTOCOL']}://${req.get("host")}`), // This is required due to intermediate proxies that might perform TLS offloading
            req.query.webId as string,
            new URL(req.query.redirectUrl as string)
        );
        res.json({
            launchToken
        });

        return;
    });

}
