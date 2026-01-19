# GPTree v0.2.0 — Standalone Static Web Demo (Vite) + BYOK OpenAI-Compatible Provider
## Project Plan for Codex (Authoritative)

---

## Goal

Build a standalone static web app (Vite) that demonstrates GPTree UX:

- Left pane: tree (VS Code-like)
- Right pane: chat for the active node
- Selecting text in transcript can create a child branch node
- Node navigation via tree
- Merge actions (inline vs link) as UX-level actions
- Local persistence + export/import JSON
- Works out-of-the-box with DummyProvider
- Supports BYOK API via an OpenAI-compatible endpoint (ModelScope base_url)

No browser extension. No ChatGPT DOM automation.

---

## Environment Requirements (Developer)

- Node.js (LTS) + npm
- No Python required
- Local run:
  - npm install
  - npm run dev
  - npm run build && npm run preview

Codex must generate `runtest.sh` and `runtest.ps1` to validate build + preview.

---

## Non-Goals

- No auth/accounts/quotas
- No security hardening (demo)
- No collaboration
- No perfect text surgery merging (merge can be status + references + optional best-effort summarization)

---

## UX Requirements

### Layout
- Left sidebar: TreeView
  - expand/collapse
  - active highlight
  - status badges: draft/open/linked/merged
- Main pane: ChatPane
  - header: node title + breadcrumb
  - quote context card for branch nodes (collapsed optional)
  - transcript (user/assistant)
  - composer + Send
  - quote-to-branch action:
    - user selects text in transcript
    - click “Create Branch from Quote”
    - new child node created and focused

### Merge
Provide two buttons:
- Merge Inline: mark merged; append a “merge note” to parent (optional AI-generated summary)
- Merge as Link: mark linked; insert parent reference item that jumps to child node

### Settings
Add a Settings modal/panel:
- Provider mode: Dummy | External (OpenAI-compatible)
- External settings (BYOK):
  - baseUrl (default: https://api-inference.modelscope.cn/v1)
  - apiKey (user input)
  - model (default example: deepseek-ai/DeepSeek-R1-Distill-Qwen-32B)
  - stream (boolean; default true)
  - maxTokens (default small e.g. 512)
  - temperature (optional)
- Buttons:
  - Save
  - Test Connection (send minimal request; show success/error)
  - Forget Key (clears apiKey)

Rules:
- Store settings locally only
- Never export apiKey in workspace JSON

---

## Data Model

Workspace:
- workspaceId, createdAt, updatedAt
- rootNodeId
- nodes: Record<nodeId, Node>
- ui: { activeNodeId, expandedNodeIds }

Node:
- id, parentId, childrenIds
- title, status: draft|open|linked|merged
- anchor (optional): { sourceNodeId, quoteText }
- messages: Message[]
- merge (optional): { mode: inline|link, note, targetNodeId }
- createdAt, updatedAt

Message:
- id
- role: user|assistant|system
- text
- ts

---

## Provider Abstraction

Implement `AIProvider`:

- name: string
- isConfigured(): boolean
- generate(input): Promise<{text: string}>

Required providers:
1) DummyProvider (default, always configured)
2) OpenAICompatibleProvider (External provider; BYOK)

Prompt policy (cost-safe):
- Send only active node messages (e.g. last 10)
- Include anchor quote if present
- Do NOT send whole workspace

---

## OpenAI-Compatible Provider Requirements (ModelScope)

### Endpoint Shape
Use OpenAI-compatible chat completions.

Base URL: user-configurable (default ModelScope):
- https://api-inference.modelscope.cn/v1

Target endpoint:
- POST {baseUrl}/chat/completions

Headers:
- Authorization: Bearer {apiKey}
- Content-Type: application/json

Body:
- model: {model}
- messages: [{role, content}]
- stream: true|false
- max_tokens: optional
- temperature: optional

### Streaming
If stream=true:
- Parse Server-Sent Events style chunks (best effort).
- For demo, it is acceptable to:
  - show incremental text as it arrives, OR
  - accumulate and display when complete if parsing is hard.

Important:
- Your Python example uses `reasoning_content` and final content.
- For web demo, it is acceptable to ignore reasoning tokens and display only final `content` if available.
- If provider returns a separate reasoning field, do not break; just append what is safe to show.

Fallback:
- If streaming parse fails, retry with stream=false automatically.

### CORS Note (Demo)
If browser CORS blocks direct calls:
- Provide a clear error message in “Test Connection”.
- Add an optional “Proxy URL” setting (default empty) for later.
Do not implement a server in v0.2.0 unless necessary.

---

## Persistence

- Store workspace in localStorage (or IndexedDB optional)
- Auto-save on every change
- Export/import JSON
- Exports must exclude apiKey and any provider secrets

---

## Tech Stack

- Vite + React + TypeScript (preferred)
- Minimal CSS
- No SSR frameworks

Suggested structure:
- /src/components (TreeView, ChatPane, SettingsModal, ExportImport, QuoteCard)
- /src/models (types + helpers)
- /src/providers (AIProvider, DummyProvider, OpenAICompatibleProvider)
- /src/store (workspaceStore + persistence)
- /src/utils (id, selection, fetch/stream parsing)

---

## Run/Test Automation (Required)

Generate:
- runtest.sh (macOS/Linux)
- runtest.ps1 (Windows)

They must:
1) npm install
2) npm run build (must succeed)
3) npm run preview (start and print URL)
   - If you cannot stop automatically, print “Press Ctrl+C to stop preview”.

Ensure package.json has:
- dev: vite
- build: vite build
- preview: vite preview

Add README “Local Run/Test” section with exact commands.

---

## Acceptance Criteria

1) Root node chat works with DummyProvider
2) Quote selection creates child node; tree updates
3) Switching nodes restores per-node transcripts
4) Settings allow switching Dummy vs External provider
5) External provider can call OpenAI-compatible endpoint (ModelScope base_url) and display response
6) Export/import workspace works and excludes apiKey
7) npm run build + npm run preview work (validated by runtest scripts)

---

## Final Instruction to Codex

Implement GPTree v0.2.0 exactly according to this plan.

Prioritize:
- Tree + node chat UX
- Quote → branch creation
- Local persistence + export/import
- DummyProvider default
- OpenAI-compatible External provider using baseUrl/apiKey/model settings
- Generate runtest.sh and runtest.ps1 after core implementation

---

## Local Run/Test

Local dev:

```bash
npm install
npm run dev
```

Build + preview:

```bash
npm run build
npm run preview
```

Automated scripts:

```bash
./runtest.sh
```

```powershell
./runtest.ps1
```
