# GPTree v0.2.1 — Improvement Log (Separable Tracking Document)
## Purpose: Trace issues, decisions, and implementation deltas cleanly

This log is designed to be maintained independently from the main spec.
Use it to track what changed, why, and how to test/debug.

---

## 0) Scope and Conventions

### What goes into this log
- UX/architecture changes (decisions and rationale)
- Known issues and suspected causes
- Implementation checkpoints and tests
- Risk register (CORS/API, prompt drift, persistence corruption)

### Status labels
- [DONE] implemented and verified
- [IN-PROGRESS] being implemented
- [TODO] planned
- [KNOWN-ISSUE] observed bug/regression
- [RISK] likely problem area, not yet observed

### How to reference items
Use IDs so you can refer back in chats and commits:
- DEC-### (decision)
- CHG-### (change)
- BUG-### (bug)
- TST-### (test)
- RSK-### (risk)

---

## 1) Key Decisions (High-Level)

### DEC-001 — Switch from “tree of chats” to “tree of questions”
- Decision: Each node represents a **question/issue** (commit-like), not a generic Q&A thread.
- Reason: Root/branch icon-only tree was not navigable; question labels are meaningful.
- Impact: Data model gains `primaryQuestion` + `title` derived from first user message.

Acceptance: Tree labels display question titles, not “Branch #N”.

---

### DEC-002 — Explicit prompt assembly with stable system prompt + node context
- Decision: Do not rely on raw chat transcript alone. Always assemble:
  - Workspace system prompt
  - Node context block (breadcrumb + quote + primary question)
  - Node-local messages (last N)
- Reason: Without node context, assistant cannot reliably understand what the branch is about.
- Storage: Store structured fields (systemPrompt, anchor, primaryQuestion), assemble prompt at runtime.

Acceptance: Provider request always includes systemPrompt + contextBlock.

---

### DEC-003 — Merge is metadata + parent reference/notes (no in-place rewrite required)
- Decision: v0.2.1 merge does not require rewriting parent transcript precisely.
- Merge Inline: append merge note back to parent
- Merge Link: add navigable reference in parent
- Reason: Avoid fragile text surgery; keep demo stable and traceable.

Acceptance: Merge actions always create visible artifacts in parent node.

---

## 2) Changes Implemented / Planned

### CHG-001 — Node primary question capture (“commit message” rule)
- Change: When `node.primaryQuestion` is null, the first user message sets it.
- Change: Tree label updates to truncated question.
- Test: Create node → send first user message → tree label updates.

Status: [DONE]

---

### CHG-002 — Tree rendering enhancements
- Change: Tree nodes show:
  - title (question)
  - status badge (OPEN/LINKED/MERGED)
  - quote-origin indicator if `anchor` exists
  - merge indicator if `merge` exists
- Test: Create quote child node → verify indicator.
- Test: Merge node → verify badge/indicator.

Status: [TODO]

---

### CHG-003 — Node context block displayed in UI (debug mode)
- Change: Add optional “Show context sent to AI” toggle (debug-only).
- Reason: Helps diagnose prompt issues and user reports.
- Test: Toggle on → see systemPrompt + contextBlock preview.

Status: [TODO]

---

### CHG-004 — Prompt assembly enforcement in provider layer
- Change: Provider must accept `{systemPrompt, contextBlock, messages}` rather than raw workspace.
- Reason: Prevent accidental “send entire tree” bugs and keep costs controlled.
- Test: Unit/log assertion: request payload does not include full workspace JSON.

Status: [TODO]

---

### CHG-005 — Merge Inline produces parent note
- Change: On merge inline:
  - child status=MERGED
  - parent gets appended message (assistant/system) with merge note
- Test: Merge inline → parent transcript shows merge note.

Status: [TODO]

---

### CHG-006 — Merge as Link produces parent reference
- Change: On merge link:
  - child status=LINKED
  - parent reference list includes link to child node
- Test: Merge link → parent shows reference → click navigates.

Status: [TODO]

---

