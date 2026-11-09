# Stage 15: Core retrieval acceptance evidence

Recorded 2026-11-07 against the official public database at https://uarb.novascotia.ca/fmi/webd/UARB15. Sanitized machine-readable results are in [the evidence record](evidence/retrieval-2026-11-07.json). Public downloaded bytes, screenshots and full generated reports remain outside Git.

## Source comparison and fixes

A separate browser inspection confirmed M12205, the Halifax Regional Water Commission Windsor Street Exchange project, and all five displayed counts: Exhibits 13, Key Documents 6, Other Documents 44, Transcripts 0, Recordings 0. These match the generated reports and the November 2 observation. This verifies this snapshot, not permanent source stability.

The initial run failed because the required Playwright browser was missing. After installing the declared runtime with npm run browser:install, navigation still failed: source buttons exposed aria-label="undefined" even though their visible captions were correct. The client now selects button elements by visible text for category and attachment controls. Strict locators still reject ambiguous matches. A synthetic isolated browser regression exercises the actual client navigation, document selection, attachment dialog and closing with these malformed accessible labels. It does not contact the public source.

## Live cases

All runs used CACHE_BACKEND=off, an empty DATABASE_URL, JOB_TIMEOUT_MS=90000, STEP_TIMEOUT_MS=15000, the default 20,000,000-byte limits and --limit 1. No email or cloud writes occurred.

| Category | Result |
| --- | --- |
| Key Documents | Exit 0, one PDF (document 97289, Notice of Paper Hearing), 119,742 bytes, parsed successfully, no skips/warnings. Disk size/hash and ZIP entry names/bytes independently matched the report. |
| Transcripts | Exit 0, source count 0, empty report, null archive, no ZIP on disk and no warnings. |
| Exhibits | Exit 2, no accepted files, 12 skipped entries: one oversized file, six restricted rows and five dialog failures. Job timeout warning, listing not exhausted and no archive. |

To reproduce, install dependencies and browser, then use a fresh output directory per case:

```sh
CACHE_BACKEND=off DATABASE_URL= JOB_TIMEOUT_MS=90000 STEP_TIMEOUT_MS=15000 npm run fetch -- M12205 "Key Documents" --limit 1 --output outputs/live-key
```

Change the category and output for the other cases. Public data can change; this is observed evidence, not a pinned source fixture or a guarantee of identical future counts.

## Checks and remaining gaps

All 97 offline tests, one isolated browser regression (npm run test:browser), npm run check, npm run build and git diff --check passed. The browser regression requires npm run browser:install; ordinary npm test does not require a browser binary.

This stage records successful and unsuccessful live acceptance evidence. It does not claim broad operational readiness. Exhibits dialog failures remain unresolved; the evidence does not identify their root cause. Full multi-window live enumeration, every category, all attachments, large successful files, cache-enabled live retrieval and email delivery remain unverified. listingExhausted describes observed rows, not acceptance of all attachments: the six Key Documents rows were visible but only one file was requested. No restricted attachment content was accessed or committed.

Next: Stage 16 Gmail OAuth setup documentation; retain the live Exhibits limitation in release claims.

## Follow-up: 2026-11-09

The modal Close control was observed to be a div with role=button. Restricting the selector to button tags left the previous attachment modal open. The client now combines the button role with visible-text filtering, retaining support for category buttons whose accessible label is undefined. The browser regression asserts that the modal becomes hidden and that cleanup is safe after closing the browser.

A live Exhibits request then rejected oversized H-1 and accepted H-2 without warnings. Independent disk/report/ZIP entry, byte and hash checks passed. See [sanitized follow-up evidence](evidence/exhibits-recovery-2026-11-09.json). The earlier failed run remains part of the historical record; broad source coverage and live email acceptance are still not claimed.
