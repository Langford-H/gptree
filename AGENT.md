# AGENT.md

This file is the working guide for agents operating in `gptree`.

## Purpose

`gptree` is a Vite + React + TypeScript prototype for a tree-structured AI chat UI. The product model is closer to "git for questions" than a linear chat app:

- A `Tree` is the top-level workspace thread.
- A `Session` is either a trunk or a branch conversation within a tree.
- A `Node` is one user message plus one assistant reply.
- A `BranchSeed` stores the quote and compact origin context used to start a branch.

The current codebase is a local-first demo with browser persistence and two provider modes:

- `DummyProvider` for deterministic testing
- `OpenAICompatibleProvider` for external `/chat/completions` APIs

## Primary Files

- `src/App.tsx`: main app state and most workflow logic
- `src/store/workspaceStore.ts`: workspace creation, defaults, normalization, persistence
- `src/models/types.ts`: authoritative data model
- `src/utils/promptAssembly.ts`: prompt assembly for trunk vs branch sessions
- `src/constants/prompts.ts`: branch instruction and summarizer prompt
- `src/providers/AIProvider.ts`: provider contract
- `src/providers/DummyProvider.ts`: deterministic test provider
- `src/providers/OpenAICompatibleProvider.ts`: external provider implementation
- `src/components/TreeView.tsx`: tree/session sidebar UI
- `src/components/ChatPane.tsx`: conversation UI and quote-to-branch interaction
- `src/components/SettingsModal.tsx`: settings and provider configuration

## Behavioral Invariants

- Keep the data model aligned with `src/models/types.ts`.
- A node represents one send cycle: `question` + `answer`.
- Sessions are singly linked through node `prevId` and `nextId`; do not break chain integrity.
- `tree.trunkSessionId` must always point to a valid trunk session in that tree.
- `tree.sessionIds` should include all sessions belonging to the tree.
- Branch sessions must preserve `origin` and `branchSeed` metadata.
- Root seed is always the base system prompt.
- Branch sessions append `BRANCH_INSTRUCTION` and inject quote/origin summary through `buildPromptAssembly`.
- Do not send the entire workspace to providers. Provider calls should continue to use assembled `{ systemPrompt, contextBlock, messages }`.

## Persistence Rules

- Local persistence is handled in `workspaceStore.ts` via the workspace storage key.
- Normalization functions are important because stored data may be stale or partially malformed.
- If you change persisted shapes, update normalization defensively rather than assuming clean data.

## Provider Rules

- Keep `DummyProvider` useful for offline and regression testing.
- Preserve graceful failure behavior in `OpenAICompatibleProvider`, including stream fallback to non-streaming.
- External provider requests target an OpenAI-compatible `/chat/completions` endpoint.
- Avoid coupling UI state directly to provider-specific payload details outside the provider layer.

## UI/UX Constraints

- This repo is an active prototype, not a polished product. Favor clarity and preserving current workflows over broad refactors.
- The app currently emphasizes:
  - tree navigation
  - quote-to-branch flow
  - branch seed context
  - local persistence
  - markdown and TeX rendering
- Keep trunk and branch behavior visibly distinct where relevant.

## Development Workflow

- Install: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`

There is no formal test suite in `package.json` right now. If you change behavior, at minimum:

- run `npm run build`
- smoke-test the affected flow in the app when feasible

## Change Guidelines

- Prefer targeted changes over repo-wide rewrites.
- Preserve existing user changes in the worktree unless explicitly asked otherwise.
- Do not edit `package-lock.json` unless dependency changes require it.
- If you introduce new behavior, update the relevant doc when needed:
  - `README.md` for user-facing setup or product changes
  - `PROJECT_PLAN.md` for spec-level behavior changes
  - `Improvement_Log.md` for implementation notes, risks, or follow-ups

## Current Context Notes

- `PROJECT_PLAN.md` is the strongest product-spec reference in this repo.
- `Improvement_Log.md` contains historical decisions and known-risk notes, but parts of it describe older concepts; treat it as supporting context, not the sole source of truth.
- The README currently reflects prototype status and basic local run instructions.
