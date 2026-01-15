const claimToken = {
    "@context": [
        "https://www.w3.org/2018/credentials/v1"
    ],
    "type": [
        "VerifiablePresentation"
    ],
    "verifiableCredential": []
}

const accessGrant = {
    "id": "https://vc.sandbox-pod.datanutsbedrijf.be/vc/65741eb1-9b74-4258-91e8-9a69b88809fa",
    "type": [
        "VerifiableCredential",
        "SolidAccessGrant"
    ],
    "proof": {
        "type": "Ed25519Signature2020",
        "created": "2025-04-01T08:01:13.503Z",
        "domain": "solid",
        "proofPurpose": "assertionMethod",
        "proofValue": "z5qmtJ6KeSZ2zw9PJ4jMNqQoMxPEmrH7vHecUQvLtSwsnxB6cSJFXZFB6v4dSL6qjZa5pNS77HcdEmqSW4GH4ToJz",
        "verificationMethod": "https://vc.sandbox-pod.datanutsbedrijf.be/key/b7356870-a180-3bfb-bea9-f9a13cd7b04e"
    },
    "credentialStatus": {
        "id": "https://vc.sandbox-pod.datanutsbedrijf.be/status/oLch#0",
        "type": "RevocationList2020Status",
        "revocationListCredential": "https://vc.sandbox-pod.datanutsbedrijf.be/status/oLch",
        "revocationListIndex": "0"
    },
    "credentialSubject": {
        "id": "https://tni.webid.burgerprofiel.dev-vlaanderen.be/profiles/05be274a-21bf-4b25-8900-1899e0599316",
        "providedConsent": {
            "mode": [
                "Read",
                "Append",
                "Write"
            ],
            "forPersonalData": "https://storage.sandbox-pod.datanutsbedrijf.be/6a43495b-98fb-4df8-a608-69225cec06c3/book_index",
            "hasStatus": "ConsentStatusExplicitlyGiven",
            "isProvidedTo": "https://id.we-are-acc.vito.be/24718a19-4d75-4925-b99c-db103bfba9f5"
        }
    },
    "expirationDate": "2025-09-28T08:01:13.489713189Z",
    "issuanceDate": "2025-04-01T08:01:13.489Z",
    "issuer": "https://vc.sandbox-pod.datanutsbedrijf.be",
    "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://schema.inrupt.com/credentials/v2.jsonld",
        "https://w3id.org/security/data-integrity/v1",
        "https://w3id.org/vc-revocation-list-2020/v1",
        "https://w3id.org/vc/status-list/2021/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1"
    ]
}

claimToken.verifiableCredential.push(accessGrant)

console.log(Buffer.from(JSON.stringify(claimToken)).toString('base64'));