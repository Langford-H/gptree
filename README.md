# GPTree v0.2.1 — Standalone Static Web Demo (Vite)
## Tree of Questions (Commit-like Nodes) + Explicit Prompt Assembly (Authoritative)

---

## Version Context

- v0.2.0 (previous): standalone IDE-like UI (tree left, chat right), quote creates branch node, local persistence, export/import, provider abstraction.
- v0.2.1 (this spec): fixes conceptual gaps:
  1) AI must always understand “what node am I in and why?”
  2) Tree must show meaningful units (questions/commits), not only “root/branch”.

This document defines **GPTree v0.2.1** and supersedes prior v0.2.0 drafts for implementation.

---

## Core Goal

Build a static website that provides an IDE-like “reasoning workspace”:

- Left: a tree map of **questions** (like commits in git tree)
- Right: the active question’s conversation
- Quoting any text creates a **child question node** (a new “commit”)
- Merge actions mark whether a child question is consolidated back into its parent (inline or link)
- AI behavior is stable because every request includes:
  - workspace-level system prompt
  - node-level context block (why this node exists)
  - node-local messages

Provider-specific details are intentionally abstracted. Default provider must never block the demo.

---

## Non-Goals

- No browser extension
- No ChatGPT web DOM automation
- No multi-user collaboration
- No auth/quotas/security hardening (demo)
- No perfect document rewriting required (merge can be metadata + parent notes)

---

## Environment Requirements

- Node.js LTS (18+)
- npm
- Local run:
  - npm install
  - npm run dev
  - npm run build && npm run preview
- Codex must generate runtest scripts (see Run/Test Automation).

---

## Key Conceptual Model

### Node = Question (Commit)
A node represents a **single user question/issue**. It is the primary unit shown in the tree.

- The tree’s “commit message” is the node’s **primaryQuestion** (or title derived from it).
- A node may contain short back-and-forth, but it must always have a clear question anchor.

### Branching
A branch occurs when a user selects text (quote) and opens a new child question.

- Child node stores the quote and the relationship to the parent.
- Child node title is derived from the child’s primary question (when asked).

### Merge
Merging is a relationship back to the parent:

- Merge Inline: the child’s resolution is written back into the parent as a “merge note” (and optionally a best-effort rewrite later).
- Merge as Link: parent retains a navigable reference to the child.

---

## Data Model (Required)

Workspace:
- workspaceId: string
- createdAt: timestamp
- updatedAt: timestamp
- rootNodeId: string
- nodes: Record<nodeId, Node>
- ui:
  - activeNodeId: string
  - expandedNodeIds: string[]
- settings:
  - systemPrompt: string
  - providerMode: "dummy" | "external"
  - providerConfig: object (provider-specific, stored locally only; never exported)

Node:
- id: string
- parentId: string | null
- childrenIds: string[]
- createdAt: timestamp
- updatedAt: timestamp

Question identity:
- primaryQuestion: string | null
- title: string
  - default: "Untitled question" until primaryQuestion exists
  - once primaryQuestion exists: title = truncated primaryQuestion

Branch origin (optional):
- anchor: null | {
    sourceNodeId: string
    quoteText: string
    sourceMessageId: string | null
    sourceMessageRole: "user" | "assistant" | null
  }

Status & merge:
- status: "open" | "linked" | "merged"
- merge: null | {
    mode: "inline" | "link"
    targetNodeId: string
    note: string
    mergedAt: timestamp
  }

Messages:
- messages: Message[]

Message:
- id: string
- role: "user" | "assistant" | "system"
- text: string
- ts: timestamp

Parent references (for merge-as-link UX):
- references: Array<{
    label: string
    targetNodeId: string
  }>

---

## Persistence and Export/Import

Local persistence:
- Use localStorage for simplicity (IndexedDB optional).
- Auto-save workspace on every change.

Export workspace:
- Download JSON containing workspace + nodes.
- Must exclude provider secrets:
  - settings.providerConfig.apiKey (or equivalent) must not be exported.

Import workspace:
- Load JSON and replace current workspace.

---

## UI Requirements

### Layout
Single-page app.

Left Sidebar: Tree Map
- Displays node hierarchy with expand/collapse.
- Each node label must be the question title (not “root/branch”).
- Visual cues:
  - status badge: OPEN / LINKED / MERGED
  - anchor indicator (small icon or marker) if node originated from quote
  - merge indicator if node has merge metadata
- Clicking a node makes it active.

Right Pane: Active Node Workspace
Header:
- title (editable optional)
- breadcrumb (Root → … → active)
- controls:
  - New Child Question (optional)
  - Merge Inline
  - Merge as Link
  - Export / Import (can be global toolbar instead)

Context block (always present, but compact):
- If node has anchor.quoteText:
  - show Quote Card (collapsed by default is acceptable)
  - show “From: parent node” link
- Show node status

Transcript:
- message list for this node only