## 3) Known Issues and Debug Guidance

### BUG-001 — Assistant appears unaware of quote/branch context
- Symptom: Responses ignore the quote or respond as if in root.
- Likely causes:
  1) Missing systemPrompt in request
  2) Missing contextBlock in request
  3) Using wrong active node messages
  4) Quote stored but not included in contextBlock
- Debug steps:
  - Enable “Show context sent to AI”
  - Confirm quoteText appears in contextBlock
  - Confirm messages are from active node only
  - Confirm request includes systemPrompt at top

Status: [TODO] (prevent via CHG-003/004)

---

### BUG-002 — Tree shows generic titles or duplicates
- Symptom: Many nodes labeled “Untitled question” or identical.
- Likely causes:
  1) primaryQuestion not set on first user message
  2) title not updated after setting primaryQuestion
- Debug steps:
  - Verify CHG-001 implemented
  - Log node.primaryQuestion on send
  - Ensure UI uses node.title as label

Status: [TODO]

---

### BUG-003 — Quote selection fails intermittently
- Symptom: “Create Question from Quote” yields empty quote.
- Likely causes:
  1) selection cleared on button click
  2) selection in non-text DOM area
- Mitigation:
  - Capture selection on mouseup and store temporarily
  - Or clone range text before opening menu/button

Status: [RISK]

---

## 4) Tests / Acceptance Checklist

### TST-001 — Basic node chat
1) Open app
2) Root node active
3) Send message
4) DummyProvider replies
Expected: message list updates; no errors.

---

### TST-002 — Primary question becomes tree label
1) Create new child node (any method)
2) Send first user message: “Why does X happen?”
Expected:
- node.primaryQuestion set
- tree label becomes “Why does X happen?”

---

### TST-003 — Quote → child node
1) In a node transcript, select text
2) Click “Create Question from Quote”
Expected:
- new child node appears under current node
- child shows Quote Card with selected text
- active node switches to child

---

### TST-004 — Provider request contains context
1) Enable debug “Show context sent to AI”
2) In child node, send question
Expected:
- context includes quoteText
- breadcrumb path present
- system prompt present

---

### TST-005 — Merge Link
1) From a child node, click Merge as Link
Expected:
- child status LINKED
- parent shows a reference “See: <child title>”
- clicking reference navigates

---

### TST-006 — Merge Inline
1) From a child node, click Merge Inline
Expected:
- child status MERGED
- parent receives a merge note message

---

### TST-007 — Persistence
1) Create nodes and messages
2) Refresh page
Expected:
- workspace restored
- active node restored (or root, acceptable)
- no data loss

---

### TST-008 — Export/Import
1) Export workspace JSON
2) Clear local storage
3) Import JSON
Expected:
- tree and chats restored exactly
- no provider secrets present in JSON

---

## 5) Risk Register

### RSK-001 — External provider CORS blocks browser requests
- Impact: External provider unusable in static hosting.
- Mitigation: Keep DummyProvider default; later add optional local proxy/relay.

---

### RSK-002 — Context growth increases cost/latency
- Impact: Large node messages sent each call.
- Mitigation: last N messages only; enforce in provider layer.

---

### RSK-003 — Persistence corruption due to schema changes
- Impact: JSON in localStorage becomes incompatible.
- Mitigation: Add workspace schemaVersion; migrate on load.

---

## 6) Implementation Order (Suggested)

1) CHG-001 primaryQuestion/title rule
2) CHG-004 provider request shape + prompt assembly enforcement
3) CHG-003 debug context viewer (to trace issues)
4) CHG-002 tree rendering improvements
5) CHG-006 merge as link + references
6) CHG-005 merge inline + parent note
7) Persistence + export/import validation (TST-007, TST-008)

---

## 7) Notes for Commits (Optional)

Suggested git commit messages:
- feat(tree): show question titles and status badges
- feat(prompt): add system prompt + node context assembly
- feat(merge): add link merge references in parent
- feat(merge): add inline merge notes to parent
- chore(test): add runtest scripts and README run/test section
