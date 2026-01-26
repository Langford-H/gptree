# GPTree v0.2.1 — Standalone Static Web Demo (Vite)
## Continuous Trunk Chat + Tree Metadata + Quote-Based Branch as New Chat Window

---

## 0. Design Contract (Non-Negotiable)

This version obeys three absolute rules:

1) **The main chat window is continuous**, exactly like the current ChatGPT UI.
2) **Creating a branch from a quote ALWAYS opens a new chat window**.
3) The **tree is metadata and navigation**, not a replacement for the chat UI.

If any implementation violates these, it is incorrect.

---

## 1. Core Concepts

### Tree
A **Tree** represents one top-level question/topic initiated by the user.

- Created only by clicking **New Question**
- Independent from other trees
- One tree is active at a time
- Each tree owns exactly one **trunk chat**

### Trunk Chat
- The main continuous conversation for a tree
- Behaves exactly like ChatGPT:
  - user sends messages
  - assistant replies
  - transcript grows linearly
- Never split, replaced, or reset unless:
  - user starts a New Question, or
  - user clicks Clear All

### Node (Commit)
A **Node** is a *record* of one user question + its assistant answer.

- Nodes are created **on every Send**
- Nodes are appended sequentially to the tree
- Nodes exist to:
  - label the tree
  - enable quote-based branching
  - enable merge-back later
- Nodes do **not** own their own chat UI in v0.2.1

---

## 2. When Things Are Created (Precise Rules)

### 2.1 New Tree
Trigger:
- User clicks **New Question**

Effect:
- Current tree is folded/collapsed
- New tree is created
- New empty trunk chat is created
- Focus switches to the new trunk chat

No other action creates a tree.

---

### 2.2 New Node (Commit)
Trigger:
- User clicks **Send** in the trunk chat

Effect:
- A new node is created:
  - node.question = user message
  - node.answer = assistant reply
- Node is appended to the tree’s node list
- Tree sidebar updates label using node.question
- Trunk chat continues uninterrupted

There is **no separate node UI**.

---

### 2.3 Create Branch from Quote (Critical)
Trigger:
- User selects text in the trunk chat
- User clicks **Create Branch from Quote**

Effect (must happen in this order):
1) A new branch node is created in the tree:
   - parentNodeId = node containing quoted text
   - anchor.quoteText = selected text
2) A **new chat window** is opened (new tab or new chat session)
3) The new chat is pre-seeded with:
   - explanation that this is a branch discussion
   - the quoted span
   - minimal parent context (the assistant answer containing the quote)
4) The original trunk chat:
   - remains open
   - remains unchanged
   - does not switch context

This behavior is mandatory.

---

## 3. Tree Semantics (Left Sidebar)

### Purpose of the Tree
The tree is **not** the conversation.
It is:
- a map of questions asked
- a map of where branches were created
- a way to navigate history and branches

### Rendering Rules
- Each node label = truncated user question
- Sequential questions appear on the same vertical line
- Branch nodes appear indented under their source node
- Clicking a node:
  - highlights it
  - optionally scrolls trunk chat to its message
  - does NOT replace the trunk chat

### Tree is read-only with respect to chat flow in v0.2.1

---

## 4. Branch Chats

### Branch Chat Characteristics
- Opened in a **new chat window**
- Independent conversation state
- Uses its own AI context
- Knows it is a branch (system prompt)
- References:
  - quoted text
  - source node
  - source tree

### Branch Chat Does NOT:
- modify trunk chat automatically
- share live state with trunk chat
- collapse trunk UI

---

## 5. Prompt Assembly (Deterministic)

### Trunk Chat Prompt
Every assistant call in trunk chat includes:
1) workspace.systemPrompt
2) tree context:
   - tree id
   - current node count
3) recent trunk messages (last K)

### Branch Chat Prompt
Every assistant call in branch chat includes:
1) workspace.systemPrompt
2) branch system instruction:
   - “This is a branch discussion derived from another conversation.”
3) quoted span (verbatim)
4) parent answer excerpt
5) branch chat messages

Full tree/workspace is never sent.

---

## 6. Cleanup

### Clear All
Trigger:
- User clicks **Clear All**

Effect:
- All trees deleted
- All chats closed
- systemPrompt reset to default
- providerConfig cleared (optional)
- Fresh empty workspace created

No partial cleanup in v0.2.1.

---

## 7. Providers

### DummyProvider (default)
- Always available
- Deterministic responses
- Must acknowledge quote in branch chats

### ExternalProvider
- Uses user-provided API config
- Failure produces readable assistant message
- Must not crash UI

---

## 8. Persistence and Export
- Workspace stored locally
- Export/import JSON supported
- API keys never exported

---

## 9. Acceptance Criteria (v0.2.1)

1) Trunk chat behaves exactly like ChatGPT (continuous).
2) Sending messages never forces a new chat.
3) Each Send creates a node in the tree.
4) Tree visually reflects question history and branches.
5) Create Branch from Quote opens a **new chat window**.
6) Trunk chat remains untouched after branching.
7) Branch chat is seeded with quote + parent context.
8) Clear All resets everything cleanly.

---

## Final Instruction to Codex

Implement GPTree v0.2.1 exactly as specified.

Key invariants:
- Continuous trunk chat
- Branch = new chat window
- Tree is metadata, not a chat switcher
- No split panels in this version
