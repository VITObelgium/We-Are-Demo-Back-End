import {Express} from "express";
import {getResource, getSessionOptional} from "@vito-nv/weare-expressjs";
import {getKeyPair} from "../service/keypair.service";

export function oidcEndpoint(app: Express) {

    app.get("/.well-known/oidc-configuration", async (req, res, next) => {
        next();
    }, async (req, res, next) => {
        let hostHeader = req.header('host');

        const oidcConfiguration = {
            "issuer": `${req.protocol}://${hostHeader}`,
            "jwks_uri": `${req.protocol}://${hostHeader}/.well-known/jwks.json`
        }
        res.json(oidcConfiguration);
    });

    app.get("/.well-known/jwks.json", async (req, res, next) => {
        next();
    }, async (req, res, next) => {
        let keyPair = await getKeyPair();
        const jwks = {
            keys: [
                keyPair.publicKey
            ]
        }
        res.json(jwks)
    })
}
