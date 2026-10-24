import { agents, rootEvents, statusIcons } from "./data.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function organizationMarkup() {
  return `<div class="org-layout"><section class="organization panel"><div class="canvas-toolbar"><div><strong>THE LIVING ORGANIZATION</strong><small>SIMULATED INSTRUCTIONS & REPORTS</small></div><div class="controls"><button data-org="play">Ⅱ Pause</button><button data-speed="1" class="selected">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button><button data-org="restart" aria-label="Restart organization simulation">↺</button></div></div><div class="graph-window" tabindex="0" aria-label="Organization canvas. Arrow keys pan; plus and minus zoom; zero resets."><div class="graph-world"><svg class="org-lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">${[
    [180, 215],
    [820, 215],
    [120, 450],
    [880, 450],
    [365, 505],
    [635, 505],
    [500, 330],
  ]
    .map(
      ([x, y], i) =>
        `<path id="curve-${i}" d="M500 115 C500 210 ${x} ${y - 100} ${x} ${y}"/>`,
    )
    .join("")}</svg>${agents
    .map((a, i) => {
      const p = [
        [50, 17],
        [18, 36],
        [82, 36],
        [12, 75],
        [36.5, 84],
        [63.5, 84],
        [88, 75],
        [50, 55],
      ][i];
      return `<button class="agent-node ${i === 0 ? "manager-node" : ""}" data-agent="${a.id}" style="left:${p[0]}%;top:${p[1]}%;--agent:${a.color}"><img src="/exhibition/avatars/${a.id}.svg" alt="" width="72" height="72"><strong>${a.name}</strong><small>${a.role}</small><span class="agent-state">Ⅱ Idle</span></button>`;
    })
    .join(
      "",
    )}<div class="packet-label" role="status"></div></div></div><div class="canvas-tools"><button data-zoom="out" aria-label="Zoom out">−</button><span id="zoom-value">100%</span><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="fit">Fit view</button><span>Drag to pan · select an agent</span></div></section><aside class="panel inspector" id="agent-inspector"></aside></div><section class="panel event-panel"><div class="section-head"><div><p class="eyebrow">SIGNIFICANT EVENTS</p><h3>A mission that keeps moving.</h3></div><span class="badge" id="org-progress">01 / 26</span></div><ol class="event-history" id="event-history"></ol></section>`;
}
export function mountOrganization(root = document) {
  let index = 0,
    speed = 1,
    playing = !matchMedia("(prefers-reduced-motion: reduce)").matches,
    selected = "manager",
    elapsed = 0,
    last = 0,
    raf,
    zoom = 1,
    pan = { x: 0, y: 0 },
    drag = null,
    eventTime = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    history = [],
    states = Object.fromEntries(agents.map((a) => [a.id, "idle"])),
    world = root.querySelector(".graph-world"),
    win = root.querySelector(".graph-window"),
    label = root.querySelector(".packet-label");
  const svg = root.querySelector(".org-lines");
  function inspect() {
    const a = agents.find((a) => a.id === selected),
      ev = rootEvents[index];
    root.querySelector("#agent-inspector").innerHTML =
      `<p class="eyebrow">AGENT INSPECTOR</p><img class="inspector-avatar" src="/exhibition/avatars/${a.id}.svg" alt="${a.name} identity"><h3>${a.name}</h3><p class="muted">${a.role}</p><span class="status-badge">${statusIcons[states[a.id]]} ${states[a.id]}</span><p>${a.mission}</p><dl><dt>Assigned goal</dt><dd>Make SOMAS easier to understand and use.</dd><dt>Current activity</dt><dd>${esc(ev.agent === a.id ? ev.title : "Waiting for the next scoped assignment.")}</dd><dt>Time in status</dt><dd id="status-time">${Math.floor(elapsed / 1000)}s · demo time</dd><dt>Policy</dt><dd>v1.0 active · illustrative${selected === "manager" && index >= 20 ? " · v1.1 candidate awaiting approval" : ""}</dd><dt>Resource use</dt><dd>No AI calls. $0 model spend.</dd></dl><div class="policy-mini"><span>Experience → candidate → evaluation</span><div><b style="width:${Math.max(12, index * 3.5)}%"></b></div><small>Simulated policy lifecycle. No weights changed.</small></div><h4>Relevant history</h4><ul class="agent-history">${
        history
          .filter((e) => e.agent === a.id || a.id === "manager")
          .slice(-3)
          .reverse()
          .map((e) => `<li>${esc(e.title)}</li>`)
          .join("") || "<li>No assignment yet.</li>"
      }</ul>`;
  }
  function fitPaths() {
    const w = world.clientWidth,
      h = world.clientHeight,
      m = world.querySelector("[data-agent=manager]");
    const mx = (m.offsetLeft / w) * 1000,
      my = (m.offsetTop / h) * 600;
    agents.slice(1).forEach((a, i) => {
      const n = world.querySelector("[data-agent=" + a.id + "]"),
        x = (n.offsetLeft / w) * 1000,
        y = (n.offsetTop / h) * 600;
      svg
        .querySelector("#curve-" + i)
        .setAttribute(
          "d",
          `M${mx} ${my} C${mx} ${my + 100} ${x} ${y - 100} ${x} ${y}`,
        );
    });
  }
  fitPaths();
  const observer = new ResizeObserver(fitPaths);
  observer.observe(win);
  function begin() {
    const e = rootEvents[index];
    Object.keys(states).forEach(
      (id) =>
        (states[id] =
          id === "manager"
            ? "planning"
            : states[id] === "completed"
              ? "completed"
              : "idle"),
    );
    states[e.agent] = e.status;
    eventTime = elapsed;
    history.push(e);
    if (history.length > 26) history.shift();
    root.querySelectorAll("[data-agent]").forEach((b) => {
      const s = states[b.dataset.agent];
      b.classList.toggle(
        "planned-role",
        b.dataset.agent === "security" && index < 16,
      );
      b.querySelector(".agent-state").textContent =
        b.dataset.agent === "security" && index < 16
          ? "＋ specialist on demand"
          : statusIcons[s] + " " + s;
      b.classList.toggle("engaged", b.dataset.agent === e.agent);
      b.classList.toggle("chosen", b.dataset.agent === selected);
      b.classList.toggle(
        "new-role",
        b.dataset.agent === "security" && index === 16,
      );
    });
    root.querySelector("#org-progress").textContent =
      String(index + 1).padStart(2, "0") + " / 26";
    root.querySelector("#event-history").innerHTML = history
      .slice(-4)
      .reverse()
      .map(
        (e) =>
          `<li><span>${statusIcons[e.status]}</span><div><strong>${esc(e.title)}</strong><small>${esc(e.detail)}</small></div><time>${String(e.step).padStart(2, "0")}</time></li>`,
      )
      .join("");
    label.textContent =
      (e.direction === "instruction" ? "INSTRUCTION → " : "REPORT ← ") +
      e.title;
    svg.querySelectorAll(".packet").forEach((n) => n.remove());
    if (e.agent !== "manager" && !reduced) {
      const aIndex = agents.findIndex((a) => a.id === e.agent) - 1;
      for (let i = 0; i < 3; i++) {
        const c = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        c.classList.add("packet");
        c.style.opacity = "0";
        c.setAttribute("r", i === 0 ? "5" : "3");
        c.setAttribute(
          "fill",
          e.direction === "instruction" ? "#178fd6" : "#13ad98",
        );
        c.dataset.path = String(aIndex);
        c.dataset.delay = String(i * 120);
        svg.append(c);
      }
    }
    inspect();
  }
  function frame(t) {
    if (!last) last = t;
    const dt = Math.min(80, t - last);
    last = t;
    if (playing && !document.hidden) {
      elapsed += dt * speed;
      const local = elapsed - eventTime;
      svg.querySelectorAll(".packet").forEach((c) => {
        const path = svg.querySelector("#curve-" + c.dataset.path),
          p = Math.max(
            0,
            Math.min(1, (local - Number(c.dataset.delay)) / 1150),
          ),
          point = path.getPointAtLength(
            path.getTotalLength() *
              (rootEvents[index].direction === "report" ? 1 - p : p),
          );
        c.setAttribute("cx", point.x);
        c.setAttribute("cy", point.y);
        c.style.opacity = local >= Number(c.dataset.delay) && p < 1 ? "1" : "0";
      });
      const time = root.querySelector("#status-time");
      if (time) time.textContent = Math.floor(local / 1000) + "s · demo time";
      if (local >= 2700) {
        if (index < rootEvents.length - 1) {
          index++;
          begin();
        } else {
          playing = false;
          updatePlay();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function updatePlay() {
    root.querySelector("[data-org=play]").textContent = playing
      ? "Ⅱ Pause"
      : index === 25
        ? "↺ Replay"
        : "▷ Play";
  }
  root.querySelectorAll("[data-agent]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.agent;
        root
          .querySelectorAll("[data-agent]")
          .forEach((n) => n.classList.toggle("chosen", n === b));
        inspect();
      }),
  );
  root.querySelector("[data-org=play]").onclick = () => {
    if (index === 25) {
      index = 0;
      elapsed = 0;
      history.length = 0;
      begin();
    }
    playing = !playing;
    updatePlay();
  };
  root.querySelector("[data-org=restart]").onclick = () => {
    index = 0;
    elapsed = 0;
    history.length = 0;
    begin();
    playing = !reduced;
    updatePlay();
  };
  root.querySelectorAll("[data-speed]").forEach(
    (b) =>
      (b.onclick = () => {
        speed = Number(b.dataset.speed);
        root
          .querySelectorAll("[data-speed]")
          .forEach((x) => x.classList.toggle("selected", x === b));
      }),
  );
  function transform() {
    world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    root.querySelector("#zoom-value").textContent =
      Math.round(zoom * 100) + "%";
  }
  root.querySelectorAll("[data-zoom]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.zoom === "fit") {
          zoom = 1;
          pan = { x: 0, y: 0 };
        } else
          zoom = Math.max(
            0.65,
            Math.min(1.6, zoom + (b.dataset.zoom === "in" ? 0.1 : -0.1)),
          );
        transform();
      }),
  );
  win.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    drag = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    win.setPointerCapture(e.pointerId);
  });
  win.addEventListener("pointermove", (e) => {
    if (drag) {
      pan = { x: e.clientX - drag.x, y: e.clientY - drag.y };
      transform();
    }
  });
  win.addEventListener("pointerup", () => (drag = null));
  win.addEventListener("pointercancel", () => (drag = null));
  win.addEventListener("keydown", (e) => {
    if (e.target !== win) return;
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "-",
        "0",
      ].includes(e.key)
    ) {
      e.preventDefault();
      if (e.key === "0") {
        zoom = 1;
        pan = { x: 0, y: 0 };
      } else if (e.key === "+") zoom = Math.min(1.6, zoom + 0.1);
      else if (e.key === "-") zoom = Math.max(0.65, zoom - 0.1);
      else {
        pan.x += e.key === "ArrowLeft" ? 20 : e.key === "ArrowRight" ? -20 : 0;
        pan.y += e.key === "ArrowUp" ? 20 : e.key === "ArrowDown" ? -20 : 0;
      }
      transform();
    }
  });
  begin();
  updatePlay();
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}
