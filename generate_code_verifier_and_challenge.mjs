import { createHash, randomBytes } from "crypto";

let encode;
if (Buffer.isEncoding('base64url')) {
    encode = (input, encoding = 'utf8') => Buffer.from(input, encoding).toString('base64url');
} else {
    const fromBase64 = (base64) => base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    encode = (input, encoding = 'utf8') =>
        fromBase64(Buffer.from(input, encoding).toString('base64'));
}

const decode = (input) => Buffer.from(input, 'base64');

const random = (bytes = 32) => encode(randomBytes(bytes));

const state =  random;
const nonce = random;
const codeVerifier = random;
const codeChallenge = (codeVerifier) =>
    encode(createHash('sha256').update(codeVerifier).digest())

const stateValue =  random();
const nonceValue = random();
const codeVerifierValue = random();
const codeChallengeValue = codeChallenge(codeVerifierValue);

console.log(`
    State Value: ${stateValue}
    Nonce Value: ${nonceValue}
    Code Verifier Value: ${codeVerifierValue}
    Code Challenge Value: ${codeChallengeValue}
`);