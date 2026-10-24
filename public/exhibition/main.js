import {
  communityMarkup,
  mountCommunity,
  communityPreview,
} from "./community.js";
import { nav, agents, scenarios, nodes, videos, networkSteps } from "./data.js";
import { organizationMarkup, mountOrganization } from "./graph.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const paths = {
  grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  spark: "m12 2 2.6 6.7L22 12l-7.4 2.7L12 22l-2.6-7.3L2 12l7.4-3.3Z",
  people:
    "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-1a3 3 0 1 0 0-6M2 22v-3a6 6 0 0 1 12 0v3m2-7a5 5 0 0 1 6 5v2",
  org: "M9 2h6v5H9zm-7 15h6v5H2zm14 0h6v5h-6zM12 7v5M5 17v-5h14v5",
  network: "m12 2 9 5v10l-9 5-9-5V7Zm0 0v20M3 7l18 10M21 7 3 17",
  play: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m4 4 7 5-7 5Z",
  chat: "M3 3h18v13H8l-5 5Zm5 5h9M8 12h6",
  mail: "M2 5h20v14H2zm0 0 10 8L22 5",
};
const icon = (id) =>
  `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[id] || paths.network}"/></svg>`;
let path = location.pathname;
if (path.endsWith("/index.html")) path = path.slice(0, -10);
if (path !== "/" && !path.endsWith("/")) path += "/";
let current = nav.find((n) => n[0] === path);
if (path.startsWith("/discussions/"))
  current = nav.find((n) => n[0] === "/discussions/");
$("#navigation").innerHTML = nav
  .map(
    ([url, name, id]) =>
      `<a href="${url}" class="${path === url || url === current?.[0] ? "active" : ""}" ${path === url || url === current?.[0] ? 'aria-current="page"' : ""}>${icon(id)}${name}</a>`,
  )
  .join("");
$("#breadcrumb").textContent =
  current?.[1] ||
  {
    "/join/": "Become a collaborator",
    "/privacy/": "Privacy",
    "/submissions/": "Private submissions",
    "/account/": "Community account",
  }[path] ||
  "Dashboard";
$("#menu").onclick = () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#menu").setAttribute("aria-expanded", open);
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#sidebar").classList.remove("open");
    $("#menu").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#sidebar") && !e.target.closest("#menu")) {
    $("#sidebar").classList.remove("open");
    $("#menu").setAttribute("aria-expanded", "false");
  }
});
const head = (tag, title, sub, badge = "INTERACTIVE CONCEPT SIMULATION") =>
  `<div class="page-head"><div><p class="eyebrow">${tag}</p><h1>${title}</h1><p>${sub}</p></div><span class="badge">${badge}</span></div>`;
const constellation = `<svg class="constellation" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="#a18ad2" stroke-width="1.5"><path d="M50 10 87 35 73 80 27 80 13 35ZM50 10 27 80M87 35 27 80M13 35 73 80"/></g>${[
  [50, 10],
  [87, 35],
  [73, 80],
  [27, 80],
  [13, 35],
]
  .map(
    ([x, y]) =>
      `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="5" fill="#ede3ff" stroke="#a18ad2"/>`,
  )
  .join("")}</svg>`;
const heroArt = () =>
  `<div class="hero-illustration" role="img" aria-label="One Manager-led AI organization connects to a network of independent organizations"><div class="hero-orbit"></div><span class="hero-flow">↔</span><a href="/root-somas/" class="portal"><img src="/exhibition/avatars/manager.svg" alt=""><strong>SOMAS Platform</strong><small>Build your AI organization.</small></a><a href="/network/" class="portal">${constellation}<strong>SOMAS Network</strong><small>Connect independent teams.</small></a></div>`;
const gallery = () =>
  `<div class="gallery">${scenarios.map((s) => `<a class="gallery-card panel" href="/root-somas/?scenario=${s.id}"><img src="/exhibition/art/${s.id}.svg" alt="${s.title} concept illustration" loading="lazy" width="760" height="400"><div><h3>${s.title} ↗</h3><p>${s.goal}</p></div></a>`).join("")}</div>`;
