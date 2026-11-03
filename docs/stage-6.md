# Stage 06: Public-document filtering

Verified November 2, 2026. Only an explicit Public label, trimmed and compared
case-insensitively, permits retrieval. Restricted and unrecognized labels are
skipped; blank labels receive a separate unverified-visibility reason. Filtering
runs before cache lookup and attachment opening, and the source client applies
the same guard to direct attachment and download calls.

55 tests, type checks and build pass. Integration coverage proves restricted,
blank and unknown rows cause no cache lookup, attachment opening or download,
while a padded Public label works. Direct-client tests reject forbidden rows
before any browser exists. The observed six public Key Documents rows are live
examples of explicit labels; no assumption is made about blank-label semantics
in other categories. This conservative policy may omit publicly accessible files
when the source does not explicitly expose their visibility.
