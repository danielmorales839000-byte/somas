# Design decisions

A new editorial direction: warm ivory, forest green, electric lime, large type, diagram-led explanation, and short keyword sequences. No inherited application UI or authentication flow.

Narrative: goal → manager and specialists → learning loop → independent networked teams → films → visitor perspective. Examples are illustrative, not live capability claims. No invented users, metrics, testimonials, token, or investment promises.

First load uses local HTML, CSS, JavaScript, and SVG. No external fonts, images, analytics, video requests, or AI services. YouTube players are created on click. Main page source is under 30 KB before compression (HTML + CSS + JS), excluding optional video playback.

Research references:
- https://web.dev/articles/embed-best-practices
- https://developer.chrome.com/docs/lighthouse/performance/third-party-facades
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/ci-cd/builds/

Hosting price alone does not establish why an earlier website was slow. This design reduces initial payload and removes database/authentication dependencies from public page rendering. Actual speed still depends on client network, location, and hosting configuration.
