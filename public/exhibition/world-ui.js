import { datasetMarkup } from "./dataset-ui.js";
import { activityAt, STEP_MS } from "./activity.js";
import { inquiryId } from "./identity.js";
import {
  actors,
  cycle,
  worlds,
  organizations,
  phaseAt,
  networkCycle,
} from "./world-data.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const title = (tag, h, sub) =>
  ``;
const stage = (kind) =>
  `<div class="world-canvas" data-world="${kind}" tabindex="0" aria-label="3D scene. Drag to orbit; use buttons or keyboard to navigate."><span class="scene-loading">Preparing your world…</span></div>`;
const transport = (fast = false) =>
  `<div class="world-transport"><button data-control="play">Ⅱ Pause</button><button data-control="replay">↺ Replay</button><button data-control="previous" aria-label="Previous event">←</button><button data-control="next" aria-label="Next event">→</button><label>Speed <select id="world-speed"><option value="0.5">0.5×</option><option value="1" ${fast ? "" : "selected"}>1×</option><option value="2">2×</option><option value="5" ${fast ? "selected" : ""}>5×</option></select></label><div class="transport-spacer"></div><button data-control="zoom-in" aria-label="Zoom in">＋</button><button data-control="zoom-out" aria-label="Zoom out">−</button><button data-control="pan-left" aria-label="Pan left">⇤</button><button data-control="pan-right" aria-label="Pan right">⇥</button><button data-control="reset">Reset camera</button></div>`;
