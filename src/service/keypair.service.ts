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
    const algorithm = 'RS512';
    const { publicKey, privateKey } = await generateKeyPair(algorithm, {
        modulusLength: 2048,
        extractable: true,
    });

    const publicJwk = await exportJWK(publicKey)
    const privateJwk = await exportJWK(privateKey)
    publicJwk.alg = algorithm
    publicJwk.kid = await calculateJwkThumbprint(publicJwk)

    privateJwk.alg = algorithm
    return {
        publicKey: publicJwk,
        privateKey: privateJwk
    }
}
