# Sharing, example threads, and private contact conversations

Before deploying this update, run the complete db/007_contact_conversations.sql in the Neon SQL Editor against the same database as the Worker DATABASE_URL. It adds contact_replies without rewriting existing records. No dependency installation or secret change is required.

Contact Us keeps the public guest contact form and founder/Telegram links. The decorative reception scene and old meeting-request pane are removed. Verified signed-in members can see the latest 50 contact inquiries sent using their verified account email, then view/reply to each private thread. Threads show the latest 100 replies. Staff open contact records in Admin panel and can reply there. A status-only change is not a reply or Calendar booking. Staff reply email goes to the original inquiry address; member replies notify the configured owner. Provider failure never erases a saved reply. Gmail still requires a working authorized sender.

55 static example discussion cards each open a fictional thread with three example replies. They remain separate from real accounts, community records, votes, and analytics.

Sharing presents all 12 platform tiles at once, with concept chips instead of dropdowns. A tile opens its share composer or manual posting site. No automatic posting or platform sign-in occurs. X uses a concise template; edited long drafts are used by supported other destinations. Facebook/LinkedIn share the link and need pasted text.

Validation: actual isolated PostgreSQL-WASM ownership, staff reply, notification mock, guest denial, cross-account denial, and migration reapplication. Browser preview uses disposable test identities and mocked Gmail; live Google delivery is not verified. No production deployment performed.
