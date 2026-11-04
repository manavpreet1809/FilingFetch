# Stage 09: Bounded downloads and timeouts

Verified November 3, 2026. Transfers now stream into a unique sibling .part file
opened exclusively. Only a completed, in-limit transfer is renamed to its output
path. Failure cleanup removes temporary bytes; an earlier completed output is
preserved when a later attempt fails. Successful filename-collision policy remains
Stage 11 work.

The byte cap checks declared content length, actual streamed bytes even without
an honest length header, and the existing RIFF/WAVE declared-size field, including
headers split across chunks. Malformed content lengths are rejected. The transfer
deadline covers response headers and body streaming. Browser event-start waiting
has its own existing timeout; these are separately bounded phases, not a claim
that an entire attempt finishes in one transfer-timeout interval. The job abort
signal cancels active network streaming when the retrieval deadline or close is
reached. Platform-overflowing download timeout configuration is rejected.

75 tests, type checks, build and diff checks pass. Synthetic fetch responses use
real streams and temporary filesystem output to cover exact-limit success,
missing/understated/oversized/malformed lengths, split WAV headers, stalled
headers and bodies, interrupted streams, HTTP/absent-body errors, filesystem
failure, already-aborted work and cancellation preserving a known-good file.
No public filings, credentials, cloud resources or live email were required.
Content validation and archive acceptance are separate later milestones.
