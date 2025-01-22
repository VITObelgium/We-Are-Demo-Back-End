# Introduction

## We Are Project and We Are Platform

The We Are partnership, consisting of the Flemish Institute for Technological Research (VITO) – Flemish Patients' Platform (VPP) – Domus Medica (DM) – Zorgnet Icuro (ZI), is committed to enabling the ethical and safe reuse of personal health data for both public and private purposes, with the citizen at the center. The project collaborates closely with Athumi, the provider of the [SOLID](https://solidproject.org/TR/) data vault system in Flanders. This system allows citizens to securely store their data in vaults and share it with third parties based on consent. This project was made possible thanks to the European recovery fund; the Department of Economy, Science & Innovation; the Department of Care & the Department of Digital Flanders. More information at [www.we-are-health.be](https://www.we-are-health.be).

## What
This is the We Are Demo Back-End project to showcase an example implementation on the We Are platform. This back end is using 2 We Are libraries to make the flow of interacting with Solid pods easy: ```We Are Core```, which is responsible for interaction with the pod and the Solid OIDC flow and ```We Are Expressjs```, which is a middleware library that can be attached to Expressjs applications to take care of these interactions automatically.

# Setup

Run `npm install` to install all dependencies for the project.

Before running this application, please copy the .env.example file to a new .env file. We Are using DotEnv to provide the environment variables for the application to run.  
Acquire your credentials from your VITO NV - We Are contact person. Environment variables you need to acquire are:
- WEARE_OIDC_CLIENT_ID
- WEARE_OIDC_CLIENT_SECRET
- CITIZEN_OIDC_CLIENT_ID
- CITIZEN_OIDC_CLIENT_SECRET

Before retrieving these credentials you will need to enroll with both We Are & ACM/IDM.

After you have acquired the credentials and saving them to the .env file, you can run the application with the following command:
```
npm run start
```
No build is required.

# Included services

## Authentication endpoints

We identify the following authentication endpoints described below in the We Are Backend. Those endpoints are called from the We Are Frontend application or via redirects back as part of the OIDC flow.

### login

The login endpoint takes care of creating a new Solid Session and defining where the session should be stored. This can be passed as parameter and which is defined globally in our case via ```globalThis.solidStorage```. The storage is initialized in ```global-initialize.ts``` as follows: ```globalThis.solidStorage = new InMemoryStorage();```. This means in this case we will keep the session of the user in memory and the session is not persisted. You can also choose to use persistent storage by defining it here. Another option is to store the session in the cookie of the Front End session. That way you can keep your backend stateless, which is an advantage for scaling.

The login code can be found here:

```
app.get("/login", (req, res, next) => {
    log.debug(`Endpoint GET /login called.`);
    next();
  }, async (req, res, next) => {
    try {
      const session = new Session( {storage: globalThis.solidStorage!, keepAlive: false});
      req.session.solidSid = session.info.sessionId;

      if (req.query.redirectUrl) req.session.redirectUrl = (new URL(req.query.redirectUrl as string)).href;

      await globalThis.oidcService.login(session, (url: string) => {
        // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
        const loginUrl = new URL(url);
        let scope = loginUrl.searchParams.get('scope');
        if (scope)
          scope += " rrn";
        else
          scope = "rrn";
        loginUrl.searchParams.set('scope', scope);

        if(req.query.switchIdentity) {
          // Static string to switch identity, see https://vlaamseoverheid.atlassian.net/wiki/spaces/IKPubliek/pages/6336381158/Wisselen+van+account+doelgroepen
          loginUrl.searchParams.set('login_hint', 'eyJzd2l0Y2hfaWQiOiB0cnVlfQ==');
        }

        res.redirect(loginUrl.href);
      });
    } catch (error) {
      // A general error catcher which will, in turn, call the ExpressJS error handler.
      next(error);
    }
  });
```
Also note that a workaround needs to be implemented to add the extra scope parameter to include the ```rrn``` during the login protocol. The login protocol is triggered via the ```OidcService``` of the We Are Core library.