export function designedPage(path, original) {
  if (path === "/examples/")
    return (
      title(
        "THE SYNTHETIC EXHIBITION",
        "Many people.<br><em>Many possibilities.</em>",
        "Explore the supplied examples. None of these are real accounts or real executions.",
      ) + datasetMarkup()
    );
  if (path === "/")
    return `<section class="spatial-home"><div class="destination-stage" id="dest-stage"><button class="destination-side previous" id="dest-prev" aria-label="Previous destination"></button><article class="destination-center"><div class="destination-art" id="destination-art">${stage("headquarters")}</div><div class="destination-caption" id="destination-caption"></div></article><button class="destination-side next" id="dest-next" aria-label="Next destination"></button></div><div class="destination-options" id="destination-options"></div><aside id="exhibition-population" class="exhibition-population"></aside><div class="home-motion"><button id="preview-motion">Ⅱ Pause preview motion</button><span>← → to explore · select to enter · 7 worlds</span></div></section><section class="home-community"><div><p class="eyebrow">REAL PEOPLE. SHARED PERSPECTIVES.</p><h2>The next idea could be yours.</h2></div><a class="primary" href="/discussions/">Join the discussion ↗</a><div id="community-preview"></div></section>`;
  if (path === "/root-somas/")
    return (
      `${title("01 / SOMAS PLATFORM", "The coordination <em>campus.</em>", "Nine specialists. One Root Manager. Fast, parallel work.")}<div class="world-layout"><section class="world-stage panel"><div class="stage-caption"><span>ROOT SOMAS / HEADQUARTERS</span><span id="world-step">01 / 28</span></div>${stage("headquarters")}${transport(true)}<div class="scene-note">Drag to orbit · select a character or a name below · all activity is simulated</div></section><aside class="world-inspector panel" id="world-inspector"></aside></div><div class="actor-roster" id="actor-roster">${actors.map((a) => `<button data-actor="${a.id}" style="--actor:${a.color}"><span class="roster-dot"></span>${a.name}<small>Idle</small></button>`).join("")}</div><section class="world-evidence panel"><div class="evidence-heading"><div><p class="eyebrow">INSPECT THE PROCESS</p><h2>Every movement has a reason.</h2></div><label>Agent <select id="event-filter"><option value="all">All agents</option>${actors.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}</select></label></div><div class="cycle-strip">${["Detect", "Delegate", "Plan", "Build", "Validate", "Test", "Learn", "Review"].map((x) => `<span>${x}</span>`).join("<b>→</b>")}</div><ol id="world-events" class="world-events"></ol></section><section class="world-promise"><h2>Multi-agent. Self-organizing. Trainable.</h2><p>The mission continues after the first version. This scene demonstrates the idea; it does not run AI or train models.</p><a href="/platform/">Watch the two ideas ↗</a></section>` +
      original.slice(original.indexOf('<section class="project-lab">'))
    );
  if (path === "/network/")
    return `${title("02 / SOMAS NETWORK", "A constellation of <em>intelligence.</em>", "Modeled example organizations. Parallel exchanges. A shared verification concept.")}<div class="world-mode"><button data-mode="universe" class="selected">Universe</button><button data-mode="organization">Organization</button><button data-mode="verification">Verification</button><label>Find a goal <input id="world-search" placeholder="Restaurant, learning…"></label></div><div class="world-layout"><section class="world-stage panel"><div class="stage-caption"><span>SYNTHETIC NETWORK / PREPARING ORGANIZATIONS</span><span id="world-step">01 / 24</span></div>${stage("network")}${transport(true)}<div class="scene-note">Root coordinates the platform. Dots represent supplied synthetic organizations; positions are illustrative.</div></section><aside id="world-inspector" class="world-inspector panel"></aside></div><div class="organization-list" id="organization-list"></div><section class="world-evidence panel"><div class="evidence-heading"><h2>Work becomes inspectable evidence.</h2><span class="source-chip">NO LIVE BLOCKCHAIN</span></div><div class="verification-phases">${["Work", "Submit", "Evaluate", "Decide", "Record", "Learn"].map((x) => `<button data-phase="${x}">${x}</button>`).join("")}</div><ol id="world-events" class="world-events"></ol><p class="fine muted">Example references are replay IDs, not transaction hashes. No real consensus, signing, finality or on-chain ledger is connected.</p></section><dialog id="organization-dialog"><button class="dialog-close" aria-label="Close organization">×</button><div id="organization-content"></div></dialog>`;
  if (path === "/looking-for/")
    return `${title("BUILD THE POSSIBILITY", "Your perspective.<br><em>Our next chapter.</em>", "Choose a seat at the table.")}<section class="world-stage panel companion-stage">${stage("partners")}<span class="scene-overline">THE COLLABORATION ROOM / CONCEPT</span></section><div class="partnership-stations">${[
      [
        "Contributor",
        "Testing, writing, data, design, translation and research. Compensation is not guaranteed.",
        "Assistor / Contributor",
      ],
      [
        "Investor",
        "Explore the research vision, stage and an introduction.",
        "Investor",
      ],
      [
        "AI Engineer",
        "Bring systems, evaluation, frontend or backend craft.",
        "Engineer",
      ],

    ]
      .map(
        ([name, detail, role], i) =>
          `<article class="panel"><span class="station-number">0${i + 1}</span><h2>${name}</h2><p>${detail}</p><a class="secondary" href="/join/?role=${encodeURIComponent(role)}&interest=${encodeURIComponent(name)}">Start a conversation ↗</a></article>`,
      )
      .join(
        "",
      )}</div><p class="fine muted">Applications are real private inquiries. These are invitations to discuss, not offers of employment, investment returns or ownership.</p>`;
  if (path === "/videos/")
    return (
      `${title("THE SOMAS SCREENING ROOM", "A future.<br><em>Worth seeing.</em>", "Concept films and the founder’s original vision.")}<section class="world-stage panel companion-stage">${stage("cinema")}<span class="scene-overline">CONCEPT SCREENING ROOM</span></section>` +
      original.slice(original.indexOf('<div class="video-grid">'))
    );
  if (path === "/contact/")
    return `${title("THE RECEPTION", "Say hello.<br><em>Shape what comes next.</em>", "Messages are private. No email verification required.")}<div class="reception-layout"><section class="world-stage panel">${stage("reception")}<div class="reception-actions"><button class="primary" data-contact-tab="message">Send a message</button><button class="secondary" data-contact-tab="meeting">Request a meeting</button></div><p class="fine muted">A simulated assistant. Your submitted inquiry is real.</p><a href="/contact/">Contact the SOMAS founder ↗</a><a href="https://t.me/smartboard0x0" target="_blank" rel="noopener">Telegram @smartboard0x0 ↗</a></section><section class="form-panel panel"><div id="message-pane">${original.slice(original.indexOf('<form id="public-form"'), original.indexOf("</form>") + 7)}</div><div id="meeting-pane" hidden><h2>Request a conversation.</h2><p class="fine muted">A request for the founder to review—not a confirmed booking. Times are converted to UTC.</p><form id="meeting-form"><label>Name<input name="name" required maxlength="100" autocomplete="name"></label><label>Email<input name="email" type="email" required maxlength="180" autocomplete="email"></label><label>Purpose<textarea name="message" minlength="10" maxlength="2500" rows="3" required></textarea></label><div class="form-two"><label>Preferred date<input name="date" type="date" required></label><label>Preferred time<input name="time" type="time" required></label></div><label>Time zone<select name="timezone" id="meeting-timezone"></select></label><label class="consent"><input name="consent" type="checkbox" required>I agree to storage of this private meeting request.</label><div class="trap" aria-hidden="true"><input name="website" tabindex="-1"></div><button class="primary">Send meeting request ↗</button><p role="status" id="meeting-status"></p></form></div></section></div>`;
  return original;
}
export async function mountWorldUI(path) {
  document.body.classList.add("spatial-exhibition");
  if (["/root-somas/", "/network/"].includes(path))
    document.body.classList.add("kinetic-page");
  const hosts = [...document.querySelectorAll("[data-world]")];
  if (!hosts.length) return;
  const { createWorld } = await import("./world.js");
  let world,
    elapsed = 0,
    last = 0,
    speed = ["/root-somas/", "/network/"].includes(path) ? 5 : 1,
    playing = !reduced(),
    selected = path === "/network/" ? "root" : "manager",
    idx = 0,
    chapter = 0,
    raf;
  let trafficFlows = [],
    selectedFlow = null,
    organizationNames = new Map();
  const host = hosts[0],
    kind = host.dataset.world;
  host.querySelector(".scene-loading")?.remove();
  const total = kind === "network" ? 24 : kind === "story" ? 6 : cycle.length,
    duration =
      kind === "story" ? 4800 : kind === "headquarters" ? STEP_MS : 2100;
  const makeWorld = (type) => {
    world?.dispose();
    world = createWorld(host, {
      kind: type,
      onSelect: (id) => {
        if (id.startsWith("TX:")) {
          selectFlow(Number(id.slice(3)));
          return;
        }
        selectedFlow = null;
        if (/^SUB-/.test(id)) {
          dispatchEvent(new CustomEvent("somas:open-example", { detail: id }));
          return;
        }
        selected = id;
        world.focus(id);
        inspect();
      },
    });
  };
  makeWorld(kind);
  if (kind === "network") {
    addEventListener("somas:population", (e) => {
      organizationNames = new Map(e.detail.map((r) => [r[0], r[1]]));
      world.setPopulation(e.detail);
      const rows = e.detail.filter((r) => r[0].startsWith("SUB-")),
        count = Math.min(24, rows.length);
      if (el("#modeled-examples")) {
        el("#modeled-examples").innerHTML = Array.from(
          { length: count },
          (_, i) => rows[Math.floor((i * rows.length) / count)],
        )
          .map(
            (r) => `<button data-modeled-id="${r[0]}">${esc(r[1])} ↗</button>`,
          )
          .join("");
        el("#modeled-examples")
          .querySelectorAll("button")
          .forEach(
            (b) =>
              (b.onclick = () => {
                world.focus(b.dataset.modeledId);
                dispatchEvent(
                  new CustomEvent("somas:open-example", {
                    detail: b.dataset.modeledId,
                  }),
                );
              }),
          );
      }
      document.querySelector(".stage-caption span").textContent =
        e.detail
          .filter((r) => r[0].startsWith("SUB-"))
          .length.toLocaleString() +
        " / 10,000 PARTICIPANTS · " +
        Math.min(24, e.detail.filter((r) => r[0].startsWith("SUB-")).length) +
        " MODELED EXAMPLES";
    });
    addEventListener("somas:focus-example", (e) => world.focus(e.detail.id));
  }
  const el = (s) => document.querySelector(s);
  if (kind === "network" || kind === "headquarters")
    host.insertAdjacentHTML(
      "beforeend",
      `<div class="scene-motion-hud"><span id="scene-rate">5× / SIMULATED</span><strong id="scene-density">${kind === "network" ? "48" : "4"}</strong><small>${kind === "network" ? "parallel exchanges" : "specialists reporting"}</small></div>`,
    );
  function flowName(id) {
    return id === "root" ? "Root SOMAS" : organizationNames.get(id) || id;
  }
  function selectFlow(slot) {
    selectedFlow = trafficFlows.find((f) => f.slot === slot) || null;
    inspect();
  }
  if (kind === "network") {
    host.insertAdjacentHTML(
      "afterend",
      '<div class="flow-legend"><span><i style="background:#4385e0"></i>Instructions</span><span><i style="background:#19a59a"></i>Reports</span><span><i style="background:#9570d0"></i>Verification</span><span><i style="background:#deaa60"></i>Receipts</span><b id="flow-counter">Preparing example exchanges…</b></div><details class="modeled-samples"><summary>Explore the modeled 3D organizations</summary><div id="modeled-examples"></div></details>',
    );
    document
      .querySelector(".world-layout")
      .insertAdjacentHTML(
        "afterend",
        '<section class="traffic-feed panel"><div><p class="eyebrow">SIMULATED PARALLEL EXCHANGES</p><h2>Many teams. Many conversations.</h2><p class="fine muted">Select a moving packet or an exchange below. These are concept transactions, not real blockchain activity.</p></div><div id="traffic-stream" aria-label="Simulated network exchanges"></div></section>',
      );
    host.addEventListener("somas:traffic", (e) => {
      trafficFlows = e.detail.flows;
      if (el("#scene-density"))
        el("#scene-density").textContent = trafficFlows.length;
      el("#flow-counter").textContent =
        trafficFlows.length + " concurrent simulated lanes";
      el("#traffic-stream").innerHTML = trafficFlows
        .slice(0, 6)
        .map(
          (f) =>
            `<button data-flow-slot="${f.slot}" style="--flow:${f.color}"><i></i><span><strong>${f.label}</strong><small>${esc(flowName(f.from))} → ${esc(flowName(f.to))}</small></span><b>↗</b></button>`,
        )
        .join("");
      el("#traffic-stream")
        .querySelectorAll("button")
        .forEach((b) => (b.onclick = () => selectFlow(+b.dataset.flowSlot)));
    });
  }
  function inspect() {
    if (!el("#world-inspector")) return;
    if (kind === "network" && selectedFlow) {
      const f = selectedFlow;
      el("#world-inspector").innerHTML =
        `<p class="eyebrow">EXCHANGE INSPECTOR</p><div class="flow-inspector-art" style="--flow:${f.color}"><span>◉</span><i>→</i><span>◉</span></div><h2>${f.label}</h2><span class="source-chip">SIMULATED / VISUAL SCENARIO</span><dl><dt>Scenario reference</dt><dd>${f.id}</dd><dt>Origin</dt><dd>${esc(flowName(f.from))}<br>${f.from}</dd><dt>Destination</dt><dd>${esc(flowName(f.to))}<br>${f.to}</dd><dt>Meaning</dt><dd>One example organization exchanges a scoped ${f.label.toLowerCase()} with another organization or Root.</dd><dt>Provenance</dt><dd>Generated choreography using supplied organization identities. Not a source task/claim join, a signed transaction or real finality.</dd></dl><div class="flow-detail-actions"><button class="secondary" id="flow-origin">Inspect organization ↗</button><button class="secondary" id="flow-back">Back to Root</button></div>`;
      el("#flow-origin").onclick = () => {
        if (f.from.startsWith("SUB-"))
          dispatchEvent(
            new CustomEvent("somas:open-example", { detail: f.from }),
          );
        else if (f.to.startsWith("SUB-"))
          dispatchEvent(
            new CustomEvent("somas:open-example", { detail: f.to }),
          );
      };
      el("#flow-back").onclick = () => {
        selectedFlow = null;
        selected = "root";
        world.focus("root");
        inspect();
      };
      return;
    }
    const net = kind === "network",
      a =
        (net ? organizations : actors).find((x) => x.id === selected) ||
        (net ? organizations[0] : actors[0]);
    const e = cycle[idx % cycle.length],
      active = e.actor === a.id;
    const liveActivity = activityAt(elapsed)[a.id];
    el("#world-inspector").innerHTML =
      `<p class="eyebrow">${net ? "ORGANIZATION" : "AGENT"} / INSPECTOR</p><div class="identity-sculpture" style="--identity:${a.color}"><span>${a.name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join(
          "",
        )}</span><i></i></div><h2>${esc(a.name)}</h2><p class="fine muted">${esc(a.role)}</p><span class="source-chip">${net ? phaseAt(idx) : liveActivity?.state || (active ? e.state : "Idle")} · SIMULATED</span><p>${esc(a.goal)}</p><dl><dt>${net ? "Identity" : "Membership"}</dt><dd>${net ? "DEMO-" + a.id.toUpperCase() : "Root SOMAS / " + (a.id === "manager" ? "Service coordinator" : "Reports to Root Manager")}</dd><dt>Demo age from creation</dt><dd id="actor-age"></dd><dt>Sample evaluation metric</dt><dd>${a.score + (idx >= 21 ? 3 : 0)} / 100 <small>Illustrative task rubric</small></dd><dt>History</dt><dd>${a.score - 4} → ${a.score} ${idx >= 21 ? "→ " + (a.score + 3) : ""} · sample points</dd><dt>Current activity</dt><dd>${net ? esc(networkCycle[idx].origin + " → " + networkCycle[idx].detail) : esc(liveActivity?.detail || (active ? e.detail : "Available for a scoped assignment."))}</dd><dt>Provider / measured spend</dt><dd>None connected / $0 AI calls</dd></dl>${net ? '<button class="primary" id="enter-organization">Enter organization ↗</button>' : '<button class="secondary" id="follow-actor">Follow agent</button>'}<p class="fine muted">Browser-local example. No AI execution, training or live ledger.</p>`;
    if (net)
      el("#enter-organization").onclick = () => {
        const d = el("#organization-dialog");
        el("#organization-content").innerHTML =
          `<p class="eyebrow">SIMULATED SUB-SOMAS / PUBLIC EXAMPLE</p><h2>${esc(a.name)}</h2><p>${esc(a.goal)}</p><h3>${esc(a.name)} Manager</h3><p>This Manager serves this organization’s mission. Root Manager serves the SOMAS platform.</p><div class="sub-team">${["Manager", "Research specialist", "Builder", "Virtual Customer"].map((n) => `<div><span>◉</span><strong>${n}</strong><small>Demo team member</small></div>`).join("")}</div><p class="fine muted">No private owner records are shown. This is a public concept organization.</p>`;
        d.showModal();
      };
    else el("#follow-actor").onclick = () => world.focus(a.id, true);
    age();
  }
  function age() {
    const n = el("#actor-age");
    if (n) {
      const a =
        (kind === "network" ? organizations : actors).find(
          (x) => x.id === selected,
        ) || (kind === "network" ? organizations[0] : actors[0]);
      n.textContent =
        Math.max(
          0,
          Math.floor((Date.now() - Date.parse(a.created)) / 1000),
        ).toLocaleString() + " seconds · example identity";
    }
  }
  function updateUI() {
    if (el("#world-step"))
      el("#world-step").textContent =
        String(idx + 1).padStart(2, "0") + " / " + total;
    const e = cycle[idx % cycle.length];
    if (kind === "headquarters" && el("#scene-density"))
      el("#scene-density").textContent = Object.values(
        activityAt(elapsed),
      ).filter((a) => a.state === "report").length;
    document.querySelectorAll("[data-actor]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.actor === selected);
      b.querySelector("small").textContent =
        activityAt(elapsed)[b.dataset.actor]?.state || "Idle";
    });
    if (el("#world-events")) {
      const filter = el("#event-filter")?.value || "all";
      el("#world-events").innerHTML =
        Array.from({ length: idx + 1 }, (_, i) => i)
          .filter(
            (i) =>
              kind === "network" ||
              filter === "all" ||
              cycle[i].actor === filter,
          )
          .slice(-5)
          .reverse()
          .map((i) => {
            const ev = cycle[i];
            return `<li><button data-event="${i}"><span>${String(i + 1).padStart(2, "0")}</span><div><strong>${kind === "network" ? esc(networkCycle[i].phase + " / " + networkCycle[i].title) : esc(ev.title)}</strong><small>${kind === "network" ? esc(networkCycle[i].reference + " · " + networkCycle[i].origin + " · " + networkCycle[i].detail) : esc(ev.detail) + " · " + ev.evidence}</small></div><time>+${((i * duration) / 1000).toFixed(1)}s</time></button></li>`;
          })
          .join("") || "<li>No events for this agent yet.</li>";
      el("#world-events")
        .querySelectorAll("[data-event]")
        .forEach(
          (b) =>
            (b.onclick = () => {
              idx = +b.dataset.event;
              elapsed = idx * duration;
              selected = kind === "network" ? selected : cycle[idx].actor;
              world.focus(selected);
              playing = false;
              updateUI();
            }),
        );
    }
    document
      .querySelectorAll("[data-phase]")
      .forEach((b) =>
        b.classList.toggle("selected", b.dataset.phase === phaseAt(idx)),
      );
    if (kind === "story") {
      const titles = chapter
        ? [
            "Independent organizations.",
            "Complete the work.",
            "Submit evidence.",
            "Verify against a rule.",
            "Record the decision.",
            "Learn from the outcome.",
          ]
        : [
            "Set a goal.",
            "Build an organization.",
            "Work together.",
            "Test the experience.",
            "Learn from results.",
            "Keep improving.",
          ];
      el("#story-caption").textContent = titles[idx];
      el("#story-counter").textContent = "0" + (idx + 1) + " / 06";
      el("#story-detail").textContent = chapter
        ? "A proposed verification protocol. Every event here is simulated."
        : [
            "Human intent sets the mission.",
            "A Manager assembles complementary specialists.",
            "Instructions out. Reports back.",
            "The Virtual Customer returns findings.",
            "An evaluated example informs a proposed policy.",
            "The mission continues beyond the first version.",
          ][idx];
    }
    document
      .querySelectorAll('[data-control="play"]')
      .forEach(
        (b) =>
          (b.textContent = playing
            ? "Ⅱ Pause"
            : idx === total - 1
              ? "↺ Replay"
              : "▷ Play"),
      );
    inspect();
  }
  if (kind === "network") {
    const render = () => {
      const q = el("#world-search").value.toLowerCase();
      el("#organization-list").innerHTML =
        organizations
          .filter((o) =>
            (o.name + " " + o.goal + " " + o.role).toLowerCase().includes(q),
          )
          .map(
            (o) =>
              `<button data-organization="${o.id}" style="--actor:${o.color}"><i></i><strong>${o.name}</strong><small>${o.role} · ${o.goal}</small></button>`,
          )
          .join("") || "<p>No matching public examples.</p>";
      el("#organization-list")
        .querySelectorAll("button")
        .forEach(
          (b) =>
            (b.onclick = () => {
              selected = b.dataset.organization;
              world.focus(selected);
              inspect();
            }),
        );
    };
    el("#world-search").oninput = () => {
      render();
      dispatchEvent(
        new CustomEvent("somas:filter-examples", {
          detail: el("#world-search").value,
        }),
      );
    };
    render();
    el("#organization-dialog .dialog-close").onclick = () =>
      el("#organization-dialog").close();
    document.querySelectorAll("[data-mode]").forEach(
      (b) =>
        (b.onclick = () => {
          world.mode(b.dataset.mode);
          document
            .querySelectorAll("[data-mode]")
            .forEach((x) => x.classList.toggle("selected", x === b));
        }),
    );
    document.querySelectorAll("[data-phase]").forEach(
      (b, i) =>
        (b.onclick = () => {
          idx = i * 4;
          elapsed = idx * duration;
          playing = false;
          updateUI();
        }),
    );
  }
  if (el("#event-filter")) el("#event-filter").onchange = updateUI;
  document.querySelectorAll("[data-actor]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.actor;
        world.focus(selected);
        updateUI();
      }),
  );
  el("#world-speed")?.addEventListener("change", (e) => {
    speed = +e.target.value;
    if (el("#scene-rate"))
      el("#scene-rate").textContent = speed + "× / SIMULATED";
  });
  document.querySelectorAll("[data-control]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = b.dataset.control;
        if (c === "play") {
          if (idx === total - 1 && !playing) {
            idx = 0;
            elapsed = 0;
          }
          playing = !playing;
        } else if (c === "replay") {
          idx = 0;
          elapsed = 0;
          playing = !reduced();
        } else if (c === "next" || c === "previous") {
          idx = Math.max(0, Math.min(total - 1, idx + (c === "next" ? 1 : -1)));
          elapsed = idx * duration;
          playing = false;
        } else if (c === "reset") world.reset();
        else if (c === "zoom-in") world.zoom(-3);
        else if (c === "zoom-out") world.zoom(3);
        else if (c === "pan-left") world.pan(-2, 0);
        else if (c === "pan-right") world.pan(2, 0);
        updateUI();
      }),
  );
  host.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "+", "-", "0"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "0") world.reset();
      else if (e.key === "+" || e.key === "-")
        world.zoom(e.key === "+" ? -2 : 2);
      else world.pan(e.key === "ArrowLeft" ? -1 : 1, 0);
    }
  });
  if (kind === "story")
    document.querySelectorAll("[data-chapter]").forEach(
      (b) =>
        (b.onclick = () => {
          chapter = +b.dataset.chapter;
          idx = 0;
          elapsed = 0;
          makeWorld(chapter ? "network" : "story");
          document
            .querySelectorAll("[data-chapter]")
            .forEach((x) => x.classList.toggle("selected", x === b));
          updateUI();
        }),
    );
  let slide = 0;
  if (path === "/") {
    const show = () => {
      const s = worlds[slide];
      makeWorld(s.type);
      el("#destination-caption").innerHTML =
        `<span class="eyebrow">0${slide + 1} / 07</span><h2>${s.name}</h2><p>${s.word}</p><a href="${s.url}" class="primary">Enter this world ↗</a>`;
      for (const [id, offset] of [
        ["#dest-prev", -1],
        ["#dest-next", 1],
      ]) {
        const n = worlds[(slide + offset + 7) % 7];
        el(id).innerHTML =
          `<span class="mini-world mini-${n.id}"><i></i><i></i><i></i><b>${n.id === "network" ? "◎" : n.id === "videos" ? "▷" : n.id === "contact" ? "✳" : "◈"}</b></span><small>${offset < 0 ? "← PREVIOUS" : "NEXT →"}</small><strong>${n.name}</strong>`;
      }
      el("#destination-options").innerHTML = worlds
        .map(
          (w, i) =>
            `<button data-destination="${i}" aria-pressed="${slide === i}" class="${slide === i ? "selected" : ""}"><span class="mini-world mini-${w.id}"><i></i><i></i><i></i><b>${["◈", "◎", "✳", "▷", "◉", "●", "↗"][i]}</b></span>${w.name}</button>`,
        )
        .join("");
      el("#destination-options")
        .querySelectorAll("button")
        .forEach(
          (b) =>
            (b.onclick = () => {
              slide = +b.dataset.destination;
              show();
            }),
        );
    };
    const step = (n) => {
      slide = (slide + n + 7) % 7;
      show();
    };
    el("#dest-prev").onclick = () => step(-1);
    el("#dest-next").onclick = () => step(1);
    el("#dest-stage").tabIndex = 0;
    el("#dest-stage").onkeydown = (e) => {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        step(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    let touch;
    el("#dest-stage").addEventListener(
      "touchstart",
      (e) => (touch = e.touches[0].clientX),
      { passive: true },
    );
    el("#dest-stage").addEventListener(
      "touchend",
      (e) => {
        const d = e.changedTouches[0].clientX - touch;
        if (Math.abs(d) > 60) step(d < 0 ? 1 : -1);
      },
      { passive: true },
    );
    el("#preview-motion").onclick = () => {
      playing = !playing;
      document.body.classList.toggle("motion-paused", !playing);
      el("#preview-motion").textContent = playing
        ? "Ⅱ Pause preview motion"
        : "▷ Play preview motion";
    };
    show();
  }
  function frame(t) {
    const dt = Math.min(80, t - (last || t));
    last = t;
    if (playing && !document.hidden) {
      elapsed += dt * speed;
      const looping = kind === "headquarters" || kind === "network";
      const n = looping
        ? Math.floor(elapsed / duration) % total
        : Math.min(total - 1, Math.floor(elapsed / duration));
      if (n !== idx) {
        idx = n;
        updateUI();
      }
      if (
        !looping &&
        path !== "/" &&
        kind !== "cinema" &&
        kind !== "partners" &&
        kind !== "reception" &&
        elapsed >= total * duration
      ) {
        playing = false;
        updateUI();
      }
    }
    world.update(
      elapsed,
      kind === "reception"
        ? { actor: "assistant", state: "celebrate" }
        : kind === "network"
          ? networkCycle[idx]
          : { ...cycle[idx % cycle.length], activeStates: activityAt(elapsed) },
      (elapsed % duration) / duration,
    );
    if (Math.floor(t / 1000) !== Math.floor((t - dt) / 1000)) age();
    raf = requestAnimationFrame(frame);
  }
  updateUI();
  raf = requestAnimationFrame(frame);
  document.body.classList.toggle("motion-paused", !playing);
  addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(raf);
      world.dispose();
    },
    { once: true },
  );
}
export function mountMeetings() {
  const form = document.querySelector("#meeting-form");
  if (!form) return;
  const z = form.querySelector("[name=timezone]");
  const zones = Intl.supportedValuesOf
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];
  z.innerHTML = ["UTC", ...zones].map((s) => `<option>${s}</option>`).join("");
  z.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  form.elements.date.min = new Date().toISOString().slice(0, 10);
  document.querySelectorAll("[data-contact-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        document.querySelector("#message-pane").hidden =
          b.dataset.contactTab !== "message";
        document.querySelector("#meeting-pane").hidden =
          b.dataset.contactTab !== "meeting";
      }),
  );
  let id = inquiryId();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const b = form.querySelector("button"),
      status = document.querySelector("#meeting-status");
    b.disabled = true;
    status.textContent = "Saving your request…";
    try {
      const p = Object.fromEntries(new FormData(form));
      const local = p.date + "T" + p.time + ":00";
      let date = new Date(local + "Z");
      for (let i = 0; i < 3; i++) {
        const parts = new Intl.DateTimeFormat("sv-SE", {
          timeZone: p.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        })
          .format(date)
          .replace(" ", "T");
        date = new Date(
          date.getTime() + (Date.parse(local + "Z") - Date.parse(parts + "Z")),
        );
      }
      const check = new Intl.DateTimeFormat("sv-SE", {
        timeZone: p.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(date)
        .replace(" ", "T");
      if (check !== local.slice(0, 16))
        throw Error(
          "This time does not exist in the selected time zone. Choose another time.",
        );
      if (date <= new Date()) throw Error("Choose a future meeting time.");
      const r = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "content-type": "application/json", "x-somas-request": "1" },
        body: JSON.stringify({
          id,
          name: p.name,
          email: p.email,
          message: p.message,
          subject: "Meeting request",
          consent: p.consent === "on",
          website: p.website,
          meeting: {
            startsAt: date.toISOString(),
            timezone: p.timezone,
            status: "requested",
          },
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.saved)
        throw Error(
          "Your request was not confirmed. Please email the founder.",
        );
      status.textContent =
        "Request saved privately for review. This is not a confirmed appointment.";
      id = inquiryId();
      form.reset();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}

export async function mountDiscussionWorld() {
  const root = document.querySelector("#community-root");
  if (!root || !document.querySelector("#discussion-category")) return;
  const section = document.createElement("section");
  section.className = "discussion-universe panel";
  section.innerHTML =
    '<div class="stage-caption"><span>THE IDEA CONSTELLATION</span><span>CONCEPT GEOMETRY / REAL DISCUSSIONS BELOW</span></div>' +
    stage("discussion") +
    '<p class="fine muted">Select a category orb to filter real conversations. Orb sizes do not represent popularity.</p>';
  const hero = root.querySelector(".community-hero");
  hero.after(section);
  const host = section.querySelector("[data-world]");
  host.querySelector(".scene-loading").remove();
  const { createWorld } = await import("./world.js");
  const w = createWorld(host, {
    kind: "discussion",
    onSelect: (id) => {
      const select = document.querySelector("#discussion-category");
      select.value =
        ["platform", "network", "ideas", "questions", "general", "bugs"][
          Number(id)
        ] || "";
      select.dispatchEvent(new Event("change"));
    },
  });
  let raf,
    last = 0,
    time = 0;
  function frame(t) {
    if (!reduced() && !document.hidden) time += Math.min(80, t - (last || t));
    last = t;
    w.update(time);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(raf);
      w.dispose();
    },
    { once: true },
  );
}
