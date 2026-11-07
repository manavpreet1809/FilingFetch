# Stage 13: Retrieval report verification

Verified 2026-11-06 with synthetic fixtures. The CLI now uses a shared report writer. Reports retain request/source metadata, all five category counts, accepted-file hashes and validation evidence, skip reasons, warnings, and listing exhaustion. Version 1 adds a summary of selected-category document count, accepted files/bytes, cache hits, skipped entries and warnings. Document rows and attachment counts remain distinct.

Local accepted-file paths are omitted and the archive is recorded by basename. Existing reports are never overwritten. Tests round-trip report JSON and preserve original filenames, hashes, source metadata, empty-category evidence, rejection reasons and incomplete-listing warnings. A mocked source interruption after one accepted file verifies the actual retrieval-to-report path, including timeout warning and source cleanup.

Validation: all 92 tests passed; npm run check, npm run build and git diff --check passed. No live source, email or cloud acceptance is claimed. Exhaustion is not proof every attachment was accepted. Fatal errors before a FetchResult is returned still produce CLI diagnostics rather than a report; packaging failure also prevents a success report. Reports may contain public source titles and metadata and are not universal redaction tools.

Next: Stage 14 local document caching.