### logout

The remove the user's session from memory and delete all access grants that are present, the following logic is called:

```
  app.get("/logout", (req, res, next) => {
      log.debug(`Endpoint GET /logout called.`);
      next();
    }, getSession.bind({storage: globalThis.solidStorage}), async (req, res, next) => {
      try {
        log.debug(`[GET /logout] Log out for Web ID [${res.locals.session.info.webId}]`);
        await res.locals.session.logout();

        delete req.session.accessGrant;
        delete req.session.accessGrantExpirationDate;
        delete req.session.pods;
        delete req.session.locale;
        delete req.session.workaroundActive;

        const successUrl = new URL(globalThis.frontendUrl);
        successUrl.searchParams.set("logout", "success");
        res.redirect(successUrl.href);
      } catch (error: any) {
        const errorUrl = new URL(globalThis.frontendUrl);
        errorUrl.searchParams.set("logout", "error");
        res.redirect(errorUrl.href);
      }
    }
  );
```

After cleanup, the user is redirected back the the frontend and a ```logout``` parameter is set.

### oidc-redirect

This endpoint is called in the final phase of the OIDC Authentication flow. The user is directed back to the ```oidc-redirect``` endpoint to exchange the authorization code for an access token. All this happens behind the scene via the Inrupt SDK: 

```            
await res.locals.session!.handleIncomingRedirect(fullUrl);
```

When successful, the user is directed back to the front end application with an extra parameter ```login=success```

```
    if(req.session.redirectUrl) {
        const successUrl = new URL(req.session.redirectUrl);
        successUrl.searchParams.set('login', 'success');
        res.redirect(successUrl.href);
        delete req.session.redirectUrl;
    } 
```

Note also here exists a temporary workaround in the case that the user does not have a webId and pod yet:

```
if (error.message.startsWith("The token has no 'webid' claim")) {
              req.session.workaroundActive = "create_web_id";
              await globalThis.oidcService.login(res.locals.session!, (url: string) => {
                // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
                const loginUrl = new URL(url);
                let scope = loginUrl.searchParams.get('scope');
                if (scope)
                  scope += " rrn";
                else
                  scope = "rrn";
                loginUrl.searchParams.set('scope', scope);

                res.redirect(loginUrl.href);
              });
              return; // Login redirects the user away from the application.
            }

            throw error;
          }
        } else if (req.session.workaroundActive === "create_web_id") {
          const solidSession = JSON.parse((await globalThis.solidStorage.get(`solidClientAuthenticationUser:${req.session.solidSid}`))!);
          const codeVerifier = solidSession.codeVerifier
          const data = await globalThis.oidcService.getToken(req.query.code as string, codeVerifier, req.query.state as string)
          const idToken = data.id_token;
          await globalThis.athumiService.provisionWebId(idToken);
          delete req.session.workaroundActive;
          await globalThis.oidcService.login(res.locals.session!, (url: string) => {
            // In this case also switch identity to refresh the session to include the provided web id.
            // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
            const loginUrl =  new URL(url);
            let scope = loginUrl.searchParams.get('scope');
            if(scope)
              scope += " rrn";
            else
              scope = "rrn";
            loginUrl.searchParams.set('scope', scope);

            // Static string to switch identity, see https://vlaamseoverheid.atlassian.net/wiki/spaces/IKPubliek/pages/6336381158/Wisselen+van+account+doelgroepen
            loginUrl.searchParams.set('login_hint', 'eyJzd2l0Y2hfaWQiOiB0cnVlfQ==');

            res.redirect(loginUrl.href);
          });
        } else if(req.session.workaroundActive == 'delete_pod') {

        }
```

Basically what happens is a new login is triggered, but the state of the session is set to ```create_web_id```. Next pass this will be handled by calling the ```provisionWebId``` service of Athumi as seen in the code below:

