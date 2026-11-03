# FilingFetch: 30-stage roadmap

This roadmap replaces the previous nine-commit plan. The existing implementation already contains code for many stages; each stage requires reviewing, testing, and recording evidence rather than rebuilding it. Existing Stage 1 tests are an initial baseline, not acceptance of the entire roadmap.

Stages are ordered by dependency, not assigned calendar days. The previous three-week window is a target only; live integrations and reliability work may require more time. Each stage should produce a focused commit when completed. No future work is claimed complete and no automatic runs are scheduled.

## Stage 01: Document the retrieval contract

Status: complete (documentation contract reviewed against current implementation). See [retrieval contract](retrieval-contract.md).

Work: Define the five categories, input formats, file limits, outputs, and CLI exit codes.

Acceptance: Examples cover valid, invalid, empty, and partial outcomes.

Suggested commit: `Document the retrieval contract`

## Stage 02: Validate CLI inputs

Status: complete. See [Stage 02 verification](stage-2.md).

Work: Handle unknown options, malformed matter numbers, categories, and limits without starting a browser.

Acceptance: Offline CLI tests return clear errors and nonzero exit codes.

Suggested commit: `Validate CLI inputs`

## Stage 03: Verify matter navigation

Status: planned.

Work: Confirm the requested matter opens and reject mismatched identifiers.

Acceptance: An observed live matter matches its official identifier and title; a mismatch fixture fails.

Suggested commit: `Verify matter navigation`

## Stage 04: Verify category counts

Status: planned.

Work: Parse all five source counts and detect missing or changed labels.

Acceptance: Fixtures cover zero, comma-separated counts, and malformed labels; live counts are compared.

Suggested commit: `Verify category counts`

## Stage 05: Verify document pagination

Status: planned.

Work: Traverse the virtualized list without omitting or repeating rows.

Acceptance: Multi-page fixtures and a live source comparison account for observed document rows.

Suggested commit: `Verify document pagination`

## Stage 06: Enforce public-document filtering

Status: planned.

Work: Skip explicitly restricted rows and define handling for blank security fields.

Acceptance: Tests demonstrate the chosen policy and report skipped rows.

Suggested commit: `Enforce public-document filtering`

## Stage 07: Verify attachment selection

Status: planned.

Work: Associate each attachment with its source row and detect changed dialogs.

Acceptance: Tests reject stale row identities and changed attachment lists.

Suggested commit: `Verify attachment selection`

## Stage 08: Constrain download sources

Status: planned.

Work: Allow only expected source origins and paths; reject unexpected redirects.

Acceptance: Tests reject off-origin URLs, disallowed paths, and redirect responses.

Suggested commit: `Constrain download sources`

## Stage 09: Bound downloads and timeouts

Status: planned.

Work: Enforce streamed byte limits and ensure timed-out downloads are cleaned up.

Acceptance: Tests cover oversized streams, stalled downloads, and temporary-file cleanup.

Suggested commit: `Bound downloads and timeouts`

## Stage 10: Validate file content

Status: planned.

Work: Check signatures, filename extensions, text encoding, and PDF readability.

Acceptance: Synthetic fixtures cover valid files, HTML responses, corrupt PDFs, empty files, and mismatches.

Suggested commit: `Validate file content`

## Stage 11: Prevent filename collisions

Status: planned.

Work: Sanitize unsafe names and preserve distinct files with colliding normalized names.

Acceptance: Tests prove paths stay inside the output directory and files cannot overwrite one another.

Suggested commit: `Prevent filename collisions`

## Stage 12: Verify ZIP packaging

Status: planned.

Work: Package only accepted files while respecting the total attachment budget.

Acceptance: Archive entries and bytes match accepted files; size-limit failures are explicit.

Suggested commit: `Verify ZIP packaging`

## Stage 13: Verify retrieval reports

Status: planned.

Work: Write source metadata, counts, file hashes, skipped reasons, and partial-result warnings.

Acceptance: Report assertions cover successful, empty, interrupted, and incomplete retrieval.

Suggested commit: `Verify retrieval reports`

## Stage 14: Verify local document caching

Status: planned.

Work: Validate manifests, TTL, fingerprints, and content hashes before cache reuse.

Acceptance: Tests cover hits, expiry, source changes, corruption, and fallback retrieval.

Suggested commit: `Verify local document caching`

## Stage 15: Record core retrieval acceptance

Status: planned.

Work: Run representative public-source retrievals and document source comparisons.

Acceptance: Sanitized evidence distinguishes live results from offline fixtures and remaining gaps.

Suggested commit: `Record core retrieval acceptance`

