# GPTree v0.2.2 --- Standalone Static Web Demo (Vite)

## Root Seed + Branch Seed (C3-true) + Polished Git-Style Tree UI

Authoritative specification for Codex implementation.

------------------------------------------------------------------------

## 0) What's New in v0.2.2

This version introduces: 1. Seed discipline (Root Seed + Branch Seed) 2.
C3-true summarization for branch origin context 3. Improved Tree UI
(colored bands, commit dots, connectors)

Merge-back is deferred.

------------------------------------------------------------------------

## 1) Terminology

Root Seed: Workspace-level system prompt.\
Branch Seed: Branch-specific context packet.\
Session: Continuous chat transcript.\
Node: One user Send + assistant reply.

------------------------------------------------------------------------

## 2) Behavioral Rules

-   Node = one user message + assistant answer
-   Every Send creates a Node
-   Branching creates a new Session
-   Branches can branch
-   Merge-back deferred

------------------------------------------------------------------------

## 3) Seeds

### Root Seed (workspace.settings.rootSeed)

Default:

You are an assistant helping manage a tree-structured Q&A workflow
(GPTree). Rules: - Treat each user message as a commit node. - Be
concise and technical. - Do not hallucinate missing context. - Ask at
most one clarifying question if needed. - Prioritize branch seed context
in branch sessions.

### Branch Seed (session.branchSeed)

Fields: - sourceTreeId - sourceSessionId - sourceNodeId - quoteText -
originSummary - createdAt

Settings UI:
- Root Seed is editable in Settings.
- Branch Seeds are listed read-only (all branch sessions), including source IDs, quoteText, originSummary, and sessionId.

------------------------------------------------------------------------

## 4) C3-True Branch Seed Summarization

Trigger: Branch creation.

Context: - quoted span - source node Q/A - last K preceding nodes (K=4)

Summarizer system prompt:

You are generating a compact context summary for a branch discussion.
Produce 5--8 bullet points. Do not answer the branch question.

------------------------------------------------------------------------

## 5) Branch Prompt Assembly

Trunk: - System: Root Seed - History: last M nodes - User: question

Branch: - System: Root Seed + Branch Instruction - User Context Block:
quote + originSummary - History: last M branch nodes - User: question

Branch Instruction:

You are in a BRANCH session derived from a quoted span. Prioritize the
quoted span and originSummary.

------------------------------------------------------------------------

## 6) Data Model Additions

Workspace.settings: - rootSeed - uiTheme { baseFontSize, palette }

Session: - branchSeed - colorKey

------------------------------------------------------------------------

## 7) Tree UI Rendering

-   Vertical colored band per session
-   Commit dots (filled = answered, hollow = pending)
-   Branch connectors
-   Nested branches allowed

Color assignment: - trunk = palette\[0\] - branch = hash(sessionId) %
palette.length

------------------------------------------------------------------------

## 8) UI/UX Refinements

-   Larger fonts
-   Better spacing
-   Icons for trunk/branch
-   Tooltip for quote selection
-   Send button sits to the right of the composer textarea
-   Composer textarea style: 17px, weight 600, black text, slightly taller glyphs via scaleY(1.03)
-   Composer and settings textareas resize vertically only (fixed width)
-   Chat bubbles inset from edges and tighter Q/A spacing
-   Chat bubble max width: 50%
-   Tree font size increased (~15px for titles and labels)
-   Tree labels: line break after 25 chars; truncate after 45 chars with "..."

------------------------------------------------------------------------

## 9) Providers

DummyProvider: deterministic.\
ExternalProvider: graceful failure handling.

------------------------------------------------------------------------

## 10) Persistence

-   branchSeed persisted locally
-   export excludes API keys
-   rootSeed included

------------------------------------------------------------------------

## 11) Acceptance Criteria

1.  Root Seed always used.
2.  Branch creation triggers summarizer.
3.  Branch calls inject quote + originSummary.
4.  Colored tree bands + commit dots.
5.  Nested branches render correctly.

------------------------------------------------------------------------

## Final Instruction to Codex

Implement GPTree v0.2.2 exactly per this specification.