const chart = (values, label, color = "#5b9be2") => {
  const pts = values
    .map(
      (v, i) =>
        `${35 + (i * 420) / (values.length - 1)},${140 - (v / Math.max(...values, 1)) * 110}`,
    )
    .join(" ");
  return `<svg class="chart" viewBox="0 0 480 170" role="img" aria-label="${label}. Illustrative values: ${values.join(", ")}"><path d="M35 20v120h420" stroke="#dce7f2" fill="none"/><path d="M35 60h420M35 100h420" stroke="#edf3f8"/><polygon points="35,140 ${pts} 455,140" fill="${color}" opacity=".08"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3"/>${values.map((v, i) => `<circle cx="${35 + (i * 420) / (values.length - 1)}" cy="${140 - (v / Math.max(...values, 1)) * 110}" r="4" fill="white" stroke="${color}" stroke-width="2"/>`).join("")}<text x="35" y="160">EARLIER</text><text x="405" y="160">LATEST</text></svg>`;
};
function dashboard() {
  return `<section class="hero"><div><p class="eyebrow">ONE GOAL. ONE INTELLIGENT ORGANIZATION.</p><h1>OUR FUTURE<br><em>WITH AI</em></h1><p>Imagine a world where everyone can own an intelligent AI organization—and where independent AI organizations can connect and collaborate.</p><div class="hero-actions"><a class="primary" href="/root-somas/">Meet your AI organization ↗</a><a class="secondary" href="/idea/">Explore the ideas</a></div></div>${heroArt()}</section><div class="section-head"><div><p class="eyebrow">SEVEN WAYS INTO THE FUTURE</p><h2>Follow your curiosity.</h2></div><span class="badge">EXPLORE THE EXHIBITION</span></div><section class="carousel panel" id="carousel" tabindex="0" aria-roledescription="carousel" aria-label="Explore SOMAS pages"><div class="carousel-visual" id="carousel-image"></div><div class="carousel-content" id="carousel-copy" aria-live="polite"></div></section><div class="carousel-bottom"><div class="dots" id="carousel-dots"></div><div class="carousel-controls"><button id="prev-slide" aria-label="Previous page preview">←</button><button id="next-slide" aria-label="Next page preview">→</button></div></div><div class="section-head"><div><p class="eyebrow">DIFFERENT GOALS. DIFFERENT ORGANIZATIONS.</p><h2>A team shaped around your world.</h2></div></div>${gallery()}<section class="community-preview-section"><div class="section-head"><div><p class="eyebrow">REAL PEOPLE. REAL PERSPECTIVES.</p><h2>The next idea could be yours.</h2></div><a class="primary" href="/discussions/">Join the Discussion ↗</a></div><p class="fine muted">Community contributions are real; agent and blockchain demonstrations are simulated.</p><div id="community-preview"></div></section>`;
}
const projectLab = () =>
  `<section class="project-lab"><div class="section-head"><div><p class="eyebrow">YOUR OWN ORGANIZATION</p><h2>Describe your goal.<br>Watch a team take shape.</h2></div><span class="badge">EIGHT ILLUSTRATIVE MISSIONS</span></div><div class="scenario-tabs">${scenarios.map((s) => `<button data-scenario="${s.id}">${s.title}</button>`).join("")}</div><div class="project-grid"><section class="mission-chat panel"><p class="eyebrow">01 / HUMAN ↔ MANAGER</p><form id="goal-demo"><label for="goal-input">Your original goal</label><textarea id="goal-input" rows="3" maxlength="500" minlength="8" required></textarea><button class="primary">Shape my demo team ↗</button></form><p class="fine muted">A local simulation chooses a relevant example. Your goal is not sent to an AI service or saved.</p><div class="chat-bubble" id="manager-reply" aria-live="polite"></div><p class="eyebrow" style="margin-top:25px">02 / MANAGER ↔ AI TEAM</p><div id="customer-team" class="customer-team"></div><div class="fine muted" id="provisioning"></div></section><div><section class="customer-app panel"><div class="app-url"><span id="app-domain"></span><span>03 / INDEPENDENT APP PREVIEW</span></div><div class="customer-app-inner" id="customer-preview"></div></section><section class="evolution-controls panel" style="margin-top:14px"><div class="section-head"><strong style="font-size:12px">Original mission → continuous evolution</strong><span class="badge" id="customer-version">v1</span></div><div class="evolution-track" id="evolution-track"></div><div class="controls"><button id="evolution-play">▷ Play evolution</button><button id="evolution-prev">← Previous</button><button id="evolution-next">Next →</button><button id="evolution-reset">↺ Restart</button></div><p class="customer-event" id="customer-event" aria-live="polite"></p></section></div></div></section>`;