## Stage 16: Document Gmail OAuth setup

Status: planned.

Work: Explain scopes, callback configuration, token storage, and revocation.

Acceptance: Setup instructions match the code and keep credentials outside Git.

Suggested commit: `Document Gmail OAuth setup`

## Stage 17: Verify incoming email parsing

Status: planned.

Work: Parse MIME messages and filter self-generated, automated, and unsuitable messages.

Acceptance: Fixtures cover multipart messages, missing headers, and loop prevention.

Suggested commit: `Verify incoming email parsing`

## Stage 18: Verify inbox history synchronization

Status: planned.

Work: Test paging, expired history recovery, cursors, and duplicate message ingestion.

Acceptance: Mocked Gmail responses and database checks show cursor safety and no duplicate jobs.

Suggested commit: `Verify inbox history synchronization`

## Stage 19: Define AI extraction evaluation cases

Status: planned.

Work: Create labeled requests for categories, identifiers, counts, ambiguity, and missing fields.

Acceptance: A versioned synthetic dataset includes expected fields and clarification outcomes.

Suggested commit: `Define AI extraction evaluation cases`

## Stage 20: Evaluate extraction boundaries

Status: planned.

Work: Check quoted history, conflicting subjects, malicious instructions, and invented values.

Acceptance: Measured results identify failures and keep untrusted text from changing the extraction contract.

Suggested commit: `Evaluate extraction boundaries`

## Stage 21: Verify clarification replies

Status: planned.

Work: Explain missing or invalid fields while preserving correctly supplied information.

Acceptance: Fixtures produce actionable clarification text without attachments.

Suggested commit: `Verify clarification replies`

## Stage 22: Verify threaded email composition

Status: planned.

Work: Construct plain-text/HTML replies, MIME attachments, and threading headers.

Acceptance: Parsed synthetic outgoing messages contain correct recipients, headers, and ZIP attachments.

Suggested commit: `Verify threaded email composition`

## Stage 23: Verify controlled email delivery

Status: planned.

Work: Exercise a complete request and reply using an explicitly authorized test mailbox and recipient.

Acceptance: Sanitized evidence confirms same-thread delivery and expected file contents.

Suggested commit: `Verify controlled email delivery`

## Stage 24: Test job state transitions

Status: planned.

Work: Document and exercise pending, extracting, retrieving, packaging, sending, and terminal states.

Acceptance: Database integration tests verify transitions and persisted recovery information.

Suggested commit: `Test job state transitions`

## Stage 25: Test leases and concurrent claims

Status: planned.

Work: Verify ownership checks, expired leases, and duplicate worker invocations.

Acceptance: Concurrent test workers cannot independently process one active lease.

Suggested commit: `Test leases and concurrent claims`

## Stage 26: Test queue dispatch and retries

Status: planned.

Work: Exercise task creation failures, replayed events, dispatch versions, and attempt limits.

Acceptance: Integration tests show recoverable work is retried and terminal jobs stop.

Suggested commit: `Test queue dispatch and retries`

## Stage 27: Resolve uncertain email delivery

Status: planned.

Work: Check Sent mail after interrupted sends and define operator resolution steps.

Acceptance: Tests cover acknowledged, rejected, and uncertain sends without blind duplicate delivery.

Suggested commit: `Resolve uncertain email delivery`

## Stage 28: Verify cloud cache and retention

Status: planned.

Work: Test object integrity, cache expiry, cleanup, and database retention behavior.

Acceptance: Test resources demonstrate retention boundaries, including unresolved delivery records.

Suggested commit: `Verify cloud cache and retention`

## Stage 29: Verify deployment and operations

Status: planned.

Work: Validate configuration, service identities, endpoint authentication, monitoring, and shutdown.

Acceptance: An authorized deployment passes documented smoke checks and exposes actionable failure signals.

Suggested commit: `Verify deployment and operations`

## Stage 30: Publish release documentation and demo

Status: planned.

Work: Finish setup instructions, architecture diagram, verification results, limitations, and a sanitized walkthrough.

Acceptance: A fresh setup is reproducible and every public claim is supported by recorded evidence.

Suggested commit: `Publish release documentation and demo`

## Working rules

- Implement fixes and meaningful tests together; split oversized stages into reviewable commits when necessary.
- Run offline tests, type checks, and build for implementation changes.
- Use synthetic fixtures in Git; exclude credentials, personal email, source downloads, and generated artifacts.
- Obtain explicit authorization for live email recipients and cloud changes that are not already authorized.
- Record actual verification results, dates, limitations, and failures before marking a stage complete.
- Preserve existing Git history and use actual completion dates.
