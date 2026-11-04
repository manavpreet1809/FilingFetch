# Stage 08: Download sources

Verified November 3, 2026. A shared validator requires the exact HTTPS origin
https://uarb.novascotia.ca and a nonempty /fmi/webd/APP/connector/ path. It rejects
credentials, fragments, other ports/origins, malformed URLs, dot traversal and
encoded separators. Validation runs before cookie access, in normal browser
download events, and in the malformed-header fallback.

Stream requests use redirect:error. Defensive response checks additionally
reject 3xx statuses, redirected responses, and any changed final response URL;
rejected response bodies are cancelled. Diagnostics do not echo cookies or URLs.
The allowlist preserves the existing connector boundary; it does not invent a
more specific attachment URL pattern.

65 offline tests, type checks and build pass. Synthetic response tests verify
that invalid targets never reach fetch, redirect:error and the caller's abort
signal are passed through, and rejected response bodies are cancelled. No live
filings or credentials were needed or committed. These tests cover the stated
URL/redirect policy; full live retrieval acceptance remains Stage 15 work.