```
          const solidSession = JSON.parse((await globalThis.solidStorage.get(`solidClientAuthenticationUser:${req.session.solidSid}`))!);
          const codeVerifier = solidSession.codeVerifier
          const data = await globalThis.oidcService.getToken(req.query.code as string, codeVerifier, req.query.state as string)
          const idToken = data.id_token;
          await globalThis.athumiService.provisionWebId(idToken);
          delete req.session.workaroundActive;
          await globalThis.oidcService.login(res.locals.session!, (url: string) => {
            // In this case also switch identity to refresh the session to include the provided web id.
            // Todo: workaround for adding scopes to OAuth flow, should be provided by Inrupt SDK.
            const loginUrl =  new URL(url);
            let scope = loginUrl.searchParams.get('scope');
            if(scope)
              scope += " rrn";
            else
              scope = "rrn";
            loginUrl.searchParams.set('scope', scope);

            // Static string to switch identity, see https://vlaamseoverheid.atlassian.net/wiki/spaces/IKPubliek/pages/6336381158/Wisselen+van+account+doelgroepen
            loginUrl.searchParams.set('login_hint', 'eyJzd2l0Y2hfaWQiOiB0cnVlfQ==');

            res.redirect(loginUrl.href);
```

Then a next login pass will happen and the user will be authenticated.

## Session endpoints

The ```session-endpoints.ts``` file contains logic to get information of the user that is logged in. The following information will be fetched and returned:

```
 sessionInformation: {
          isLoggedIn: boolean;
          expirationDate?: string;
          accessGrantId?: string;
          accessGrantExpirationDate?: string;
          webId?: string;
          pods?: string[];
        }
```

## VC endpoints

The ```vc-endpoints.ts``` contains 2 exported functions related to handling [verifiable credentials]().

### access-request

The post endpoint ```access-request``` calls the ```issueAccessRequest``` function of the We Are Core library. The result will be an [AccesRequest](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-access-grants/modules/gConsent.html#accessrequest) object. This will be sent to the Front End. The Front End should use this to redirect the user to the We Are Consent Management application.

### access-grant

The post endpoint ```access-grant``` calls the function ```fetchAccessGrant``` from the We Are Core library. The result of the function will be an [AccessGrant](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-access-grants/modules/gConsent.html#accessgrant) with which the We Are Demo Backend application can read and write to the pod.

## Pod endpoints

In the ```pod-endpoints.ts``` file there are 2 endpoints defined: ```read``` and ```write```.

### read

If we look at the read code:

```
 app.get("/read", async (req, res, next) => {
    log.debug("Endpoint '/read' called");
    next();
  }, getSession.bind({ storage: globalThis.solidStorage }), validateAccessGrant, getResource.bind({ resourceUrlParameterKey: "resourceUrl", podService: globalThis.podService }), async (req, res, next) => {
    const turtle = await solidDatasetAsTurtle(res.locals.solidDataset);
    res.send(turtle);
  });
```

We see the use of the middlewares of the We Are Expressjs library. Basically what is happening is that when a user is authenticated, and a valid access grant exists, a resource is fetched from resourceUrlParameterKey via the podService. The resource is passed to the current context via res.locals.solidDataset. In our example we parse the turtle and send it back to the requestor.

### write

The ```write``` endpoint also makes use of the We Are Expressjs library to write an RDF resource to the pod. This is done via the writeResource functionality. The resource itself is passed to the post in the body of the request.

```
  app.post("/write", async (req, res, next) => {
    log.debug("Endpoint '/write' called");
    next();
  }, getSession.bind({ storage: globalThis.solidStorage }), validateAccessGrant, writeResource.bind({ resourceUrlParameterKey: "resourceUrl", podService: globalThis.podService! }), async (req, res, next) => {
    res.send("Resource created");
  });
}
```