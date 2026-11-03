# Stage 01: Retrieval contract

This document describes the current CLI contract, reviewed against `src/cli.ts`, `src/domain.ts`, `src/config.ts`, `src/fetch.ts`, and `src/files/zip.ts`. It does not certify live UARB website compatibility.

## Inputs

```sh
npm run fetch -- M12205 "Other Documents" --limit 2 --output outputs/example
```

Exactly two positional arguments are required: a matter number and document category. Matter numbers are trimmed and uppercased, then must match `M` followed by exactly five digits. Categories are case-sensitive and must be one of:

- Exhibits
- Key Documents
- Other Documents
- Transcripts
- Recordings

`--limit` accepts the decimal strings `1` through `10` and defaults to `10`. Scientific notation, hexadecimal, fractions, blank values, and leading-zero forms are rejected. The limit counts accepted files, not document rows; one row may have multiple attachments. `--headed` displays the browser. `--output` requires a nonblank directory path and selects an output directory; otherwise a directory is generated under `outputs/` using the matter number and a random suffix. Use a fresh directory because report and archive writes do not overwrite existing files.

## Configuration and limits

Node.js 22 or newer, installed npm dependencies, and Playwright Chromium are required. For standalone retrieval, unset `DATABASE_URL` and set `CACHE_BACKEND=off`; Gmail, OpenAI, PostgreSQL, and Google Cloud credentials are then unnecessary.

Defaults are 20,000,000 bytes per file and for the final ZIP, a 30-second browser-step timeout, a 60-second download timeout, and a 600-second retrieval timeout. Environment settings can change these within the bounds defined in `src/config.ts`. Retrieval reserves 4,096 bytes of the total budget for archive overhead; the actual ZIP is checked again before publication.

## Retrieval behavior

The requested matter identifier must match the returned matter. The report includes counts for all five categories. Retrieval traverses the selected category, deduplicates observed document identifiers, and accepts validated files up to the requested limit. Explicit non-public security labels are skipped. A blank security field currently does not trigger that filter; this policy still requires Stage 06 review.

Downloads must come from the expected UARB connector origin/path. Invalid, oversized, or failed attachments are skipped with reasons when recovery is possible. An unexpected page or unrecoverable source error fails the command. A retrieval timeout after matter metadata is available can return a partial result with a warning.

## Outputs

The output directory contains:

- `files/`: downloaded files; this directory may also retain rejected or unselected artifacts, so use the report's accepted-file list rather than treating every file as accepted.
- `report.json`: request, matter metadata, category counts, accepted-file metadata and SHA-256 hashes, skipped reasons, warnings, listing-exhaustion status, and the archive filename or null.
- A ZIP named from the matter number and document category when at least one file is accepted. Only accepted files are packaged.

The console prints a summary with downloaded-file and cache-hit counts, skipped count, warnings, and output paths. Failure diagnostics may include `files/failure.png`; diagnostic artifacts are not acceptance evidence by themselves.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Retrieval/report generation completed without a fatal error and without the empty-nonzero-category condition. This can include partial results, warnings, skipped files, or a genuinely empty category. |
| 1 | Invalid CLI/configuration, unrecoverable retrieval failure, or report/archive failure. |
| 2 | The selected category reports documents, but no accepted files were retrieved. |

A zero exit code does not prove completeness. Review warnings, skipped entries, and `listingExhausted`. Reaching the requested file limit normally stops enumeration before exhaustion.

## Outcome examples

These are contract examples, not claims of observed source results.

| Scenario | Expected result |
|---|---|
| `M12205 "Other Documents" --limit 2` with two valid attachments available | Report and ZIP with up to two accepted files; exit 0. |
| `M123 "Exhibits"` | Invalid matter number; no retrieval; exit 1. |
| `M12205 "Other"` | Unsupported category; no retrieval; exit 1. |
| `M12205 "Exhibits" --limit 0` | Invalid file limit; no retrieval; exit 1. |
| Requested category count is zero | Empty accepted-file list, null archive, exhausted listing; exit 0. |
| Category count is positive, but every download is rejected | Report with reasons, null archive; exit 2. |
| One valid file followed by a retrieval timeout | Partial report and ZIP when packaging succeeds, timeout warning; exit 0. |
| Source returns a different matter identifier | Retrieval fails before accepting files; exit 1. |

## Stage acceptance

Stage 01 is complete as a documentation milestone: the five categories, input formats, limits, output structure, exit codes, and valid/invalid/empty/partial examples are defined against the current source. Live source verification, exhaustive input tests, security-label policy, and artifact cleanup remain assigned to later stages.
