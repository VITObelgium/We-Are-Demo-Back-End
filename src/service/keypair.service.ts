import {calculateJwkThumbprint, exportJWK, generateKeyPair} from "jose";
import type * as types from "jose/dist/types/types";

interface KeyPair {
    publicKey: types.JWK
    privateKey: types.JWK
}

var keyPair: KeyPair

export async function getKeyPair(): Promise<KeyPair> {
    if (!keyPair) {
        keyPair = await createKeyPairInternal()
    }
    return keyPair
}

async function createKeyPairInternal(): Promise<KeyPair> {

    let keyPair
    let alg
    let crv
    alg = 'RS512';
    const { publicKey, privateKey } = await generateKeyPair(alg, {
        modulusLength: 2048,
        extractable: true,
    });

    const jwk = await exportJWK(publicKey)
    const jwkPrivate = await exportJWK(privateKey)
    jwk.alg = alg
    if (crv) {
        jwk.crv = crv
    }
    jwk.kid = await calculateJwkThumbprint(jwk)

    jwkPrivate.alg = alg
    return {
        publicKey: jwk,
        privateKey: jwkPrivate
    }
}
