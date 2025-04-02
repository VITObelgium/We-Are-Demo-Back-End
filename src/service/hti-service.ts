import {SignJWT} from "jose";
import {getKeyPair} from "./keypair.service";
import {v4} from "uuid";

interface LaunchUrlRequest {
    redirectUrl: string;
    sub: string;
    iss: string;
}

export async function getLaunchToken(req:LaunchUrlRequest) {
    let keyPair = await getKeyPair();
    return await new SignJWT({})
        .setIssuer(req.iss)
        .setAudience(req.redirectUrl)
        .setSubject(req.sub)
        .setExpirationTime("15m")
        .setProtectedHeader({alg: "RS512", typ: "JWT", kid: keyPair.publicKey.kid})
        .setIssuedAt()
        .setNotBefore(
            "10s"
        )
        .setJti(v4())
        .sign(keyPair.privateKey);
}
