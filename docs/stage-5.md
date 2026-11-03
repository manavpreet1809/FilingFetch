# Stage 05: Document pagination

Verified November 2, 2026. DocumentListing accounts for stable document IDs across
overlapping virtualized windows without using recycled DOM row keys as identity.
Changed metadata for an existing ID, missing IDs, more rows than advertised, or a
window with no new IDs fail explicitly. The retrieval loop stops at the known
unique count and still reports an early source end as incomplete. File limits
remain independent of row counts.

52 tests, type checks and build pass. Synthetic three-window integration coverage
retrieves each of five unique rows once, despite overlapping rows. A repeating
source fails after one download and closes the source. Unit checks cover recycled
DOM keys, changed metadata and invalid/stale counts; the earlier premature-end
regression remains passing.

The live comparison is the six-row M12205 Key Documents listing recorded in
[Stage 04](stage-4.md): all six observed IDs agree with the advertised six. This
was one rendered window, not a live multi-window traversal. The three-window
proof is synthetic; the 44-row Other Documents category was not exhaustively
verified. Full automated public-source acceptance remains Stage 15 work.
