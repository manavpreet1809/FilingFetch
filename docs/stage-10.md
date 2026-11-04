# Stage 10: File content validation

Verified November 4, 2026. Validation checks nonempty bounded bytes, filename/type
agreement, readable PDFs with at least one page, UTF-8 text without binary control
bytes, and common HTML error-page prefixes (including BOM and leading comments).
Signature parser failures become explicit INVALID_FILE errors. File length is
checked again after reading so a changed file cannot bypass the size check.

ZIP-based containers must decompress within the file byte budget and a 10,000-entry
limit. Office XML formats additionally require the expected document and content-type
parts. This is bounded container/readability validation, not malware scanning or
proof that every format is semantically intact. Other supported binary formats
retain signature-level checks.

80 tests, type checks, build and diff checks pass. Synthetic fixtures cover a
valid PDF and byte hash, UTF-8 text/CSV, HTML responses, empty/oversized data,
corrupt PDFs, truncated ZIPs, extension mismatches, invalid UTF-8, binary text,
valid ZIPs and excessive archive expansion. No live filings were committed.
