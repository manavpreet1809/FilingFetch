# Stage 16: Gmail OAuth setup

Reviewed 2026-11-07 against src/gmail/authorize.ts and src/gmail/client.ts. This documents the local helper; no account was authorized and no mail was sent during this stage.

## Configure the agent mailbox

Enable the Gmail API in the Google project. Configure the consent audience and, if using a testing audience, include the intended agent account. Create a Web application OAuth client and register exactly `http://localhost:3000/oauth2callback`. Download its JSON privately to `secrets/google-oauth.json` or another protected path. The helper accepts a web or installed JSON object but requires its redirect_uris array to contain the exact configured callback. The Web client setup is the documented route.

The helper requests exactly these scopes:

| Scope | Use in FilingFetch |
| --- | --- |
| https://www.googleapis.com/auth/gmail.readonly | Read messages, history and mailbox profile; reconcile sent replies. |
| https://www.googleapis.com/auth/gmail.send | Send generated replies. |

Google classifies readonly as restricted and send as sensitive. Production distribution may require verification; this guide does not establish approval. See [Google's scope definitions](https://developers.google.com/workspace/gmail/api/auth/scopes).

Create a local, ignored `.env` with these settings, substituting the real dedicated mailbox:

```dotenv
AGENT_EMAIL=agent@example.com
GOOGLE_OAUTH_CREDENTIALS_PATH=secrets/google-oauth.json
GOOGLE_OAUTH_TOKEN_PATH=secrets/google-token.json
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
```

These paths are relative to the working directory. Keep the same settings for authorization and service startup. The credential JSON needs client_id, client_secret and redirect_uris. Do not paste secrets into chat, documentation, issue reports or commands recorded in shell history.

Run `npm run gmail:authorize` locally. Open the printed, temporary loopback link, select the configured account, and approve both permissions. The server binds 127.0.0.1 and expires after 15 minutes. A custom callback must use HTTP localhost or 127.0.0.1, an explicit port, and an exactly registered URI. Avoid query strings/fragments. An occupied port requires stopping its owner or registering and configuring a different callback.

## What the helper checks and saves

It uses random state and an S256 PKCE challenge, requests offline access, exchanges the authorization code, requires a refresh token and both scopes, refreshes once, then checks Gmail profile against AGENT_EMAIL. The helper ignores case and dots for gmail.com when comparing accounts; it does not implement every alias equivalence supported by the runtime client. Use the account's canonical address consistently.

Only after those checks does it write a temporary token file with mode 0600 and rename it into the configured token path. Newly created directories use mode 0700; existing directory permissions are not tightened automatically. A successful authorization replaces an existing token file at that path. The JSON includes the refresh token, access token, expiry and verified email address. Runtime uses the refresh token with google-auth-library and independently rechecks the mailbox profile. This authorization helper performs no send operation. Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) explains redirects, refresh and revocation.

## Recovery and revocation

A denied consent, wrong mailbox, missing refresh token, missing scope or failed profile request requires restarting the helper after resolving the reported cause. Invalid callback state is rejected. Do not bypass account or scope checks. For revoked/expired refresh credentials, authorize again; do not commit replacement tokens. Workspace policy or consent-audience restrictions may require an account administrator.

To disconnect, stop service workers, remove the application's access from the Google account's third-party connections, and delete local token copies and any deployed secret copies. Deleting a local JSON alone does not revoke Google's grant. Revoke and replace exposed credentials before resuming service. Revocation was documented, not executed.

The existing Git rules ignore secrets/, .env, .env.* and common credential/token filenames. Custom credential paths outside these patterns must stay outside the repository. Review `git status --short` and `git diff --cached` before commits; ignore rules cannot protect already tracked secrets.

## Verification and limits

Checked scope strings, script name, callback defaults, required JSON fields, environment names, token file modes, refresh/profile checks and Git exclusions against the implementation. Documentation consistency and git diff --check passed. No OAuth token, mailbox content or live permission changes were needed. This is setup documentation, not an OAuth security audit or a claim of working live Gmail delivery.

Next: Stage 17 synthetic incoming MIME parsing and filtering tests.