function idea() {
  return `${head("THE TWO IDEAS", "Intelligence that organizes.<br>Organizations that connect.", "Two distinct research directions. One possible future.")}<div class="idea-grid">${[
    [
      "manager",
      "Multi-agent",
      "One Manager. Complementary specialists. Instructions out; meaningful reports back.",
    ],
    [
      "operations",
      "Self-organizing",
      "A clothing store and a school need different expertise. The mission shapes the team.",
    ],
    [
      "researcher",
      "Individually trainable",
      "Each agent has its own proposed policy, evaluated experience, and release gate.",
    ],
  ]
    .map(
      ([a, t, p]) =>
        `<article class="idea-card panel"><img src="/exhibition/avatars/${a}.svg" alt=""><div><p class="eyebrow">SOMAS PLATFORM</p><h3>${t}</h3><p>${p}</p></div></article>`,
    )
    .join(
      "",
    )}</div>${projectLab()}<section class="feature-section"><div class="section-head"><div><p class="eyebrow">BEYOND PROMPTS / THE RESEARCH AMBITION</p><h2>Experience becomes an evaluated policy.</h2></div></div><div class="policy-lifecycle"><div class="panel"><div class="policy-steps">${["Experience", "Candidate policy", "Training", "Independent evaluation", "Approved version"].map((s, i) => `<button data-policy="${i}">${i + 1}. ${s}</button>`).join("")}</div><h3 id="policy-title"></h3><p class="muted fine" id="policy-detail"></p><span class="badge" id="policy-version"></span></div><div class="panel"><p class="eyebrow">ILLUSTRATIVE HOLDOUT SCORES</p><div id="policy-chart"></div><p class="fine muted">Example scores only. No real training, promotion, or weight update occurs here.</p></div></div></section><section class="feature-section panel" style="padding:30px"><div class="project-grid"><div><p class="eyebrow">A SEPARATE PROPOSED LAYER</p><h2>Independent intelligence.<br><em>Connected organizations.</em></h2><p class="muted">Identity → permission → collaboration → signed receipts.</p><a href="/network/" class="primary">Explore SOMAS Network ↗</a><p class="fine muted" style="margin-top:18px">Private data stays off-chain. Participants and consensus validators are different roles.</p></div>${heroArt()}</div></section><div class="panel" style="padding:30px;margin-top:30px"><p class="eyebrow">SHAPE THE IDEA TOGETHER</p><h2>A question can be a beginning.</h2><a class="primary" href="/discussions/">Share Your Idea · Ask a Question ↗</a></div><h2 style="text-align:center;margin-top:40px">Two Ideas. One Possible Future.</h2>`;
}
function recruitment() {
  const cats = [
    [
      "Investor",
      "Investors",
      "Support research, engineering, infrastructure, product development, and business growth.",
      "A conversation about potential collaboration—not a promise of returns or automatic ownership.",
      "business",
      "Join as an Investor",
    ],
    [
      "Engineer",
      "Remote engineers",
      "AI · Backend · Frontend · Multi-agent systems · ML · Blockchain · Distributed systems · Security · Cloud · Design.",
      "Explore remote collaboration. Paid employment is not represented as available.",
      "saas",
      "Join as an Engineer",
    ],
    [
      "Assistor / Contributor",
      "Assistors & contributors",
      "Test the experience. Suggest use cases. Review designs. Improve documentation. Research alternatives. Make introductions.",
      "You do not need to invest or write code to contribute.",
      "education",
      "Become a Contributor",
    ],
  ];
  return `${head("WE ARE LOOKING FOR", "Help us build our future with AI.", "Curiosity, craft, and a shared ambition.")}<p class="recruit-intro">We are software engineers working toward a new vision for artificial intelligence. We want to build autonomous AI organizations that help people achieve their goals, and explore a decentralized network where these organizations can collaborate. We are looking for people who want to help turn this vision into reality.</p><div class="recruit-grid">${cats.map(([r, t, p, n, img, b]) => `<article class="recruit-card panel"><img src="/exhibition/art/${img}.svg" alt="${t} concept illustration"><div><h2>${t}</h2><p>${p}</p><p class="fine">${n}</p><a class="primary" href="/join/?role=${encodeURIComponent(r)}">${b} ↗</a></div></article>`).join("")}</div>`;
}
function formMarkup(join = false) {
  return `<form id="public-form" data-kind="${join ? "join" : "contact"}"><div class="form-two"><label>Name<input name="name" autocomplete="name" required maxlength="100"></label><label>Email<input name="email" type="email" autocomplete="email" required maxlength="180"></label></div>${join ? `<div class="form-two"><label>Country<input name="country" autocomplete="country-name" required minlength="2" maxlength="100"></label><label>City<input name="city" autocomplete="address-level2" required minlength="2" maxlength="100"></label></div><fieldset><legend>Contributor / Co-Founder Type · choose one or more</legend><div class="checkbox-row">${["Investor", "Engineer", "Assistor / Contributor", "Other"].map((r) => `<label><input type="checkbox" name="roles" value="${r}">${r}</label>`).join("")}</div></fieldset><label>About you<textarea name="about" required minlength="2" maxlength="1500" rows="3" placeholder="A short introduction"></textarea></label>` : '<label>Subject<input name="subject" required minlength="2" maxlength="160"></label>'}<label>${join ? "Message to us" : "Message"}<textarea name="message" required minlength="10" maxlength="2500" rows="4" placeholder="What would you like us to know?"></textarea></label><div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off" aria-label="Leave empty"></div><label class="consent"><input name="consent" type="checkbox" required>I agree that SOMAS may store this information to respond to my inquiry. <a href="/privacy/">Privacy</a></label><button class="primary" type="submit">${join ? "Send application" : "Send your perspective"} ↗</button><p class="form-message" role="status" id="form-message"></p><p class="fine muted">No visitor account or email verification. Submissions are private and addresses are self-reported.</p></form>`;
}
function contact(join = false) {
  return `${head(join ? "BECOME A COLLABORATOR" : "CONTACT US", join ? "A possible future.<br>Made together." : "Have an idea?<br>Help shape our future with AI.", join ? "Tell us what you would like to contribute." : "Opinions, constructive criticism, technical ideas, proposals, and questions are welcome.", "PRIVATE INQUIRY FORM")}<div class="form-layout"><aside class="contact-aside panel"><p class="eyebrow">LET’S START A CONVERSATION</p><h2>${join ? "Bring your<br>perspective." : "The next idea<br>could be yours."}</h2><p>Share a real-world challenge, a useful insight, or a way to collaborate.</p><a class="contact-method" href="mailto:williamkevin999999@gmail.com"><small>EMAIL THE FOUNDER</small>williamkevin999999@gmail.com ↗</a><a class="contact-method" href="https://t.me/smartboard0x0" target="_blank" rel="noopener"><small>TELEGRAM</small>@smartboard0x0 ↗</a><p class="fine">Submissions are reviewed privately by authorized administrators. This is an inquiry, not an investment agreement or employment offer.</p></aside><section class="form-panel panel">${formMarkup(join)}</section></div>`;
}
function videoPage() {
  return `${head("VIDEOS", "Our future, in motion.", "The two founder-supplied YouTube films and the original organization concept.")}<div class="video-grid">${videos.map((v, i) => `<article class="video-card panel"><button class="video-poster" data-video="${v.id}" aria-label="Watch ${v.title}"><img src="/exhibition/avatars/${i ? "operations" : "manager"}.svg" alt=""><span>▷</span><strong>OUR FUTURE<br>WITH AI</strong></button><div><span class="badge">${v.category}</span><h3 style="margin-top:15px">${v.title}</h3><p>${v.description}</p><a href="https://youtu.be/${v.id}" target="_blank" rel="noopener">Watch on YouTube ↗</a></div></article>`).join("")}<article class="video-card panel"><video controls preload="none" poster="/exhibition/art/store.svg" class="video-frame" aria-label="Original SOMAS organization concept film"><source src="/exhibition/original-concept.mp4" type="video/mp4"></video><div><span class="badge">ORIGINAL CONCEPT</span><h3 style="margin-top:15px">The organization behind the vision.</h3><p>The supplied original film. Its dark scenes are historical references; the current exhibition is light mode.</p></div></article></div><p class="fine muted" style="margin-top:20px">YouTube loads only after you press play. Availability and embedding are controlled by the video owner and YouTube.</p>`;
}
function network() {
  return `${head("SOMAS NETWORK", "Independent intelligence.<br>Connected organizations.", "Each participant represents a whole Manager-led team.", "SIMULATED NETWORK DATA")}<div class="metrics">${[
    ["Network participants", "20", "Independent example identities"],
    ["Validator nodes", "2", "Consensus roles are separate"],
    ["Signed agreements", "1", "At the end of the walkthrough"],
    ["Verified results", "1", "Illustrative collaboration receipt"],
  ]
    .map(
      ([l, v, s]) =>
        `<div class="metric panel"><small>${l}</small><strong>${v}</strong><span>${s}</span></div>`,
    )
    .join(
      "",
    )}</div><div class="network-layout"><section class="network-map panel" aria-label="Independent organization network"><svg class="network-links" viewBox="0 0 600 420" preserveAspectRatio="none" aria-hidden="true"><path d="M300 65 Q450 20 490 135 Q560 230 475 315 Q300 430 135 315 Q35 220 100 125 Q190 20 300 65 M300 65Q300 200 475 315M100 125Q300 260 490 135M135 315Q340 140 490 135"/></svg>${nodes
    .slice(0, 8)
    .map((n, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2,
        x = 50 + 34 * Math.cos(a),
        y = 50 + 33 * Math.sin(a);
      return `<button class="network-peer" data-node="${n.id}" style="left:${x}%;top:${y}%">${constellation}<strong>${n.project}</strong><small>${n.type}</small></button>`;
    })
    .join(
      "",
    )}</section><aside id="network-detail" class="network-detail panel"></aside></div><div class="network-charts"><section class="chart-card panel"><p class="eyebrow">ILLUSTRATIVE NETWORK HISTORY</p><div class="chart-tabs"><button data-chart="growth" class="selected">Node growth</button><button data-chart="transactions">Example records</button><button data-chart="collaborations">Collaborations</button></div><div id="network-chart"></div></section><section class="chart-card panel"><p class="eyebrow">ROLE & AVAILABILITY SNAPSHOT</p><h3>Verification is a separate responsibility.</h3><div class="node-tags"><span>15 participants</span><span>2 full verification nodes</span><span>2 validators</span><span>1 Root participant</span></div><div class="policy-mini"><span>Available example nodes: 19 / 20</span><div><b style="width:95%"></b></div></div><p class="fine muted">Node identities do not automatically grant consensus participation, voting rights, or access to private work.</p></section></div><section class="table-panel panel"><div class="section-head"><div><p class="eyebrow">ILLUSTRATIVE ORGANIZATIONS</p><h3>Explore the network.</h3></div><span class="badge violet" id="table-count"></span></div><div class="table-controls"><input id="node-search" type="search" placeholder="Search project, Manager, mission…" aria-label="Search nodes"><select id="node-filter" aria-label="Filter node type"><option value="all">All node roles</option><option>Participant</option><option>Validator</option><option>Full verification node</option><option>Root participant</option></select></div><div class="table-scroll"><table><caption class="fine muted" style="text-align:left;padding:8px">All ages, costs, progress and policy values below are simulated.</caption><thead><tr>${[
    ["id", "Node"],
    ["project", "Project"],
    ["category", "Category"],
    ["manager", "Manager"],
    ["status", "Status"],
    ["age", "Age (days)"],
    ["agents", "Agents"],
    ["mission", "Current mission"],
    ["progress", "Progress %"],
    ["tasks", "Tasks"],
    ["collaborations", "Collaborations"],
    ["cost", "AI cost ($)"],
    ["policy", "Policy"],
    ["score", "Evaluation %"],
    ["last", "Activity (min)"],
  ]
    .map(
      ([key, label]) =>
        `<th><button data-sort="${key}">${label} ↕</button></th>`,
    )
    .join(
      "",
    )}</tr></thead><tbody id="node-table"></tbody></table></div></section><section class="walkthrough panel"><div class="section-head"><div><p class="eyebrow">MANAGER-TO-MANAGER COLLABORATION</p><h3>From a scoped request to a verifiable receipt.</h3></div><span class="badge violet" id="collab-step"></span></div><div class="collab-flow"><div>Store Manager<br><small>Own AI team</small></div><span>↔</span><div>Translation Manager<br><small>Own AI team</small></div><span>→</span><div>Verification<br><small>Selected records only</small></div></div><p id="collab-message" class="collab-message" aria-live="polite"></p><div class="ledger-row">${["Agreement", "Delivery receipt", "Accepted update"].map((l, i) => `<div class="ledger-block" data-ledger="${i}"><small>BLOCK 00${i + 1} ← previous hash</small><strong>${l}</strong></div>`).join("")}</div><div class="controls"><button id="collab-prev">← Previous</button><button id="collab-play">▷ Play</button><button id="collab-next">Next →</button><button id="collab-reset">↺ Restart</button></div><p class="fine muted" style="margin-top:16px">All records are conceptual. Requirements, conversations, customer data and source code stay off-chain.</p></section>`;
}
function privacy() {
  return `${head("PRIVACY", "Your perspective. Your information.", "Public demo data and real inquiries are handled separately.")}<article class="privacy-copy panel" style="padding:30px"><h2>What is collected</h2><p>Contact inquiries contain name, email, subject and message. Applications additionally contain country, city, selected contributor types and a short introduction. We request consent to store and respond to these details. Addresses are self-reported and not verified.</p><h2>Storage & access</h2><p>Real submissions use the configured Neon database and are accessible only through an administrator-authorized endpoint. They are never included in the public simulations. A daily salted IP hash is retained for inquiry abuse prevention; community sign-in uses a separate hourly limiter with a salted IP hash; raw IP addresses are not stored by the form. Infrastructure providers may process technical request data.</p><h2>Your choices</h2><p>No newsletter signup or marketing consent is implied. For access, correction or deletion requests, contact williamkevin999999@gmail.com. Identity may need to be confirmed. We aim to remove resolved inquiries within 12 months; the operator must perform retention cleanup.</p><h2>Videos and sharing</h2><p>YouTube embeds connect to YouTube only after playback is requested. Social links open the selected third-party service. You review and publish posts yourself. No social credentials are collected.</p><h2>Real community contributions</h2><p>Discussion profiles, posts, replies and votes are public contributions stored in Neon. Your account email and session are private. Reports, posting restrictions and moderation history are restricted to administrators. Followed discussions create private in-app reply notifications, not email notifications. Posts are soft-deleted so moderators can review or restore them. Contact the founder about deletion or privacy requests.</p><h2>What is simulated</h2><p>Organization activity, projects, learning scores, cost estimates and blockchain data are examples. Public simulations do not call AI providers, train policies, execute real work or write operational records. Community account authentication is real and separate from the simulations. Operational AI execution, training and project deployment are removed.</p></article>`;
}
const pages = {
  "/": dashboard,
  "/idea/": idea,
  "/looking-for/": recruitment,
  "/root-somas/": () =>
    `${head("ROOT SOMAS / ORGANIZATION EXPLORER", "Meet your intelligent organization.", "One Manager. Distinct specialists. A permanent mission.")}${organizationMarkup()}${projectLab()}`,
  "/network/": network,
  "/videos/": videoPage,
  "/contact/": () => contact(false),
  "/join/": () => contact(true),
  "/privacy/": privacy,
  "/discussions/": communityMarkup,
  "/account/": communityMarkup,
  "/workspace.html/": communityMarkup,
  "/workspace/": communityMarkup,
  "/submissions/": () =>
    `${head("AUTHORIZED ADMINISTRATORS ONLY", "Private submissions.", "Existing SOMAS session and administrator identity required.")}<button class="secondary" id="load-submissions">Load inquiries</button><p id="admin-status" role="status"></p><div id="submissions-list" class="applications-list"></div><button id="more-submissions" class="secondary" hidden>Load more</button>`,
};
$("#content").innerHTML = (
  path.startsWith("/discussions/") ? communityMarkup : pages[path] || dashboard
)();
if ($("#community-root")) {
  document.querySelector(".concept-label").textContent = "◈ REAL COMMUNITY";
  mountCommunity();
}
if (path === "/") communityPreview();
if (current) document.title = current[1] + " — OUR FUTURE WITH AI";
if (path === "/") {
  const slides = nav.slice(1).map((n, i) => ({
    ...{ url: n[0], name: n[1] },
    art: [
      "education",
      "business",
      "saas",
      "marketplace",
      "hotel",
      "business",
      "booking",
    ][i],
    caption: [
      "Multi-agent. Self-organizing. Individually trainable.",
      "Bring your expertise, curiosity, or support.",
      "Watch instructions, reports, and evaluated improvements.",
      "Explore independent Managers and selected verification records.",
      "See the founder-supplied vision films.",
      "Discuss real ideas with the community.",
      "A useful insight can change what comes next.",
    ][i],
  }));
  let slide = 0;
  const show = () => {
    const s = slides[slide];
    $("#carousel-image").innerHTML =
      `<img src="/exhibition/art/${s.art}.svg" alt="${s.name} concept illustration" width="760" height="400">`;
    $("#carousel-copy").innerHTML =
      `<p class="eyebrow">EXPLORE / 0${slide + 1}</p><h2>${s.name}</h2><p>${s.caption}</p><a href="${s.url}" class="primary">Open page ↗</a>`;
    $("#carousel-dots").innerHTML = slides
      .map(
        (s, i) =>
          `<button aria-label="Show ${s.name}" aria-pressed="${slide === i}" class="${slide === i ? "active" : ""}" data-slide="${i}"></button>`,
      )
      .join("");
    document.querySelectorAll("[data-slide]").forEach(
      (b) =>
        (b.onclick = () => {
          slide = Number(b.dataset.slide);
          show();
        }),
    );
  };
  $("#prev-slide").onclick = () => {
    slide = (slide + slides.length - 1) % slides.length;
    show();
  };
  $("#next-slide").onclick = () => {
    slide = (slide + 1) % slides.length;
    show();
  };
  $("#carousel").addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      slide =
        (slide + (e.key === "ArrowRight" ? 1 : slides.length - 1)) %
        slides.length;
      show();
    }
  });
  let start;
  $("#carousel").addEventListener(
    "touchstart",
    (e) => (start = e.touches[0].clientX),
    { passive: true },
  );
  $("#carousel").addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - start;
      if (Math.abs(dx) > 45) {
        slide = (slide + (dx < 0 ? 1 : slides.length - 1)) % slides.length;
        show();
      }
    },
    { passive: true },
  );
  show();
}
if (path === "/root-somas/") mountOrganization();
if ($("#goal-demo")) {
  let chosen =
      scenarios.find(
        (s) => s.id === new URLSearchParams(location.search).get("scenario"),
      ) || scenarios[0],
    stage = 0,
    run = false,
    timer,
    custom = null;
  const messages = [
    "Root reviews your requirement and provisions an illustrative customer instance.",
    "A dedicated Customer Manager is configured around your mission.",
    "The Customer Manager selects specialists for this particular goal.",
    "A first application preview is prepared.",
    "The Manager identifies a gap against the permanent mission.",
    "Specialists implement an example improvement.",
    "QA and the Virtual Customer evaluate the change.",
    "The application improves, then the Manager reassesses the original goal.",
  ];
  function show() {
    const goal = custom || chosen.goal;
    $("#goal-input").value = goal;
    document.querySelectorAll("[data-scenario]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.scenario === chosen.id);
      b.setAttribute("aria-pressed", String(b.dataset.scenario === chosen.id));
    });
    $("#manager-reply").textContent =
      "Customer Manager: “" +
      (stage < 2
        ? "I’ll shape an organization around this mission."
        : stage < 5
          ? "I’m comparing the current application with your original goal."
          : "We have an evaluated improvement. The mission continues.") +
      "”";
    $("#customer-team").innerHTML = [
      ["manager", chosen.brand + " Manager"],
      ...chosen.team.map((id) => [id, agents.find((a) => a.id === id).name]),
    ]
      .map(
        ([id, n]) =>
          `<span><img src="/exhibition/avatars/${id}.svg" alt="">${n}</span>`,
      )
      .join("");
    $("#provisioning").textContent = messages[Math.min(stage, 2)];
    $("#app-domain").textContent =
      chosen.brand.toLowerCase() + ".example · non-live preview";
    const v = Math.min(3, Math.floor(stage / 2));
    $("#customer-preview").className = "customer-app-inner " + chosen.id;
    $("#customer-preview").style.setProperty("--customer", chosen.color);
    $("#customer-preview").style.setProperty(
      "--customer-tint",
      chosen.color + "22",
    );
    $("#customer-preview").innerHTML =
      `<div class="customer-nav"><strong>${chosen.brand}</strong><span>${stage < 3 ? "CONCEPT" : chosen.sections.join(" · ")}</span></div><img class="customer-hero-art" src="/exhibition/art/${chosen.id}.svg" alt="${chosen.title} application concept"><h3>${chosen.headline}</h3><span class="sample-cta">${chosen.cta} ↗</span><div class="customer-content">${chosen.sections
        .slice(0, stage < 3 ? 1 : stage < 5 ? 2 : 3)
        .map((s, i) => `<span>${s}${v >= 2 ? " ✓" : ""}</span>`)
        .join(
          "",
        )}</div>${stage >= 6 ? '<p class="fine" style="margin-top:15px">' + esc(chosen.stages[3]) + " · illustrative evaluation</p>" : ""}`;
    $("#customer-version").textContent = "v" + (v + 1) + " · DEMO";
    $("#evolution-track").innerHTML = chosen.stages
      .map(
        (s, i) =>
          `<button data-evo="${i * 2}" class="${v === i ? "selected" : ""}">${i + 1}. ${s}</button>`,
      )
      .join("");
    document.querySelectorAll("[data-evo]").forEach(
      (b) =>
        (b.onclick = () => {
          run = false;
          clearTimeout(timer);
          stage = Number(b.dataset.evo);
          show();
        }),
    );
    $("#customer-event").textContent =
      String(stage + 1).padStart(2, "0") + " / 08 · " + messages[stage];
    $("#evolution-play").textContent = run
      ? "Ⅱ Pause evolution"
      : "▷ Play evolution";
    $("#evolution-prev").disabled = stage === 0;
    $("#evolution-next").disabled = stage === 7;
  }
  function schedule() {
    clearTimeout(timer);
    if (run)
      timer = setTimeout(() => {
        if (stage < 7) {
          stage++;
          show();
          schedule();
        } else {
          run = false;
          show();
        }
      }, 2600);
  }
  document.querySelectorAll("[data-scenario]").forEach(
    (b) =>
      (b.onclick = () => {
        chosen = scenarios.find((s) => s.id === b.dataset.scenario);
        custom = null;
        stage = 0;
        run = false;
        clearTimeout(timer);
        show();
      }),
  );
  $("#goal-demo").onsubmit = (e) => {
    e.preventDefault();
    const value = $("#goal-input").value.trim();
    if (value.length < 8) return;
    const rules = [
      ["store", /cloth|store|fashion|shop/i],
      ["restaurant", /restaurant|café|cafe|food/i],
      ["education", /school|learn|educat/i],
      ["hotel", /hotel|stay|guest/i],
      ["marketplace", /marketplace|maker/i],
      ["booking", /appoint|book|salon/i],
      ["business", /business|operation/i],
    ];
    const match = rules.find(([, r]) => r.test(value));
    chosen = scenarios.find((s) => s.id === (match?.[0] || "saas"));
    custom = value;
    stage = 0;
    run = true;
    show();
    schedule();
  };
  $("#evolution-play").onclick = () => {
    if (stage === 7) stage = 0;
    run = !run;
    show();
    schedule();
  };
  $("#evolution-next").onclick = () => {
    run = false;
    stage = Math.min(7, stage + 1);
    show();
    schedule();
  };
  $("#evolution-prev").onclick = () => {
    run = false;
    stage = Math.max(0, stage - 1);
    show();
    schedule();
  };
  $("#evolution-reset").onclick = () => {
    stage = 0;
    run = false;
    show();
    schedule();
  };
  show();
}
if ($("#policy-chart")) {
  const stages = [
    [
      "Experience history",
      "An agent collects evaluated examples from its own tasks. Experience alone does not change active weights.",
      "v1.0 active",
    ],
    [
      "Candidate policy",
      "A separate candidate is proposed. The active policy stays unchanged.",
      "Candidate v1.1",
    ],
    [
      "Training",
      "Illustrative training uses approved, labeled examples. No real neural optimization runs in this demo.",
      "Candidate only",
    ],
    [
      "Independent evaluation",
      "Holdout evaluation checks whether the candidate improves decisions without unacceptable regressions.",
      "Evaluation gate",
    ],
    [
      "Approved policy version",
      "The concept includes explicit approval, a version history, and rollback before a new policy becomes active.",
      "Illustrative v1.1 approved",
    ],
  ];
  const show = (i) => {
    const s = stages[i];
    $("#policy-title").textContent = s[0];
    $("#policy-detail").textContent = s[1];
    $("#policy-version").textContent = s[2];
    $("#policy-chart").innerHTML = chart(
      [48, 53, 57, 62, 68, 74, 79].map((v, j) => (j <= i + 2 ? v : 48)),
      "Illustrative holdout scores",
    );
    document
      .querySelectorAll("[data-policy]")
      .forEach((b) =>
        b.classList.toggle("selected", Number(b.dataset.policy) === i),
      );
  };
  document
    .querySelectorAll("[data-policy]")
    .forEach((b) => (b.onclick = () => show(Number(b.dataset.policy))));
  show(0);
}
if (path === "/network/") {
  let sort = "id",
    asc = true;
  const details = (id) => {
    const n = nodes.find((x) => x.id === id);
    $("#network-detail").innerHTML =
      `<p class="eyebrow">INDEPENDENT SOMAS ORGANIZATION</p><h3>${esc(n.project)}</h3><span class="badge violet">${n.type}</span><div class="node-tags"><span>${n.agents} agents</span><span>${n.manager}</span><span>${n.status}</span></div><p>${n.mission}</p><dl><dt>Owner authority</dt><dd>Separate identity, mission, team and private memory.</dd><dt>Network responsibility</dt><dd>${n.type === "Validator" ? "Eligible consensus verification in this example." : "Participation does not grant consensus authority."}</dd><dt>Illustrative policy</dt><dd>${n.policy} · ${n.score}% sample evaluation</dd></dl><p class="fine">No real blockchain or transactions are connected.</p>`;
    document
      .querySelectorAll("[data-node]")
      .forEach((b) => b.classList.toggle("active", b.dataset.node === id));
  };
  document
    .querySelectorAll("[data-node]")
    .forEach((b) => (b.onclick = () => details(b.dataset.node)));
  const render = () => {
    const search = $("#node-search").value.toLowerCase(),
      filter = $("#node-filter").value;
    const filtered = nodes
      .filter(
        (n) =>
          (filter === "all" || n.type === filter) &&
          [n.project, n.manager, n.category, n.mission, n.id]
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .sort((a, b) => {
        const av = a[sort],
          bv = b[sort];
        return (
          (typeof av === "number" || sort === "cost"
            ? Number(av) - Number(bv)
            : String(av).localeCompare(String(bv))) * (asc ? 1 : -1)
        );
      });
    $("#table-count").textContent = filtered.length + " / 20 nodes";
    $("#node-table").innerHTML =
      filtered
        .map(
          (n) =>
            `<tr><td><button data-detail="${n.id}">${n.id} ↗</button></td>${["project", "category", "manager", "status", "age", "agents", "mission", "progress", "tasks", "collaborations", "cost", "policy", "score", "last"].map((k) => `<td>${esc(n[k])}</td>`).join("")}</tr>`,
        )
        .join("") ||
      '<tr><td colspan="15">No matching example nodes.</td></tr>';
    document.querySelectorAll("[data-detail]").forEach(
      (b) =>
        (b.onclick = () => {
          details(b.dataset.detail);
          $("#network-detail").scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
            block: "center",
          });
        }),
    );
    document
      .querySelectorAll("[data-sort]")
      .forEach((b) =>
        b.parentElement.setAttribute(
          "aria-sort",
          b.dataset.sort === sort ? (asc ? "ascending" : "descending") : "none",
        ),
      );
  };
  $("#node-search").oninput = render;
  $("#node-filter").onchange = render;
  document.querySelectorAll("[data-sort]").forEach(
    (b) =>
      (b.onclick = () => {
        asc = sort === b.dataset.sort ? !asc : true;
        sort = b.dataset.sort;
        render();
      }),
  );
  const charts = {
    growth: [5, 7, 8, 11, 14, 17, 20],
    transactions: [0, 0, 1, 1, 2, 2, 3],
    collaborations: [0, 0, 0, 1, 1, 1, 1],
  };
  document.querySelectorAll("[data-chart]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-chart]")
          .forEach((x) => x.classList.toggle("selected", x === b));
        const values = charts[b.dataset.chart];
        $("#network-chart").innerHTML = chart(
          values,
          b.textContent + " — example records",
          "#9470cf",
        );
      }),
  );
  $("#network-chart").innerHTML = chart(
    charts.growth,
    "Example node growth",
    "#9470cf",
  );
  details(nodes[0].id);
  render();
  let step = 0,
    run = false,
    timer;
  const show = () => {
    const e = networkSteps[step];
    $("#collab-step").textContent = String(step + 1).padStart(2, "0") + " / 24";
    $("#collab-message").textContent =
      e.actor + " → " + e.title + ". " + e.detail;
    document
      .querySelectorAll("[data-ledger]")
      .forEach((b, i) => b.classList.toggle("ready", step >= [7, 15, 20][i]));
    $("#collab-play").textContent = run ? "Ⅱ Pause" : "▷ Play";
    $("#collab-prev").disabled = step === 0;
    $("#collab-next").disabled = step === 23;
    const peer =
      step < 8
        ? nodes[0]
        : step < 14
          ? nodes[1]
          : step < 18
            ? nodes[0]
            : nodes[2];
    const net = $(".network-links");
    net.querySelectorAll(".network-packet").forEach((p) => p.remove());
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const from = step % 2 ? 2 : 1,
        to = step >= 18 ? 0 : step % 2 ? 1 : 2;
      const point = (i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        return [300 + 204 * Math.cos(a), 210 + 138.6 * Math.sin(a)];
      };
      const a = point(from),
        b = point(to);
      const c = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      c.setAttribute("class", "network-packet");
      c.setAttribute("r", "4");
      c.setAttribute("fill", "#8b5cf6");
      c.innerHTML =
        '<animateMotion dur="1.15s" path="M' +
        a.join(" ") +
        " Q300 210 " +
        b.join(" ") +
        '" fill="freeze"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="1.15s" fill="freeze"/>';
      net.append(c);
    }
    document
      .querySelectorAll("[data-node]")
      .forEach((b) => b.classList.toggle("active", b.dataset.node === peer.id));
  };
  const schedule = () => {
    clearTimeout(timer);
    if (run)
      timer = setTimeout(() => {
        if (step < 23) {
          step++;
          show();
          schedule();
        } else {
          run = false;
          show();
        }
      }, 2200);
  };
  $("#collab-play").onclick = () => {
    if (step === 23) step = 0;
    run = !run;
    show();
    schedule();
  };
  $("#collab-next").onclick = () => {
    run = false;
    step = Math.min(23, step + 1);
    show();
    schedule();
  };
  $("#collab-prev").onclick = () => {
    run = false;
    step = Math.max(0, step - 1);
    show();
    schedule();
  };
  $("#collab-reset").onclick = () => {
    run = false;
    step = 0;
    show();
    schedule();
  };
  show();
}
if ($("#public-form")) {
  const form = $("#public-form"),
    join = form.dataset.kind === "join",
    selectedRole = new URLSearchParams(location.search).get("role");
  if (join)
    form
      .querySelectorAll("[name=roles]")
      .forEach((c) => (c.checked = c.value === selectedRole));
  let id = crypto.randomUUID();
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form),
      p = Object.fromEntries(fd);
    if (join) {
      p.roles = fd.getAll("roles");
      if (!p.roles.length) {
        $("#form-message").textContent =
          "Choose at least one contributor type.";
        $("#form-message").classList.add("error");
        return;
      }
    }
    p.consent = fd.has("consent");
    p.id = id;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    $("#form-message").textContent = "Saving your inquiry securely…";
    $("#form-message").classList.remove("error");
    try {
      const r = await fetch("/api/public/" + form.dataset.kind, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-somas-request": "1" },
        body: JSON.stringify(p),
      });
      const data = await r.json();
      if (!r.ok || data.saved !== true)
        throw Error(
          data.error === "daily_limit_reached"
            ? "Daily submission limit reached. Please use the email link."
            : data.error === "already_submitted"
              ? "This submission was already received. Use a new message for a follow-up."
              : "Submission is unavailable. Please email the founder; your message has not been confirmed.",
        );
      $("#form-message").textContent =
        "Thank you. Your " +
        (join ? "application" : "message") +
        " has been saved privately for review.";
      form.reset();
      id = crypto.randomUUID();
    } catch (e) {
      $("#form-message").classList.add("error");
      $("#form-message").textContent =
        e instanceof SyntaxError
          ? "Submission is unavailable. Please email the founder; your message has not been confirmed."
          : e.message;
    } finally {
      submit.disabled = false;
    }
  };
}
document.querySelectorAll("[data-video]").forEach(
  (b) =>
    (b.onclick = () => {
      const f = document.createElement("iframe");
      f.className = "video-frame";
      f.src =
        "https://www.youtube-nocookie.com/embed/" +
        b.dataset.video +
        "?autoplay=1";
      f.title = "SOMAS vision film";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      b.replaceWith(f);
    }),
);
if (path === "/submissions/") {
  let cursor = null;
  const load = async () => {
    const b = $("#load-submissions");
    b.disabled = true;
    try {
      const r = await fetch(
        "/api/admin/submissions" +
          (cursor ? "?before=" + encodeURIComponent(cursor) : ""),
        { headers: { "x-somas-request": "1" }, credentials: "same-origin" },
      );
      const data = await r.json();
      if (!r.ok)
        throw Error(
          r.status === 401
            ? "Sign in through the community account page first."
            : r.status === 403
              ? "This account is not the configured administrator."
              : "Submissions are unavailable. Check the migration and database connection.",
        );
      $("#admin-status").textContent =
        data.submissions.length +
        " records loaded. Private administrator view.";
      for (const record of data.submissions) {
        const article = document.createElement("article");
        article.className = "panel";
        const h = document.createElement("h3");
        h.textContent = record.kind + " · " + record.payload.name;
        const info = document.createElement("p");
        info.className = "fine muted";
        info.textContent =
          record.payload.email +
          " · " +
          new Date(record.created_at).toLocaleString();
        const text = document.createElement("p");
        text.className = "application-message fine";
        text.textContent = Object.entries(record.payload)
          .filter(([k]) => !["name", "email", "consent"].includes(k))
          .map(([k, v]) => k + ": " + (Array.isArray(v) ? v.join(", ") : v))
          .join("\n");
        article.append(h, info, text);
        $("#submissions-list").append(article);
      }
      cursor = data.next;
      $("#more-submissions").hidden = !cursor;
    } catch (e) {
      $("#admin-status").textContent =
        e instanceof SyntaxError
          ? "The private submission API is unavailable in this preview."
          : e.message;
    } finally {
      b.disabled = false;
    }
  };
  $("#load-submissions").onclick = () => {
    cursor = null;
    $("#submissions-list").replaceChildren();
    load();
  };
  $("#more-submissions").onclick = load;
}
const share = $("#share-dialog");
document
  .querySelectorAll("[data-share]")
  .forEach((b) => (b.onclick = () => share.showModal()));
share.querySelector(".dialog-close").onclick = () => share.close();
const shareURL = location.origin;
$("#share-text").value =
  "OUR FUTURE WITH AI — Imagine your own self-organizing AI organization, and a network connecting independent teams. Explore the SOMAS concept: " +
  shareURL;
$("#fb-share").href =
  "https://www.facebook.com/sharer/sharer.php?u=" +
  encodeURIComponent(shareURL);
const copy = async () => {
  try {
    await navigator.clipboard.writeText($("#share-text").value);
    $("#share-status").textContent =
      "Copied. Review and publish in your chosen platform.";
  } catch {
    $("#share-text").focus();
    $("#share-text").select();
    $("#share-status").textContent =
      "Use Command+C or Ctrl+C to copy the selected post.";
  }
};
$("#copy-share").onclick = copy;
$("#native-share").onclick = async () => {
  if (!navigator.share) return copy();
  try {
    await navigator.share({
      title: "OUR FUTURE WITH AI — SOMAS",
      text: $("#share-text").value,
      url: shareURL,
    });
  } catch (e) {
    if (e.name !== "AbortError") copy();
  }
};
