# Stage 07: Attachment selection

Verified November 2, 2026. Before opening a dialog or clicking a download, the
selected row must still uniquely match its document ID, title, date, security,
extension and, where present, DOM row key. A recycled key cannot substitute a
different document. Rows without keys still require a unique identity match.

AttachmentSelection binds a copied document snapshot and the complete ordered
filename list. Each download checks document identity, index, expected name, and
every current filename, including list length. Closing clears the active binding.
Reopening during retries must match the original document/list baseline. Missing
names, added/removed/reordered entries and changes to another attachment are
rejected even if the requested filename itself stayed unchanged. PAGE_CHANGED
and NOT_PUBLIC failures are not blindly retried, and their reasons remain visible
in the retrieval report.

62 tests, type checks and build pass. Direct-client tests prove stale rows and
changed dialogs fail before browser controls or download clicks run. Integration
coverage proves a changed selection produces one failed attempt, an explicit
skip reason, and source cleanup. All attachment-change fixtures are synthetic;
no live attachment download or email delivery is claimed for this milestone.
The public site does not provide an atomic row-and-download transaction: a
source change after the final check remains a limitation of UI-based retrieval.
