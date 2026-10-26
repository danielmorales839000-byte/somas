const ROOT = "/exhibition/dataset/";
const cache = new Map();
export async function datasetFile(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(ROOT + path)
    .then((r) => {
      if (!r.ok)
        throw Error("The exhibition data could not be loaded. Please retry.");
      return r.json();
    })
    .then((d) => {
      if (d.record_mode !== "SIMULATED")
        throw Error("Unexpected dataset provenance.");
      return d;
    })
    .catch((e) => {
      cache.delete(path);
      throw e;
    });
  cache.set(path, promise);
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return promise;
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (n) => Number(n).toLocaleString();
const date = (s) => (s ? new Date(s).toLocaleString() : "Not provided");
export const datasetMarkup = () =>
  `<section class="dataset-browser panel" id="dataset-browser"><div class="dataset-heading"><div><p class="eyebrow">THE SYNTHETIC EXHIBITION</p><h2>Explore the possibilities.</h2></div><span class="source-chip">GENERATED DATA · NOT REAL USERS</span></div><div id="dataset-counts" class="dataset-counts"></div><div class="dataset-tabs" role="group" aria-label="Example record type"><button data-dataset-tab="organizations" class="selected">Organizations</button><button data-dataset-tab="users">Example people</button><button data-dataset-tab="blocks">Illustrative hash chain</button></div><div class="dataset-query"><label>Search examples<input id="dataset-search" placeholder="Name, goal, or example ID…" maxlength="100"></label><label><span id="dataset-filter-name">Domain</span><select id="dataset-filter"><option value="">All</option></select></label><label id="dataset-state-label">State<select id="dataset-state"><option value="">All states</option></select></label><label>Order<select id="dataset-sort"><option value="id">Example ID</option><option value="name">Name A–Z</option><option value="learning">Learning value ↓</option></select></label></div><p class="dataset-status" id="dataset-status" role="status">Loading the example catalog…</p><div class="dataset-table-wrap"><table><thead id="dataset-table-head"></thead><tbody id="dataset-table-body"></tbody></table></div><div class="dataset-pagination"><button id="dataset-prev">← Previous</button><span id="dataset-page"></span><button id="dataset-next">Next →</button></div><details class="dataset-integrity"><summary>Data origin and relationship limits</summary><p>All people, organizations, tasks, model names, token counts and cost figures are supplied synthetic examples. No messages are sent and no accounts are created. The illustrative SHA-256 chain does not implement blockchain consensus.</p><p id="dataset-integrity-detail"></p><p>Organization, agent and task details are loaded only when selected. Example people load in bounded pages. Real community records remain separate.</p></details><dialog id="dataset-dialog"><button class="dialog-close" aria-label="Close example details">×</button><div id="dataset-detail"></div></dialog></section>`;
export async function mountDataset(path) {
  if(["/","/root-somas/","/platform/root-manager/","/network/"].includes(path))return;
  let host = document.querySelector("#dataset-browser");
  if (!host && path === "/network/") {
    document
      .querySelector(".organization-list")
      .insertAdjacentHTML("afterend", datasetMarkup());
    host = document.querySelector("#dataset-browser");
  }
  const summary = document.querySelector("#exhibition-population");
  if (!host && !summary && path !== "/root-somas/") return;
  let manifest;
  try {
    manifest = await datasetFile("manifest.json");
  } catch (e) {
    if (host) host.querySelector("#dataset-status").textContent = e.message;
    return;
  }
  if (summary)
    summary.innerHTML = `<span>THE GENERATED EXHIBITION</span><strong>${num(manifest.counts.users)} people</strong><strong>${num(manifest.counts.somas - 1)} Sub-SOMAS</strong><strong>${num(manifest.counts.agents)} agents</strong><small>Synthetic examples, not platform adoption.</small><a href="/network/#dataset-browser">Explore the dataset ↗</a>`;
  if (path === "/root-somas/") {
    const data = await datasetFile("organizations/ROOT-000001.json");
    dispatchEvent(new CustomEvent("somas:root-records", { detail: data }));
    const note = document.createElement("details");
    note.className = "dataset-root-note panel";
    note.innerHTML = `<summary><span class="source-chip">SUPPLIED ROOT SNAPSHOT / SIMULATED</span> Inspect 10 supplied agent records</summary><p>${esc(data.organization.goal)}</p><div>${data.agents.map((a) => `<span><strong>${esc(a.name)}</strong><small>${esc(a.state)} · ${a.learning_value.toFixed(3)} / 1</small></span>`).join("")}</div><p class="fine muted">Snapshot metrics are source examples. The animated reliability replay is a separate deterministic concept scenario.</p>`;
    document.querySelector(".actor-roster").after(note);
  }
  if (!host) return;
  host.querySelector("#dataset-counts").innerHTML = [
    ["People", manifest.counts.users],
    ["Organizations", manifest.counts.somas],
    ["Agents", manifest.counts.agents],
    ["Tasks", manifest.counts.tasks],
    ["Events", manifest.counts.events],
    ["Claims", manifest.counts.claims],
  ]
    .map(
      ([k, v]) =>
        `<span><strong>${num(v)}</strong><small>${k} · synthetic</small></span>`,
    )
    .join("");
  host.querySelector("#dataset-integrity-detail").textContent =
    `The supplied snapshot has ${num(manifest.relationship_checks.events_task_organization_mismatch || 0)} event/task and ${num(manifest.relationship_checks.claims_task_organization_mismatch || 0)} claim/task organization mismatches. These rows are preserved as supplied. They are not presented as a coherent verified execution history. Use the separate scenario replay to follow a consistent work cycle.`;
  const $ = (s) => host.querySelector(s);
  let type = "organizations",
    page = 0,
    query = "",
    category = "",
    state = "",
    sort = "id",
    generation = 0,
    loading = false,
    index = [],
    users = null,
    organizations = null;
  const dialog = $("#dataset-dialog");
  dialog.querySelector(".dialog-close").onclick = () => dialog.close();
  async function showOrganization(id) {
    if (!/^SUB-\d{5}$|^ROOT-000001$/.test(id)) return;
    $("#dataset-detail").innerHTML =
      "<p>Loading the synthetic organization…</p>";
    if (!dialog.open) dialog.showModal();
    try {
      const d = await datasetFile("organizations/" + id + ".json"),
        o = d.organization;
      $("#dataset-detail").innerHTML =
        `<p class="eyebrow">SUPPLIED SYNTHETIC RECORD / ${esc(o.id)}</p><h2>${esc(o.name)}</h2><p>${esc(o.goal)}</p><span class="source-chip">${esc(o.state)} · SIMULATED</span><dl class="example-meta"><dt>Parent</dt><dd>${esc(o.parent_id || "Root organization")}</dd><dt>Demo owner</dt><dd>${esc(d.owner?.name || "Platform example")} ${d.owner ? '<button data-owner="' + esc(d.owner.id) + '">View synthetic profile ↗</button>' : ""}</dd><dt>Created / age</dt><dd>${esc(date(o.created_at))}<br>${num(Math.floor((Date.now() - Date.parse(o.created_at)) / 1000))} seconds · example age</dd><dt>Learning value</dt><dd>${o.learning_value.toFixed(4)} / 1 · supplied normalized metric; not a training result</dd></dl><div class="example-detail-tabs"><button data-example-part="agents">Agents (${d.agents.length})</button><button data-example-part="tasks">Tasks (${d.tasks.length})</button><button data-example-part="events">Events (${d.events.length})</button><button data-example-part="claims">Claims (${d.claims.length})</button></div><p class="example-relationship-note">Synthetic snapshot. Event/task and claim/task references may belong to different organizations; these are not verified task joins.</p><div id="example-part"></div>`;
      const renderPart = (part) => {
        const rows = d[part];
        $("#example-part").innerHTML = rows.length
          ? rows
              .slice(0, 100)
              .map(
                (r) =>
                  `<article class="example-record"><span class="source-chip">SIMULATED</span><h3>${esc(r.name || r.title || r.event_type || r.id)}</h3><dl>${Object.entries(
                    r,
                  )
                    .filter(
                      ([k]) => !["record_mode", "name", "title"].includes(k),
                    )
                    .map(
                      ([k, v]) =>
                        `<dt>${esc(k.replaceAll("_", " "))}</dt><dd>${esc(Array.isArray(v) ? v.join("–") : v)}</dd>`,
                    )
                    .join(
                      "",
                    )}</dl>${part === "tasks" ? '<p class="fine muted">Provider, token and USD fields are synthetic estimates. No provider was called or billed.</p>' : ""}</article>`,
              )
              .join("")
          : "<p>No records of this type in the supplied organization snapshot.</p>";
        host
          .querySelectorAll("[data-example-part]")
          .forEach((b) =>
            b.classList.toggle("selected", b.dataset.examplePart === part),
          );
      };
      host
        .querySelectorAll("[data-example-part]")
        .forEach((b) => (b.onclick = () => renderPart(b.dataset.examplePart)));
      renderPart("agents");
      host
        .querySelector("[data-owner]")
        ?.addEventListener("click", () => showUser(d.owner));
      dispatchEvent(new CustomEvent("somas:focus-example", { detail: o }));
    } catch (e) {
      $("#dataset-detail").textContent = e.message;
    }
  }
  function showUser(u) {
    $("#dataset-detail").innerHTML =
      `<p class="eyebrow">SYNTHETIC PERSON / NOT A REAL ACCOUNT</p><h2>${esc(u.name)}</h2><span class="source-chip">SIMULATED / ${esc(u.id)}</span><dl class="example-meta">${Object.entries(
        u,
      )
        .filter(([k]) => !["name", "record_mode"].includes(k))
        .map(
          ([k, v]) =>
            `<dt>${esc(k.replaceAll("_", " "))}</dt><dd>${esc(v)}</dd>`,
        )
        .join(
          "",
        )}</dl><p class="fine muted">This generated email uses example.invalid. It is not a contact destination. Do not attempt to contact this fictional person.</p>`;
    if (!dialog.open) dialog.showModal();
  }
  addEventListener("somas:open-example", (e) => showOrganization(e.detail));
  function setFilters() {
    const values =
      type === "organizations"
        ? Object.keys(manifest.domains)
        : type === "users"
          ? Object.keys(manifest.countries)
          : [];
    $("#dataset-filter-name").textContent =
      type === "users" ? "Country" : "Domain";
    $("#dataset-filter").innerHTML =
      '<option value="">All</option>' +
      values
        .sort()
        .map((v) => `<option>${esc(v)}</option>`)
        .join("");
    $("#dataset-state-label").hidden = type !== "organizations";
    $("#dataset-state").innerHTML =
      '<option value="">All states</option>' +
      Object.keys(manifest.states)
        .sort()
        .map((v) => `<option>${esc(v)}</option>`)
        .join("");
    $("#dataset-sort").value = "id";
    $("#dataset-sort").disabled = type === "blocks";
    $("#dataset-filter").disabled = type === "blocks";
    $("#dataset-search").placeholder =
      type === "blocks"
        ? "Example height, such as 1500…"
        : "Name, goal, or example ID…";
    $('#dataset-sort option[value="learning"]').disabled =
      type !== "organizations";
  }
  async function loadType() {
    const g = ++generation,
      wanted = type;
    loading = true;
    $("#dataset-table-body").replaceChildren();
    $("#dataset-status").textContent = "Loading " + wanted + " index…";
    try {
      let loaded = [];
      if (wanted === "organizations") {
        organizations ||= (await datasetFile("organizations-index.json")).rows;
        loaded = organizations;
      } else if (wanted === "users") {
        users ||= (await datasetFile("users-index.json")).rows;
        loaded = users;
      }
      if (g !== generation) return;
      index = loaded;
      loading = false;
      await render();
    } catch (e) {
      if (g === generation) {
        loading = false;
        $("#dataset-status").textContent = e.message;
      }
    }
  }
  async function render() {
    if (loading) return;
    const g = ++generation;
    $("#dataset-prev").disabled = true;
    $("#dataset-next").disabled = true;
    $("#dataset-status").textContent = "Filtering synthetic records…";
    try {
      const q = query.toLowerCase().trim();
      let entries;
      if (type === "blocks")
        entries = Array.from(
          { length: manifest.counts.blocks },
          (_, i) => i,
        ).filter((i) => !q || String(i + 1).includes(q));
      else
        entries = index
          .map((r, i) => ({ r, i }))
          .filter(({ r, i }) => {
            const id =
              type === "users" ? "DU-" + String(i + 1).padStart(6, "0") : r[0];
            return (
              (!q ||
                [id, ...(type === "users" ? [r[0], r[1]] : [r[1], r[2], r[7]])]
                  .join(" ")
                  .toLowerCase()
                  .includes(q)) &&
              (!category || (type === "users" ? r[1] : r[2]) === category) &&
              (!state || type !== "organizations" || r[3] === state)
            );
          })
          .sort((a, b) =>
            sort === "name"
              ? String(a.r[type === "users" ? 0 : 1]).localeCompare(
                  String(b.r[type === "users" ? 0 : 1]),
                )
              : sort === "learning"
                ? b.r[6] - a.r[6]
                : a.i - b.i,
          );
      const total = entries.length,
        max = Math.max(1, Math.ceil(total / 25));
      page = Math.min(page, max - 1);
      const visible = entries.slice(page * 25, page * 25 + 25);
      let html = "";
      if (type === "organizations") {
        $("#dataset-table-head").innerHTML =
          "<tr><th>Organization</th><th>Goal / domain</th><th>State</th><th>Learning / 1</th></tr>";
        html = visible
          .map(
            ({ r }) =>
              `<tr><td><button data-unit="${r[0]}">${esc(r[1])} ↗</button><small>${r[0]} · SIMULATED</small></td><td>${esc(r[7])}<small>${esc(r[2])}</small></td><td><span class="example-state">${esc(r[3])}</span></td><td>${r[6].toFixed(4)}</td></tr>`,
          )
          .join("");
      } else if (type === "users") {
        const pages = [
          ...new Set(visible.map(({ i }) => Math.floor(i / 1000))),
        ];
        const loaded = new Map(
          await Promise.all(
            pages.map(async (p) => [
              p,
              (
                await datasetFile(
                  "users/" + String(p).padStart(3, "0") + ".json",
                )
              ).rows,
            ]),
          ),
        );
        if (g !== generation) return;
        const rows = visible.map(
          ({ i }) => loaded.get(Math.floor(i / 1000))[i % 1000],
        );
        $("#dataset-table-head").innerHTML =
          "<tr><th>Generated person</th><th>Country</th><th>Snapshot status</th><th>Registered</th></tr>";
        html = rows
          .map(
            (u, i) =>
              `<tr><td><button data-user="${i}">${esc(u.name)} ↗</button><small>${u.id} · NOT A REAL ACCOUNT</small></td><td>${esc(u.country)}</td><td>${esc(u.account_status)}</td><td>${esc(new Date(u.registered_at).toLocaleDateString())}</td></tr>`,
          )
          .join("");
        $("#dataset-table-body").innerHTML = html;
        host
          .querySelectorAll("[data-user]")
          .forEach((b) => (b.onclick = () => showUser(rows[+b.dataset.user])));
      } else {
        const pages = [...new Set(visible.map((i) => Math.floor(i / 100)))];
        const loaded = new Map(
          await Promise.all(
            pages.map(async (p) => [
              p,
              (await datasetFile("blocks/" + p + ".json")).rows,
            ]),
          ),
        );
        if (g !== generation) return;
        $("#dataset-table-head").innerHTML =
          "<tr><th>Example height</th><th>Illustrative SHA-256 hash</th><th>Timestamp</th></tr>";
        html = visible
          .map((i) => {
            const r = loaded.get(Math.floor(i / 100))[i % 100];
            return `<tr><td>${r.height}<small>SIMULATED</small></td><td><code>${esc(r.hash)}</code><small>Illustrative linked record, not blockchain consensus</small></td><td>${esc(date(r.timestamp))}</td></tr>`;
          })
          .join("");
      }
      if (g !== generation) return;
      if (type === "organizations")
        dispatchEvent(
          new CustomEvent("somas:population", {
            detail: entries.map((x) => x.r),
          }),
        );
      if (type !== "users")
        $("#dataset-table-body").innerHTML =
          html || '<tr><td colspan="4">No matching examples.</td></tr>';
      if (type === "users" && !visible.length)
        $("#dataset-table-body").innerHTML =
          '<tr><td colspan="4">No matching generated people.</td></tr>';
      host
        .querySelectorAll("[data-unit]")
        .forEach((b) => (b.onclick = () => showOrganization(b.dataset.unit)));
      $("#dataset-status").textContent =
        num(total) +
        " matching " +
        (type === "users" ? "generated people" : type) +
        " · synthetic snapshot";
      $("#dataset-page").textContent = "Page " + (page + 1) + " / " + num(max);
      $("#dataset-prev").disabled = page === 0;
      $("#dataset-next").disabled = page >= max - 1;
    } catch (e) {
      if (g === generation) $("#dataset-status").textContent = e.message;
    }
  }
  host.querySelectorAll("[data-dataset-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        type = b.dataset.datasetTab;
        page = 0;
        category = "";
        state = "";
        query = "";
        sort = "id";
        $("#dataset-search").value = "";
        host
          .querySelectorAll("[data-dataset-tab]")
          .forEach((x) => x.classList.toggle("selected", x === b));
        setFilters();
        loadType();
      }),
  );
  let timer;
  $("#dataset-search").oninput = (e) => {
    query = e.target.value;
    page = 0;
    clearTimeout(timer);
    timer = setTimeout(render, 180);
  };
  $("#dataset-filter").onchange = (e) => {
    category = e.target.value;
    page = 0;
    render();
  };
  $("#dataset-state").onchange = (e) => {
    state = e.target.value;
    page = 0;
    render();
  };
  $("#dataset-sort").onchange = (e) => {
    sort = e.target.value;
    page = 0;
    render();
  };
  $("#dataset-prev").onclick = () => {
    page--;
    render();
  };
  $("#dataset-next").onclick = () => {
    page++;
    render();
  };
  addEventListener("somas:filter-examples", (e) => {
    const switched = type !== "organizations";
    type = "organizations";
    page = 0;
    query = e.detail;
    category = "";
    state = "";
    sort = "id";
    $("#dataset-search").value = query;
    host
      .querySelectorAll("[data-dataset-tab]")
      .forEach((b) =>
        b.classList.toggle("selected", b.dataset.datasetTab === type),
      );
    setFilters();
    if (switched) loadType();
    else render();
  });
  setFilters();
  await loadType();
}
