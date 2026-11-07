# Stage 14: Local cache verification

Verified 2026-11-07 with temporary synthetic files. Cache manifests now require valid finite expiry dates and typed file metadata. Restore checks source fingerprint, expiry, document ID, object-key/hash agreement, filename, byte size and independently recalculated hash. Invalid manifests fail closed; fetchDocuments falls back to the source and records a warning.

If any selected cached file fails, restore removes earlier files published by that call and all temporary copies. Existing unrelated output files remain protected by collision-safe publication. A valid limited restore returns only the requested count; unselected cache objects are checked when requested.

All 97 tests passed, including hits, expiry, changed source, invalid expiry/keys/metadata, corruption of a later file, missing objects, malformed JSON, cleanup and source fallback. npm run check, npm run build and git diff --check passed. GCS and PostgreSQL paths are not accepted by these local tests. Cache directories are assumed to be locally trusted; this is not protection against hostile concurrent filesystem replacement. No live email or cloud writes were performed.

Next: Stage 15 public-source retrieval acceptance.
