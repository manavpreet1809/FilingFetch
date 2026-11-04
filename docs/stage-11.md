# Stage 11: Filename collisions

Verified November 4, 2026. Names are normalized before basename selection,
sanitized to portable ASCII, capped at 160 characters, and protected against
reserved device names. A shared publisher uses an atomic hard link from a regular
temporary file in the output directory. Existing files and symlinks cause a
numbered suffix, not replacement. Suffixes preserve the extension and length cap;
10,000 occupied candidates cause an explicit failure.

Both downloaded files and local/cloud cache restoration use the same publisher
and return the actual published path/name. Cache bytes are validated before
publication and temporary files are removed afterward. This supersedes Stage 09's
rename-based promotion. Hard-link support is required: unsupported filesystems
fail rather than falling back to an overwrite-prone operation. Directory ownership
and protection from concurrent malicious directory replacement remain deployment
responsibilities; this is not a sandbox for an untrusted local filesystem.

86 tests, type checks, build and diff checks pass. Synthetic filesystem tests
cover traversal-like/Unicode/reserved/long names, normalized collisions, twelve
concurrent publishers, existing symlinks, out-of-directory temporary paths,
concurrent streamed downloads and repeated cache restoration. Distinct bytes
remain intact and previously existing files are unchanged. No live cloud cache
was accessed; the cloud restore code uses the same tested local publication path.