Composer:
- textarea + Send
- Send triggers provider response (dummy/external)

Quote-to-branch interaction:
- user selects text in transcript
- button: “Create Question from Quote”
- creates child node with:
  - parentId = current node id
  - anchor.quoteText = selected text
  - status = open
- switch active node to the new child immediately
- in the child, the Quote Card shows selected text

---

## Prompt Assembly (Critical)

AI must never guess context. Every model call is assembled from:

1) Workspace system prompt (workspace.settings.systemPrompt)
2) Node context block (generated each call from node fields)
3) Node-local messages (recent N)

### Storage rule
- Store the system prompt in workspace settings.
- Store node context as structured fields (primaryQuestion, anchor, breadcrumb).
- Do not store a single monolithic “prompt string” in the node; assemble deterministically.

### Default system prompt (required)
Provide a default system prompt in settings. Example (plain text):

  You are an assistant helping the user resolve a specific question inside a tree-structured workspace.
  Stay within the active node’s context and quoted span if provided.
  Be concise and precise. If clarification is needed, ask at most one targeted question.

### Node context block (generated each call)
Generate a compact context block. Example (plain text):

  Node:
  - Title: {node.title}
  - Path: {breadcrumb}
  - Status: {node.status}

  If anchor exists:
  - This node was created from a quote in parent node {parent.title}
  - Quoted span:
    <<<
    {anchor.quoteText}
    >>>

  Primary question (if available):
  <<<
  {node.primaryQuestion}
  >>>

### Message window
Send only the last N node messages (e.g., N=12) to control cost.

---

## Provider Abstraction

AIProvider interface:

- name: string
- isConfigured(settings): boolean
- generate(request): Promise<{text: string}>

Request includes:
- systemPrompt: string
- contextBlock: string
- messages: Message[]
- options: {maxTokens?, temperature?, stream?}

Providers required:

1) DummyProvider (default)
- Always configured
- Deterministic, plausible output
- Must reference quote text if present
- Must be short by default

2) ExternalProvider (stub in v0.2.1)
- Reads providerConfig from settings (user will implement)
- If not configured: return a friendly error message inside assistant response
- The UI must never break if provider fails; it should display an error toast and keep working.

---

## “Primary Question” Capture Rule (Commit Message)

To make the tree meaningful, each node must get a primary question.

Rule:
- If node.primaryQuestion is null, the first user message sent in that node becomes node.primaryQuestion.
- node.title is updated to truncated primaryQuestion (e.g., first 60 chars).

Additionally:
- Allow user to rename title manually (optional).
- Renaming title does not change primaryQuestion.

---

## Merge Semantics (v0.2.1)

### Merge as Link
When user clicks “Merge as Link” on active child node:

- Set node.status = linked
- Set node.merge:
  - mode = link
  - targetNodeId = parentId
  - note = optional text (auto-filled: “Linked to parent”)
- In parent node:
  - append reference item:
    - label: "See: {child.title}"
    - targetNodeId: child.id

### Merge Inline
When user clicks “Merge Inline” on active child node:

- Set node.status = merged
- Set node.merge:
  - mode = inline
  - targetNodeId = parentId
  - note = summary text
- In parent node:
  - append a system or assistant message:
    - “Merged from {child.title}: {note}”

If provider is available:
- You may generate the note using AI:
  - Use child node messages + quote to produce a 3–6 sentence merge note.
Fallback:
- Use a deterministic dummy summarization.

Note:
- v0.2.1 does not require rewriting parent messages in place. That can be v0.2.2+.

---

## Run/Test Automation (Required)

Codex must generate:
- runtest.sh (macOS/Linux)
- runtest.ps1 (Windows)

Scripts must:
1) npm install
2) npm run build
3) npm run preview
4) Print the preview URL
If stopping preview automatically is difficult:
- Print instructions: “Press Ctrl+C to stop.”

package.json must include:
- dev: vite
- build: vite build
- preview: vite preview

README must include “Local Run/Test” with exact commands.

---

## Acceptance Criteria

v0.2.1 is successful if:

1) Tree displays meaningful node labels (questions), not only root/branch icons
2) Creating a child from quote works and switches active node
3) Each node maintains its own transcript
4) First user message sets primaryQuestion and updates tree label
5) Provider calls include explicit system prompt + node context block
6) DummyProvider always works; ExternalProvider failure does not break UI
7) Merge as Link creates a navigable reference in parent
8) Merge Inline appends a merge note back to parent
9) Workspace persists locally and export/import works without exporting secrets
10) npm build + preview works (validated by runtest scripts)

---

## Final Instruction to Codex

Implement GPTree v0.2.1 exactly according to this specification.

Prioritize:
- Tree of questions (commit-like nodes)
- Quote → child question creation
- Explicit prompt assembly (system prompt + node context + node messages)
- Merge semantics as status + parent notes/references
- Local persistence + export/import
- DummyProvider default and reliable
- Generate runtest scripts after implementing core app
