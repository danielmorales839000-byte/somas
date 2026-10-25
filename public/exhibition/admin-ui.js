import { api } from "./community.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function adminMarkup() {
  return `<div class="world-heading"><div><p class="eyebrow">AUTHORIZED ADMINISTRATORS</p><h1>The human side<br><em>of SOMAS.</em></h1><p>Real users, private inquiries and meeting requests.</p></div><span class="source-chip">REAL DATABASE RECORDS</span></div><a class="secondary" href="/examples/">Explore synthetic examples separately ↗</a><p id="admin-notice" role="status">Checking administrator access…</p><div id="admin-workspace" hidden><div class="admin-summary" id="admin-summary"></div><nav class="world-mode" aria-label="Administrator sections"><button data-admin-tab="messages">Messages</button><button data-admin-tab="meetings">Meetings</button><button data-admin-tab="users">Users</button><a class="secondary" href="/discussions/moderation/">Discussion moderation ↗</a></nav><label class="admin-search">Search loaded records <input id="admin-search" placeholder="Name, email, message…"></label><div id="admin-records"></div></div><p class="fine muted">Use your community account to sign in. Administrator access is checked on the server.</p><a href="/account/" class="secondary">Community account ↗</a>`;
}
export async function mountAdmin() {
  const $ = (s) => document.querySelector(s);
  try {
    const data = await api("/api/admin/workspace");
    $("#admin-notice").textContent =
      "Authorized private view · latest 100 records per list. Visitor analytics are not collected.";
    $("#admin-workspace").hidden = false;
    $("#admin-summary").innerHTML = [
      ["Registered users", data.stats.users],
      ["Private inquiries", data.stats.messages],
      ["Meeting requests", data.stats.meetings],
      ["Unique visitors", "Not tracked"],
    ]
      .map(
        ([k, v]) =>
          `<div class="panel"><small>${k}</small><strong>${v}</strong></div>`,
      )
      .join("");
    let tab = "messages";
    const render = () => {
      const q = $("#admin-search").value.toLowerCase();
      document
        .querySelectorAll("[data-admin-tab]")
        .forEach((b) =>
          b.classList.toggle("selected", b.dataset.adminTab === tab),
        );
      if (tab === "users") {
        $("#admin-records").innerHTML =
          data.users
            .filter((u) =>
              (u.display_name + " " + u.email).toLowerCase().includes(q),
            )
            .map(
              (u) =>
                `<article class="admin-record panel"><h3>${esc(u.display_name || "Member")}</h3><p>${esc(u.email)}</p><small>Registered ${esc(new Date(u.created_at).toLocaleString())} · ${u.suspended ? "Restriction recorded" : "No restriction recorded"}</small><p class="fine muted">${u.role?`Role: ${esc(u.role)} · ${u.verified_at?"Verified":"Not verified"} · ${esc(u.account_status)} · Last sign-in: ${esc(u.last_login_at?new Date(u.last_login_at).toLocaleString():"Not recorded")}`:"Last-login history not available in legacy mode."} Country and contact preference are not collected.</p></article>`,
            )
            .join("") || "<p>No matching users.</p>";
        return;
      }
      const rows = data.submissions
        .filter((r) => Boolean(r.payload.meeting) === (tab === "meetings"))
        .filter((r) => JSON.stringify(r.payload).toLowerCase().includes(q));
      $("#admin-records").innerHTML =
        rows
          .map((r) => {
            const p = r.payload,
              m = p.meeting;
            return `<article class="admin-record panel"><div><span class="source-chip">${esc(p.reviewStatus || m?.status || "new")}</span><h3>${esc(p.name)} / ${esc(m ? "Meeting request" : p.subject || "Application")}</h3><p>${esc(p.email)} · ${esc(new Date(r.created_at).toLocaleString())}</p></div><p class="application-message">${esc(p.message)}</p>${m ? `<p>Requested: ${esc(new Date(m.startsAt).toLocaleString(undefined, { timeZone: m.timezone }))} (${esc(m.timezone)})</p><p class="fine muted">${esc(m.startsAt)} UTC reference. Confirmation is an internal record; no invitation or email is sent.</p>` : ""}${p.roles ? `<p>Contribution: ${esc(p.roles.join(", "))} · ${esc(p.country)} / ${esc(p.city)}</p><p>${esc(p.about)}</p>` : ""}<label>Review status <select data-review="${r.id}">${(m ? ["requested", "reviewing", "confirmed", "cancelled"] : ["new", "reviewing", "responded", "closed"]).map((s) => `<option ${s === (p.reviewStatus || m?.status || "new") ? "selected" : ""}>${s}</option>`).join("")}</select></label><details><summary>Private audit history (${p.adminHistory?.length || 0})</summary>${(p.adminHistory || []).map((h) => `<p class="fine">${esc(h.status)} · ${esc(h.at)}</p>`).join("") || '<p class="fine">No status changes recorded.</p>'}</details></article>`;
          })
          .join("") || "<p>No matching records.</p>";
      document.querySelectorAll("[data-review]").forEach(
        (s) =>
          (s.onchange = async () => {
            s.disabled = true;
            try {
              await api("/api/admin/workspace/" + s.dataset.review, "PATCH", {
                status: s.value,
              });
              const r = data.submissions.find((r) => r.id === s.dataset.review);
              r.payload.reviewStatus = s.value;
              (r.payload.adminHistory ||= []).push({
                status: s.value,
                at: new Date().toISOString(),
              });
              $("#admin-notice").textContent =
                "Review status saved. No email or calendar invitation was sent.";
              render();
            } catch (e) {
              $("#admin-notice").textContent = e.message;
              s.disabled = false;
            }
          }),
      );
    };
    document.querySelectorAll("[data-admin-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          tab = b.dataset.adminTab;
          render();
        }),
    );
    $("#admin-search").oninput = render;
    render();
  } catch (e) {
    $("#admin-notice").textContent = e.message;
  }
}
