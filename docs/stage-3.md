# Stage 03: Matter navigation

Verified November 2, 2026. Identity checks now require the exact requested matter
number and a nonblank title in both empty and populated matter layouts and at
the retrieval boundary. A different nonempty source identifier fails explicitly
rather than waiting for that identifier to become the requested one.

Offline verification: 34 tests pass, including missing/mismatched identifiers,
blank titles, and the existing retrieval test proving no downloads and source
cleanup on a wrong matter. Type checks and build pass.

Live Safari observation at https://uarb.novascotia.ca/fmi/webd/UARB15:
request M12205 opened M12205, titled “Halifax Regional Water Commission - Windsor
Street Exchange Redevelopment Project - $69,275,000”. The matter was shown as
Closed. This is a manual public-source UI observation, not an automated retrieval
or email-delivery acceptance run. No filing bytes, credentials or personal email
were added to Git.
