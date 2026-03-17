# GPTree

Manage your questions and quotes like git.

GPTree is currently a test beta/demo for a tree-structured AI chat interface. The goal is to explore a git-like workflow for Q&A, where each user question becomes a node, quoted text can spawn a branch, and users can move between trunk and branch sessions inside one app.

This repository should be treated as an active prototype rather than a finished release. The current build is useful for testing core interaction ideas, UI behavior, prompt seeding, and branch/session flow. The complete version is still in development.

## Current State

- Beta demo only
- Core branching chat workflow is implemented
- Tree sidebar, branch seeds, local persistence, markdown, and TeX rendering are being iterated
- UI and interaction details are still changing
- Merge-back and broader product polish are not complete

## What This Demo Is For

- Testing the git-like tree chat model
- Validating branch creation from quoted text
- Experimenting with session switching and branch seed context
- Refining the terminal/web interface behavior before a full release

## Run Locally

From the project root:

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, usually `http://localhost:5173`.

Useful commands:

- `npm run build` builds the production bundle
- `npm run preview` previews the built app locally

## API Note

Users need to connect their own API/provider for external model use. If you need a model source to start with, a practical place to browse is `https://modelscope.cn/models`.

## Project Documents

- [PROJECT_PLAN.md](/c:/Users/dahua/Desktop/gptree/PROJECT_PLAN.md): current implementation plan / internal spec
- [Improvement_Log.md](/c:/Users/dahua/Desktop/gptree/Improvement_Log.md): change notes and follow-up items

## Status Note

This codebase is intentionally positioned as a working demo. Expect rough edges, ongoing UI changes, and incomplete product decisions. The full version is on the way.

Longer term, GPTree is aimed at helping users write their own textbook with AI in git-tree mode.
