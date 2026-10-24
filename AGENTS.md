# SOMAS concept and community

The user explicitly replaced operational AI with a demonstration-only experience.

- Keep all agent, policy-training, project-evolution and blockchain activity as browser-local concept simulations. Never add provider calls, execution runners or scheduled agent jobs.
- Community accounts, posts, replies, votes, notifications, moderation and private inquiries are real backend functions.
- Existing account sessions and password hashes remain compatible. Public profiles must never reveal email, account IDs or legacy private records.
- Authorize every write on the server; administrator authority comes only from ADMIN_USER_ID.
- Use additive database migrations. Never delete historical user/project data as part of code cleanup.
- Test real SQL, ownership, moderation, abuse limits and safe rendering. Clearly distinguish local PostgreSQL-WASM verification from hosted Neon verification.
- Production deployment and production-data modification require explicit approval.
