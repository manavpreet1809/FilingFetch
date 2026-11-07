# Stage 17: Incoming email parsing verification

Verified 2026-11-07 with synthetic MIME fixtures and mocked Gmail responses only. No credentials, inbox contents, send operations or cloud resources were used.

## Implemented behavior

The network client delegates raw MIME interpretation to an exported parseIncomingEmail function, so the same parser used in production is exercised offline. Metadata must have a positive safe integer size estimate no greater than 2,000,000 bytes. SENT, DRAFT, SPAM and TRASH labels stop processing before raw content is fetched. The raw response must match the requested Gmail message ID and provide a thread ID. Base64url syntax, encoded length and independently decoded byte length are bounded before MIME parsing; a small estimate cannot bypass the actual byte cap.

Messages need exactly one From header containing one valid ASCII email address. The agent's canonical Gmail aliases, common no-reply/bounce addresses, automatic submissions, mailing-list headers, bulk/list/junk precedence and FilingFetch's own marker are ignored. List-Id detection now uses original header lines: mailparser can normalize this header away from the map the old code checked. Duplicate From headers are rejected rather than choosing one. Reply-To does not replace the sender.

Multipart text is decoded without interpreting attachment contents as the request. HTML-only mail is converted to text. Blank body messages are ignored. Missing Subject, Message-ID and References remain permissible; the parsed result uses an empty subject, optional message ID and empty reference list. The subject is capped at 500 characters, text at 20,000 and array references at the most recent 15 entries. Missing request fields in otherwise nonblank mail remain the extraction/clarification stages' responsibility.

## Evidence and checks

New fixtures: tests/fixtures/email/synthetic_multipart.eml and synthetic_html.eml. Tests cover encoded Unicode, alternative HTML/plain parts, attachment exclusion, optional headers, sender aliases, multiple/duplicate/missing senders, automatic/list/agent markers, no-reply senders, body/size bounds, bad raw encoding, threading metadata, blocked labels, invalid estimates, response identity and actual-byte limits.

All 105 offline tests passed. npm run check, npm run build and git diff --check passed. The first test pass exposed the List-Id filtering defect and a malformed synthetic MIME helper; both were corrected and the full suite rerun. No live Gmail acceptance is claimed.

These filters prevent the tested reply loops; they are not sender authentication, spam detection or an exhaustive MIME/automation classifier. Sender-controlled headers can be forged. Quoted-history interpretation and extraction boundaries remain later stages. The parser can throw on unsupported malformed MIME rather than returning null; caller recovery is outside this stage. Gmail history paging and duplicate message ingestion are Stage 18.

Next: Stage 18 inbox history synchronization.
