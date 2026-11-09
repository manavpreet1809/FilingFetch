# Local verification — 2026-11-09

This record distinguishes implementation checks from external service acceptance. No real email was sent and no cloud resources were provisioned.

## Automated evidence

- 118 offline tests passed: retrieval, downloads, parsing, cache, archives, incoming MIME, inbox pagination, grounded extraction, HTTP and outgoing MIME.
- 11 PostgreSQL integration tests passed against a disposable localhost PostgreSQL 16 container. Coverage includes transactional history rollback, duplicate insertion constraints, job states, concurrent claims, expired lease recovery, mailbox isolation, dispatch versioning, failed enqueue, bounded failure retries, uncertain-send reconciliation and retention.
- One isolated Chromium regression passed, exercising real client navigation and modal controls against synthetic source markup.
- npm run check, npm run build, shell syntax checks and git diff --check passed.
- Production npm audit reported zero vulnerabilities after compatible lockfile updates. The checkout now has its own installed dependencies rather than a symlink into an older checkout.
- Migrations applied successfully and repeated without reapplying accepted files. The production image's compiled migration entrypoint also completed against the test database.
- The production Docker image built successfully. Its non-root user launched Chromium; /health returned 200, and /ready and /process rejected anonymous calls with 401. The smoke container was stopped afterward. These checks do not prove hosted Google identity verification or live Gmail readiness.

## New safeguards

Inbox cursor values and pagination progress are validated; partial page failure rolls back both job inserts and cursor advancement. Extraction can be tested without paid model calls and requires category/count evidence in the request. Workers claim only their configured mailbox and renew their lease at processing transitions. Endpoint payloads are validated before service initialization. Unknown send outcomes remain sending until reconciliation; retention preserves them.

Deployment now applies migrations before traffic moves. Local prerequisites can be checked without printing secret values. The CI workflow is configured, but its hosted result must be checked separately after push.

## External dependencies and release gates

The official Google Cloud CLI was installed temporarily, but auth list returned no active account and no project was selected. Deployment preflight identified missing project, agent mailbox, database URL, OpenAI key and OAuth client/token files. No deployed URL exists from this work.

Actual OpenAI extraction quality, Gmail authorization/delivery, GCS behavior, cloud IAM, watch notifications and queue redelivery still require controlled live acceptance. The prior live Exhibits recovery defect was diagnosed as a Close control rendered with role=button on a div; role-based visible-text selectors and the browser regression now cover this markup. The subsequent live run rejected oversized H-1 and accepted H-2 without warnings; independent disk/report/ZIP hashes and bytes matched. See [sanitized evidence](evidence/exhibits-recovery-2026-11-09.json). This resolves that observed recovery failure, not all possible source changes.
