# Deployment and operations

Status on 2026-11-09: locally verified implementation; cloud deployment has not occurred. No production URL or live email acceptance is claimed. The target cloud project, agent mailbox and credentials are not configured in this checkout.

## Architecture

Gmail push → authenticated Cloud Run /inbox → PostgreSQL cursor/job transaction → Cloud Tasks → authenticated /process → bounded public retrieval → validated ZIP → threaded Gmail reply. Scheduler calls /maintain to renew the Gmail watch, recover pending work and remove expired records. GCS stores content-addressed public files; Secret Manager supplies credentials. OpenAI extraction runs with store:false, followed by source-text validation before retrieval. The service stays private; it is an email agent, not a public web interface.

## Prerequisites

Use a dedicated Gmail account, a chosen Google Cloud project with billing and deployment permissions, a TLS PostgreSQL connection, an OpenAI API key, and an authenticated Google Cloud CLI. The Gmail OAuth client and Gmail Pub/Sub topic must belong to the same project. Confirm intended region and resource costs before provisioning. Google Cloud is the existing implementation target; do not deploy this browser/queue workload as a static site.

Set the identifiers and credential paths described in [Gmail setup](stage-16.md), plus GOOGLE_CLOUD_PROJECT, REGION (default us-east1), DATABASE_URL and OPENAI_API_KEY in a private ignored .env. Never commit values. For a custom CLI path, set GCLOUD. `node scripts/deployment-check.mjs` reports missing setting names without exposing their values. This checks local presence, not remote authorization or credential validity. The deploy shell scripts require exported identifiers; dotenv loading in Node does not export settings to your shell.

Enable Secret Manager first using gcloud for the chosen project. Then run `node scripts/secrets.mjs` to create/version the four filingfetch secrets. Run `bash scripts/setup-cloud.sh` to provision the declared APIs, service accounts, artifact repository, private buckets, topic, queue and IAM bindings. Setup assumes the secrets already exist. It applies a two-day object lifecycle to the application's documents/build buckets and disables their soft-delete policy; do not point it at unrelated existing buckets. Review scripts before using them in a shared project.

Run all checks below and commit a reviewable revision. `bash scripts/deploy.sh` builds that revision, deploys and executes a one-off migration job, creates a private revision without traffic, configures its stable audience URL, then moves traffic. Migration failure stops the script before traffic moves. It then configures Pub/Sub and Scheduler and triggers maintenance. That final trigger activates watch/sync/dispatch and can process pending jobs: perform controlled mailbox/recipient acceptance before opening the mailbox to requests. A successful shell invocation alone does not establish live email correctness.

This deployment sequence follows the existing application design and [Cloud Run deployment](https://cloud.google.com/run/docs/deploying), [job execution](https://cloud.google.com/run/docs/execute/jobs) and [Gmail push setup](https://developers.google.com/workspace/gmail/api/guides/push) documentation. Cloud commands, IAM and hosted resources still require live verification.

## Verification commands

```sh
npm ci
npm run check
npm test
npm run browser:install
npm run test:browser
npm run build
npm audit --omit=dev --audit-level=moderate
bash -n scripts/deploy.sh scripts/setup-cloud.sh
```

Database tests require a disposable localhost PostgreSQL database whose name starts with filingfetch_test. Set TEST_DATABASE_URL and run `npm run test:integration`. Tests create unique schemas and remove only those schemas. Never point tests at production. They mock Gmail, model inference, source retrieval and Cloud Tasks; SMTP/API delivery is not performed. Run migrations twice against the test database to verify repeat application.

Build the image with `docker build -t filingfetch:local .`. The runtime is Node 22, non-root, with Chromium and required libraries. Production dependencies are locked; the image excludes tokens, local data and tests. Build locally and in Cloud Build rather than assuming a host-native build proves Cloud Run architecture compatibility.

## Readiness and smoke checks

/health is process liveness and performs no provider calls. /ready requires the configured caller identity, checks PostgreSQL and initializes the Gmail profile-verified client. POST /inbox, /process and /maintain require a verified Google ID token whose audience is SERVICE_URL and whose email is CALLER_SERVICE_ACCOUNT. Invalid bodies are rejected before provider initialization. Cloud Run IAM also restricts invocation.

After deployment verify: revision readiness, authenticated /ready, anonymous rejection, successful migration execution, Scheduler invocation, Gmail watch expiry, inbox cursor advancement, authenticated task creation and worker logs. Then authorize a specific test sender/recipient and verify an actual same-thread reply with matching ZIP hashes. Do not mark the release complete before that evidence exists. The oversized Exhibits recovery fix now has live evidence; broader source coverage remains limited; see [verification status](release-status.md).

## Recovery and retention

Logs use event names and job identifiers, without raw email bodies or credentials. Watch for request_failed, job_failed and delivery_uncertain; configure alerting on persistent 5xx, overdue cursors, queue backlog and delivery uncertainty before unattended use. This repository does not claim those alerts are already provisioned.

A job in sending may already have delivered. The worker searches Sent mail using its job marker/thread and message ID. If found it completes without sending again; otherwise it remains sending for investigation. Do not manually set it pending until the mailbox owner verifies non-delivery. Terminal jobs older than 30 days are removed; sending and active jobs are preserved. GCS lifecycle policy, OAuth revocation, retention in provider backups and live IAM must be verified independently.

To stop processing, pause the Scheduler job and Cloud Tasks queue and suspend the push subscription delivery before changing credentials. To roll back application code, direct Cloud Run traffic to the previous verified revision; migrations are forward-only and are not undone by traffic rollback. Back up production PostgreSQL before schema changes. Remove task-created resources only after deciding how to retain unresolved delivery records and provider data.
