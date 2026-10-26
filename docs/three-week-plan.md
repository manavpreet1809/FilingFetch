# Three weeks of commits

Target window: October 26–November 15, 2026. Dates are planning targets; commits record when work is actually completed. Existing history is preserved. This plan does not schedule automatic runs.

## Week 1 — October 26–November 1: Retrieval and file correctness

1. `Verify live UARB retrieval and pagination`
   - Run the CLI against public records, compare matter metadata and all category counts, and verify pagination.
   - Record commands, observed results, limitations, and any required selector fixes. Do not commit downloaded source documents or session data.
2. `Test corrupt downloads and attachment size limits`
   - Add fixtures for empty files, HTML responses, invalid PDFs, type mismatches, and file/total size limits.
   - Verify that invalid downloads are skipped with useful reasons.
3. `Verify ZIP contents and retrieval reports`
   - Check archive contents against accepted files, filename collisions, and attachment budgets.
   - Document partial, empty, and successful retrieval outcomes.

## Week 2 — November 2–8: Email and AI requests

4. `Test Gmail thread handling and message filtering`
   - Verify incoming-message filtering, reply headers, threading, and duplicate message ingestion with mocked Gmail responses.
5. `Evaluate request extraction and clarification cases`
   - Build labeled cases for missing fields, multiple requests, invalid identifiers/counts, quoted history, and instruction injection.
   - Record measured results and provider/model details; keep offline regression checks independent of API credentials.
6. `Verify end-to-end email document delivery`
   - Use an explicitly authorized test mailbox and recipient to verify request, retrieval, ZIP, and same-thread reply.
   - Record sanitized evidence and outstanding integration limitations.

## Week 3 — November 9–15: Reliability and release

7. `Test job leases and duplicate event handling`
   - Verify concurrent claims, lease expiry, dispatch failures, and replayed notifications using a test database.
8. `Test retries and uncertain delivery recovery`
   - Simulate failures before sending, after sending, and before database acknowledgment.
   - Document an operator procedure for resolving uncertain delivery without duplicate replies.
9. `Document deployment and publish demo walkthrough`
   - Document configuration, credentials, architecture, deployment, monitoring, and recovery.
   - Verify cloud deployment only with authorized resources; record the actual result and produce a sanitized walkthrough.

## Completion rules

- Commit completed, reviewable changes with relevant checks; move target dates when necessary.
- Run offline tests, type checks, and build for implementation changes; investigate failures before pushing.
- Keep secrets, personal email content, downloaded documents, and generated artifacts out of Git.
- Distinguish implemented behavior, offline verification, and live acceptance in documentation.
- A plan entry is not evidence of completion. No implementation or verification is claimed until performed.
