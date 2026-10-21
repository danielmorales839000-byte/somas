# SOMAS v2 — Codex start

## Project state

This repository is a fresh, source-implemented free-first alpha for Cloudflare+Neon. It is **not** the complete commercial product. The current unit tests pass, but it still needs an actual Neon integration run, Cloudflare Worker deploy, and external provider sandbox testing.

## Read order

`AGENTS.md` → `README.md` → `docs/ARCHITECTURE.md` → `docs/FUNCTION_CONTRACTS.md` → `docs/IMPLEMENTATION_ROADMAP.md` → `docs/DEPLOYMENT_AND_SECURITY.md`.

## First Codex prompt

> Read every document above, inspect all source and SQL migrations, then install dependencies, run `npm run check`, and deploy a development environment to Neon and Cloudflare using already-connected credentials if available. Do not invent keys or claim deployment without an actual provider result. Fix any integration failures with minimal changes and new tests. Next, add production-grade multi-tenant isolation, auth abuse protection and an isolated code-generation runner using the function contracts. Preserve separate trainable policies for the Manager, Assistant, Virtual Customer and specialist agents, owner-only embedded Manager experiences, and independent software/neural release gates. At every milestone, report what is implemented, deployed, verified and still blocked.
