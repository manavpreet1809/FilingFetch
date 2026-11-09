# Release status

As of 2026-11-09, implementation and local verification have progressed; the project is not complete or deployed. The original roadmap remains an evidence checklist, not a count of implemented files. Existing code for later stages is not equivalent to live acceptance.

| Area | Evidence | Remaining requirement |
| --- | --- | --- |
| Retrieval (1–15) | Synthetic tests, browser regression, one live Key Documents PDF, empty Transcripts case, partial Exhibits case and successful H-1 rejection → H-2 recovery | Broader live categories/pagination |
| OAuth and incoming MIME (16–17) | Setup guide and synthetic MIME filtering tests | Configure the dedicated account and verify its live grant |
| Inbox history (18) | Mock paging/expiry tests and actual PostgreSQL duplicate-safe insert/rollback tests | Hosted watch and mailbox synchronization |
| Extraction (19–20) | Labeled synthetic cases in tests/extraction.test.ts; injected model responses verify grounding, count bounds, ambiguity and quoted-history behavior | Versioned live model evaluation; no accuracy percentage claimed |
| Clarification and MIME (21–22) | HTML escaping, missing-field wording, threading, reply-loop markers and ZIP attachment tests | Actual mailbox appearance and recipient acceptance |
| Delivery (23) | No actual mail sent | Explicit test recipient, valid OAuth grant and same-thread live delivery evidence |
| Jobs and recovery (24–27) | PostgreSQL migrations, duplicate constraints, states, concurrent leases, mailbox isolation, enqueue versioning, retries and uncertain-send reconciliation with mocked providers | Hosted queue replay and ambiguous real-send operations |
| Retention (28) | Local cache tests and PostgreSQL terminal-record retention preserving active/uncertain jobs | Real GCS lifecycle, object integrity and hosted retention |
| Deployment (29) | Container build, shell checks and HTTP tests; secret-safe prerequisite checker | Authenticated target project, required secrets, IAM and cloud smoke checks |
| Release (30) | Updated architecture, setup and operations documentation | Live demonstration and final acceptance evidence |

## Required configuration

No Google Cloud account or project is currently selected in the local CLI. This checkout has no configured GOOGLE_CLOUD_PROJECT, AGENT_EMAIL, DATABASE_URL, OPENAI_API_KEY or Gmail OAuth client/token files. The official Cloud CLI was installed into a temporary task directory. Choose the project and dedicated mailbox, then configure credentials privately using the deployment guide. Do not post secrets in chat.

The service must not be represented as deployed until a verified Cloud Run URL, readiness check and authorized live email acceptance are recorded. No cloud resources or live email changes were made in this work.
