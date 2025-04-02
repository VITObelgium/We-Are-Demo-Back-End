import {Express} from "express";
import {getLaunchToken} from "../service/hti-service";
import {getSession, getSessionMandatory} from "@vito-nv/weare-expressjs";

export function htiEndpoint(app: Express) {
    app.get("/hti-launch", getSession.bind({ storage: globalThis.solidStorage }), async (req, res, next) => {
        let hostHeader = req.header('host');
        if (!req.query.webId || !req.query.redirectUrl) {
            res.status(400).send("Missing webId or redirectUrl in the request query parameters.");
            return;
        }
        console.log(req.query.redirectUrl);
        let launch_token = await getLaunchToken({
            iss: `${req.protocol}://${hostHeader}`,
            sub: req.query.webId as string,
            redirectUrl: req.query.redirectUrl as string,
        });
        res.json({
            launch_token: launch_token
        });
    });

}
