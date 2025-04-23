import {SignJWT} from "jose";
import {getKeyPair} from "./keypair.service";
import {v4} from "uuid";

export async function createLaunchToken(issuer: URL, subject: string, recipient: URL) {
    let keyPair = await getKeyPair();
    return await new SignJWT({})
    .setIssuer(issuer.href)
    .setAudience(recipient.href)
    .setSubject(subject)
    .setExpirationTime("15m")
    .setProtectedHeader({alg: "RS512", typ: "JWT", kid: keyPair.publicKey.kid})
    .setIssuedAt()
    .setNotBefore(
        "10s"
    )
    .setJti(v4())
    .sign(keyPair.privateKey);
}
