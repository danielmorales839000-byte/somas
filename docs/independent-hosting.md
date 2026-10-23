# Guided Cloudflare setup and the manager network

SOMAS helps each customer create or connect a Cloudflare account, choose a new website address and deploy their approved business website. Root retains the user record and the project’s Subnet Manager connection. The manager and model execution stay in SOMAS; the public website runs as an independent Cloudflare Worker in the customer’s account.

## User flow

1. Create a project and select a generated address or a new registered domain. SOMAS saves this choice even before hosting is connected.
2. Open **Hosting**, or **Create or connect Cloudflare account** from the project. The guide links to official Cloudflare signup/sign-in, Workers setup and API token creation. Users complete Cloudflare account verification themselves. SOMAS never collects Cloudflare passwords, signup verification codes, registrant contact information or payment details.
3. Save the account ID and scoped deployment token. SOMAS verifies access with Cloudflare and stores the token encrypted. Choose the workers.dev account name in Cloudflare’s Workers & Pages setup to enable generated addresses.
4. SOMAS resumes queued project setup through the authorized runner. A generated address needs no purchased domain. For a new registered domain, the user reviews availability and price, completes Cloudflare checkout, and SOMAS detects the active zone before deploying automatically.

Address choices:

- **Generated address:** SOMAS assigns `somas-<unique-project-id>.<cloudflare-account>.workers.dev`. It is outside the SOMAS hostname but remains a provider subdomain. There is no domain-registration fee; hosting account limits still apply. Cloudflare recommends registered domains for business-critical production sites.
- **New registered domain:** Users can check authoritative availability and registration/renewal pricing using their connected account, then review and approve checkout in Cloudflare. The integration only calls the Registrar check endpoint; it never calls the billable registration endpoint. If the token lacks Registrar permission, the UI still offers Cloudflare’s search and checkout. Availability and prices can change.
- **Existing domain:** Retained for customers who already own an active Cloudflare root zone.

Deployment tokens need Account → Workers Scripts → Edit. Custom domains also need Zone → Zone → Read and DNS → Read. Live Registrar price checks need the Registrar permissions required by Cloudflare. Limit tokens to the intended account and zones. Account signup, agreements and payment approval remain with Cloudflare.

## Root user management and Subnet Managers

The administrator’s **User management** page retains verified identity, role/access status, activity and projects. It now also shows Cloudflare account ID, verified connection time and workers.dev namespace. Human administrators can save a management display name, organization and private support notes. These fields do not alter verified login email, account ID, access roles or hosting credentials. Ordinary users cannot read or modify these records.

**Subnet network** links each project to its user record and shows hosting setup progress. Connected Subnet Managers exchange reports and advisory guidance with Root. Root’s AI receives operational status, not private management notes or hosting credentials. Website contact forms use per-project server-only credentials to save inquiries in the project owner’s private SOMAS inbox.

## Durable setup and publication

Migrations through `0014` add publication intents, connection namespaces, address types and administrative user details. Existing custom-domain deployments retain their original type. New projects default to generated addresses; old projects are not silently deployed or migrated.

Intents transition through `awaiting_hosting`, `queued`, `awaiting_domain`, `needs_attention`, `blocked` and `configured`. Account connection resumes waiting intents. Setup and publication both use leases; user changes cannot replace a setup job in progress. The runner advances one setup or publication checkpoint before model work. Status responses expose bounded setup metadata for the existing background schedule. Workspace pages also advance the runner while open.

Publications progress through preflight, Worker upload, domain/address enablement and signed HTTPS confirmation. `domain_pending` is not presented as confirmed live. Updates publish only manager-approved public website data. Existing website DNS and unrelated Worker domains are protected. Private chatrooms remain inside SOMAS. Address changes after a deployment has been configured require a separate project.

Tests use Cloudflare fixtures and real Miniflare Workers/D1 for generated-address and custom-domain deployment, account connection, pending-domain activation, encrypted tokens, isolation, retries, signed live checks, manager messaging and private user records. Real account signup, checkout and domain deployment require a customer to complete the guided provider steps; fixture results do not prove a real customer domain is live.
