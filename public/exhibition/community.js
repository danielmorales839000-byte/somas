import {exampleDiscussions} from './example-discussions.js';
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const categories = {
  platform: "SOMAS Platform",
  network: "SOMAS Network",
  ideas: "Ideas & Suggestions",
  questions: "Questions & Answers",
  general: "General Discussion",
  bugs: "Bug Reports & Feedback",
};
const states = [
  "proposed",
  "under_review",
  "planned",
  "in_progress",
  "implemented",
  "declined",
];
const words = (s) => s.replaceAll("_", " "),
  date = (s) =>
    new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
const avatar = (name, large = false) =>
  `<span class="community-avatar ${large ? "large" : ""}" aria-hidden="true">${esc(
    name
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  )}</span>`;
const author = (a) =>
  `<a class="community-author" href="/discussions/profiles/${a.id}/">${avatar(a.name)}<span>${esc(a.name)}</span></a>`;
const categoryTag = (c) =>
  `<span class="category-tag ${c}">${categories[c]}</span>`;
let session = null;
export async function api(path, method = "GET", data) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "x-somas-request": "1",
      ...(data ? { "content-type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error(
      "The community service is unavailable. Please try again later.",
    );
  }
  if (!response.ok) {
    const code = result.error;
    throw Object.assign(
      new Error(
        {
          sign_in_required: "Sign in to participate.",
          unauthenticated: "Sign in to participate.",
          not_your_content: "You can only change your own content.",
          posting_restricted:
            "Posting is restricted for this account. Contact the SOMAS team.",
          rate_limit_reached:
            "Please slow down. Your hourly activity limit has been reached.",
          invalid_credentials: "Email or password is incorrect.",
          email_already_registered: "This email is registered. Please sign in.",
          discussion_unavailable_or_locked:
            "This discussion is locked or unavailable.",
          discussion_not_found:
            "This discussion is unavailable or has been removed.",
          content_not_editable: "This content cannot currently be edited.",
          admin_required:
            "Only the configured SOMAS administrator can do that.",
          database_not_configured:
            "The community database is not connected yet.",
          database_schema_unavailable:
            "The community migration has not been applied yet.",
          password_must_be_12_to_128_chars:
            "Use a password between 12 and 128 characters.",
          invalid_title: "Use a title between 4 and 140 characters.",
          invalid_body: "Write between 20 and 10,000 characters.",
          invalid_reply: "Write a reply between 2 and 5,000 characters.",
          invalid_category: "Choose a valid category.",
          reserved_display_name:
            "Choose a name that does not impersonate the SOMAS team.",
          invalid_tags:
            "Use up to five tags, each at most 24 letters, numbers, spaces, hyphens or underscores.",
        }[code] || "This request could not be completed. Please try again.",
      ),
      { status: response.status, code },
    );
  }
  return result;
}
// User content never becomes HTML. Only parsed http(s) URLs become links.
export function renderBody(node, body) {
  node.replaceChildren();
  for (const paragraph of body.split(/\n\s*\n/)) {
    const p = document.createElement("p");
    let last = 0;
    for (const match of paragraph.matchAll(/https?:\/\/[^\s<>]+/g)) {
      p.append(document.createTextNode(paragraph.slice(last, match.index)));
      let url;
      try {
        url = new URL(match[0]);
      } catch {}
      if (url && ["http:", "https:"].includes(url.protocol)) {
        const a = document.createElement("a");
        a.href = url.href;
        a.textContent = match[0];
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow ugc";
        p.append(a);
      } else p.append(document.createTextNode(match[0]));
      last = match.index + match[0].length;
    }
    p.append(document.createTextNode(paragraph.slice(last)));
    node.append(p);
  }
}
function flash(node, message, error = false) {
  node.textContent = message;
  node.classList.toggle("error", error);
}
function dialog(title, body) {
  const d = document.createElement("dialog");
  d.className = "community-dialog";
  d.innerHTML = `<button class="dialog-close" aria-label="Close dialog">×</button><h2>${title}</h2>${body}`;
  document.body.append(d);
  d.querySelector(".dialog-close").onclick = () => d.close();
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}
const signIn = () =>
  `<a class="primary" href="/account/?return_to=${encodeURIComponent(location.pathname + location.search)}">Sign in to participate ↗</a>`;
function canParticipate() {
  if (session) return true;
  const d = dialog(
    "Your voice belongs here.",
    `<p class="muted">Create a community account or sign in to publish, reply, vote and follow. Contributor applications do not create accounts.</p>${signIn()}`,
  );
  return false;
}
function card(d) {
  return `<article class="discussion-card"><div class="discussion-votes"><strong>${d.votes}</strong><small>UPVOTES</small></div><div class="discussion-summary"><div class="discussion-labels">${categoryTag(d.category)}${d.pinned ? '<span class="badge">Pinned</span>' : ""}${d.official ? '<span class="team-label">SOMAS Team</span>' : ""}${d.category === "ideas" ? `<span class="suggestion-label">${words(d.suggestion_state)}</span>` : ""}</div><h3><a href="/discussions/${d.id}/">${esc(d.title)}</a></h3><p>${esc(d.excerpt || "")}</p><div class="discussion-meta">${author(d.author)}<time>${date(d.created_at)}</time><span>${d.replies} ${d.replies === 1 ? "reply" : "replies"}</span>${d.locked ? "<span>Locked</span>" : ""}</div></div><a class="discussion-arrow" href="/discussions/${d.id}/" aria-label="Read ${esc(d.title)}">↗</a></article>`;
}
const empty = (title, sub) =>
  `<div class="community-empty"><div class="empty-orbit">✦</div><h3>${title}</h3><p>${sub}</p><button class="primary" data-new>Start a Discussion ↗</button></div>`;
function bindNew(root = document) {
  root
    .querySelectorAll("[data-new]")
    .forEach(
      (b) =>
        (b.onclick = () => compose(null, b.hasAttribute("data-announcement"))),
    );
}
async function currentSession() {
  try {
    session = await api("/api/me");
  } catch (e) {
    session = null;
    if (e.status !== 401) console.info("Community session unavailable");
  }
  return session;
}
export async function communityPreview() {
  const node = $("#community-preview");
  if (!node) return;
  node.innerHTML =
    '<p class="fine muted" role="status">Loading genuine community conversations…</p>';
  try {
    const [latest, popular, official] = await Promise.all([
      api("/api/community/discussions"),
      api("/api/community/discussions?category=ideas&sort=top"),
      api("/api/community/discussions?official=true"),
    ]);
    node.innerHTML = `<div class="community-preview-grid">${[
      ["Latest conversation", latest.discussions[0]],
      ["Popular suggestion", popular.discussions[0]],
      ["SOMAS announcements", official.discussions[0]],
    ]
      .map(
        ([label, d]) =>
          `<div class="panel"><p class="eyebrow">${label}</p>${d ? `<h3><a href="/discussions/${d.id}/">${esc(d.title)} ↗</a></h3><p class="fine muted">${d.votes} upvotes · ${d.replies} replies</p>` : '<p class="fine muted">No contributions yet. Yours could be the first.</p>'}</div>`,
      )
      .join("")}</div>`;
  } catch (e) {
    node.innerHTML =
      '<div class="community-empty compact"><p>Community conversations are unavailable right now.</p><a href="/discussions/">Visit the community ↗</a></div>';
  }
}
export function communityMarkup() {
  return `<div id="community-root"><p role="status">Loading the community…</p></div>`;
}
export async function mountCommunity() {
  await currentSession();
  const root = $("#community-root");
  const path = location.pathname.replace(/\/$/, "");
  const account =
    path === "/account" || path === "/workspace.html" || path === "/workspace";
  if (account) { if(!session){try{const r=await fetch('/api/auth/config');const c=await r.json();if(c.v4){location.replace('/account/');return;}}catch{}}return accountView(root); }
  if (path === "/discussions/moderation") return moderationView(root);
  const profile = path.match(/^\/discussions\/profiles\/([0-9a-f-]+)$/i);
  if (profile) return profileView(root, profile[1]);
  const thread = path.match(/^\/discussions\/([0-9a-f-]+)$/i);
  if (thread) return detailView(root, thread[1]);
  return listView(root);
}
function communityBar() {
  return `<div class="community-session"><span class="real-label"><i></i> REAL COMMUNITY · HUMAN CONTRIBUTIONS</span><div>${session ? `<a href="/account/">${avatar(session.profile.display_name)} My community</a>${session.isAdmin ? '<a href="/admin/">Administrator ↗</a><a href="/discussions/moderation/">Moderation ↗</a>' : ""}` : '<a href="/account/">Sign in / Create account ↗</a>'}</div></div>`;
}
async function listView(root) {
  root.innerHTML = `${communityBar()}<section class="community-hero"><button class="primary" data-new>Start a Discussion ↗</button></section><div class="community-layout"><section><label class="search-label" for="discussion-search">Find a conversation</label><input type="search" id="discussion-search" placeholder="Search ideas, questions and feedback…" maxlength="100"><div class="community-filters"><select id="discussion-category" aria-label="Discussion category"><option value="">All categories</option>${Object.entries(
    categories,
  )
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join(
      "",
    )}</select><select id="discussion-sort" aria-label="Sort discussions"><option value="latest">Latest</option><option value="active">Most Active</option><option value="top">Most Upvoted</option><option value="unanswered">Unanswered</option></select></div><div id="discussion-list" class="panel discussion-list" aria-live="polite"></div><button class="secondary load-more" id="discussion-more" hidden>Load more discussions</button></section><aside class="community-aside"><div class="panel"><p class="eyebrow">EXPLORE THE CONVERSATION</p><div class="category-navigation">${Object.entries(
    categories,
  )
    .map(
      ([k, v]) =>
        `<button data-category="${k}"><span class="category-dot ${k}"></span>${v}<span>↗</span></button>`,
    )
    .join(
      "",
    )}</div></div><div class="community-note panel"><span class="note-symbol">✧</span><h3>A thoughtful place to build an idea.</h3><p>Be curious. Challenge ideas respectfully. Keep personal and customer data private.</p><a href="/contact/">Contact the SOMAS team ↗</a></div><p class="fine muted">Agent and blockchain demonstrations are simulated. Posts, replies and votes here are genuine database records.</p></aside></div>`;
  bindNew(root);
  const examples=document.createElement('details');examples.className='panel example-discussions';examples.open=true;
  examples.innerHTML='<summary>55 example discussions · fictional contributors</summary><p class="fine">Illustrative conversations about the SOMAS idea. These are not real posts or accounts, have static example replies and cannot receive real votes or replies, and are excluded from administrator totals.</p><label>Search examples<input type="search" id="example-search" placeholder="Restaurant, verification, budgets…"></label><div id="example-list"></div><button class="secondary" id="example-more">Show more examples</button>';
  root.querySelector('.community-layout').before(examples);
  let exampleLimit=5;
  const exampleDialog=document.createElement('dialog');exampleDialog.className='admin-detail-dialog example-thread-dialog';exampleDialog.setAttribute('aria-label','Fictional discussion thread');document.body.append(exampleDialog);
  const openExample=id=>{const x=exampleDiscussions.find(t=>t.id===id);exampleDialog.innerHTML=`<button class="dialog-close" aria-label="Close example discussion">×</button><p class="source-chip">FICTIONAL CONVERSATION · NOT REAL USERS</p><h2>${esc(x.title)}</h2><article class="message-bubble"><strong>${esc(x.author)}</strong><p>${esc(x.body)}</p></article>${x.replies.map(r=>`<article class="message-bubble"><strong>${esc(r.author)}</strong><p>${esc(r.body)}</p></article>`).join('')}<p class="fine">This entire thread is a static example. Start a real discussion to share your own thoughts.</p>`;exampleDialog.querySelector('button').onclick=()=>exampleDialog.close();exampleDialog.showModal();};
  const renderExamples=()=>{const query=examples.querySelector('input').value.toLowerCase();const rows=exampleDiscussions.filter(x=>(x.title+' '+x.body+' '+x.category).toLowerCase().includes(query));examples.querySelector('#example-list').innerHTML=rows.slice(0,exampleLimit).map(x=>`<article class="discussion-card"><div class="discussion-votes"><strong>✧</strong><small>EXAMPLE</small></div><div class="discussion-summary"><div class="discussion-labels">${categoryTag(x.category)}<span class="source-chip">FICTIONAL</span></div><h3><button class="example-thread-link" data-example="${x.id}">${esc(x.title)}</button></h3><p>${esc(x.body.slice(0,220))}…</p><div class="discussion-meta">${avatar(x.author)}<span>${esc(x.author)}</span><span>${x.replies.length} example replies</span></div></div><button class="discussion-arrow" data-example="${x.id}" aria-label="Read example ${esc(x.title)}">↗</button></article>`).join('')||'<p>No matching examples.</p>';examples.querySelector('#example-more').hidden=rows.length<=exampleLimit;examples.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>openExample(b.dataset.example));};
  examples.querySelector('input').oninput=()=>{exampleLimit=5;renderExamples();};examples.querySelector('#example-more').onclick=()=>{exampleLimit+=10;renderExamples();};renderExamples();
  let next = null,
    sequence = 0,
    timer;
  const load = async (more) => {
    const turn = ++sequence;
    const list = $("#discussion-list"),
      button = $("#discussion-more");
    button.disabled = true;
    if (!more)
      list.innerHTML =
        '<div class="community-empty compact" role="status">Loading conversations…</div>';
    const p = new URLSearchParams({
      q: $("#discussion-search").value,
      category: $("#discussion-category").value,
      sort: $("#discussion-sort").value,
      ...(more ? { offset: next } : {}),
    });
    try {
      const data = await api("/api/community/discussions?" + p);
      if (turn !== sequence) return;
      if (more)
        list.insertAdjacentHTML(
          "beforeend",
          data.discussions.map(card).join(""),
        );
      else
        list.innerHTML = data.discussions.length
          ? data.discussions.map(card).join("")
          : empty(
              "A new conversation starts with you.",
              "No matching discussions yet. Share an idea, ask a question, or offer a useful perspective.",
            );
      next = data.next;
      button.hidden = next === null;
      bindNew(list);
    } catch (e) {
      if (turn !== sequence) return;
      list.innerHTML =
        '<div class="community-empty compact"><h3>We couldn’t load the community.</h3><p role="alert"></p><button class="secondary" id="retry-community">Try again</button></div>';
      list.querySelector("p").textContent = e.message;
      $("#retry-community").onclick = () => load(false);
      button.hidden = true;
    } finally {
      button.disabled = false;
    }
  };
  $("#discussion-search").oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(false), 250);
  };
  $("#discussion-category").onchange = () => load(false);
  $("#discussion-sort").onchange = () => load(false);
  root.querySelectorAll("[data-category]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#discussion-category").value = b.dataset.category;
        load(false);
      }),
  );
  $("#discussion-more").onclick = () => load(true);
  await load(false);
}
function compose(existing = null, announcement = false) {
  if (!canParticipate()) return;
  const reply = existing?.kind === "reply",
    editing = !!existing;
  const d = dialog(
    editing ? "Edit your contribution" : "Start a Discussion",
    `<p class="fine muted">Public, genuine conversation. Do not post private details. Plain text, paragraphs and http(s) links are supported.</p><form class="discussion-composer"><label>${reply ? "Reply" : "Discussion title"}${reply ? "" : `<input name="title" required minlength="4" maxlength="140" value="${esc(existing?.title || "")}">`}</label>${
      reply
        ? ""
        : `<label>Category<select name="category" required>${Object.entries(
            categories,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${existing?.category === k ? "selected" : ""}>${v}</option>`,
            )
            .join("")}</select></label>`
    }<label>${reply ? "Your reply" : "Content"}<textarea name="body" required minlength="${reply ? 2 : 20}" maxlength="${reply ? 5000 : 10000}" rows="9" placeholder="What would you like to explore together?">${esc(existing?.body || "")}</textarea></label>${reply ? "" : `<label>Tags · optional, separated by commas<input name="tags" maxlength="124" value="${esc(existing?.tags?.join(", ") || "")}" placeholder="Research, governance, use cases"></label>`}<div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>${session.isAdmin && !editing ? `<label class="consent"><input name="official" type="checkbox" ${announcement ? "checked" : ""}>Publish as a SOMAS Team announcement</label>` : ""}<div class="composer-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit">${editing ? "Save changes" : "Publish discussion"} ↗</button></div><p class="form-message" role="status"></p></form>`,
  );
  d.querySelector("[data-cancel]").onclick = () => d.close();
  const f = d.querySelector("form"),
    status = d.querySelector("[role=status]");
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const p = Object.fromEntries(new FormData(f));
    if (!reply)
      p.tags = p.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    p.official = !!p.official;
    const b = f.querySelector("[type=submit]");
    b.disabled = true;
    flash(status, "Saving your contribution…");
    try {
      const result = await api(
        editing
          ? "/api/community/" +
              (reply ? "replies" : "discussions") +
              "/" +
              existing.id
          : "/api/community/discussions",
        editing ? "PUT" : "POST",
        p,
      );
      d.close();
      if (editing) await mountCommunity();
      else location.assign("/discussions/" + result.id + "/");
    } catch (e) {
      flash(status, e.message, true);
    } finally {
      b.disabled = false;
    }
  };
}
async function detailView(root, id) {
  root.innerHTML = '<p role="status">Loading the conversation…</p>';
  try {
    const { discussion: d } = await api("/api/community/discussions/" + id);
    const owner = session?.profile.id === d.author.id;
    root.innerHTML = `${communityBar()}<a class="back-link" href="/discussions/">← All discussions</a><article class="thread panel"><div class="discussion-labels">${categoryTag(d.category)}${d.official ? '<span class="team-label">SOMAS Team announcement</span>' : ""}${d.pinned ? '<span class="badge">Pinned</span>' : ""}${d.category === "ideas" ? `<span class="suggestion-label">${words(d.suggestion_state)}</span>` : ""}</div><h1>${esc(d.title)}</h1><div class="discussion-meta">${author(d.author)}<time>${date(d.created_at)}</time>${d.updated_at !== d.created_at ? "<span>Edited</span>" : ""}</div><div class="community-prose" id="thread-body"></div><div class="tag-list">${d.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div><div class="thread-actions"><button class="secondary" id="thread-vote" aria-pressed="${d.voted}">↑ ${d.votes} ${d.voted ? "Upvoted" : "Upvote"}</button><button class="secondary" id="thread-follow" aria-pressed="${d.following}">${d.following ? "✓ Following" : "Follow discussion"}</button><button class="text-button" id="thread-report">Report</button>${owner ? '<button class="text-button" id="thread-edit">Edit</button><button class="text-button danger" id="thread-delete">Delete</button>' : ""}${session?.isAdmin ? '<button class="text-button" id="thread-moderate">Moderate</button>' : ""}</div><p class="form-message" id="thread-status" role="status"></p></article><div class="section-head"><h2>${d.replies} ${d.replies === 1 ? "reply" : "replies"}</h2><span class="fine muted">Oldest first</span></div><div id="reply-list"></div><button class="secondary load-more" id="reply-more" hidden>Load more replies</button><section class="panel reply-compose">${d.locked ? '<h3>This discussion is locked.</h3><p class="fine muted">Existing replies remain readable. New replies and edits are paused by moderators.</p>' : session ? '<h3>Add your perspective.</h3><form id="reply-form"><label for="reply-body">Your reply</label><textarea id="reply-body" required minlength="2" maxlength="5000" rows="5" placeholder="A thoughtful response can move an idea forward."></textarea>' + (session.isAdmin ? '<label class="consent"><input type="checkbox" id="official-reply">Mark as an official SOMAS response</label>' : "") + '<button class="primary">Publish reply ↗</button><p class="form-message" role="status"></p></form>' : '<h3>Join the conversation.</h3><p class="muted fine">Your questions and perspective are welcome.</p>' + signIn()}</section>`;
    renderBody($("#thread-body"), d.body);
    const action = async (button, endpoint, data, method = "PUT") => {
      if (!canParticipate()) return;
      button.disabled = true;
      try {
        await api("/api/community/" + endpoint, method, data);
        await detailView(root, id);
      } catch (e) {
        flash($("#thread-status"), e.message, true);
        button.disabled = false;
      }
    };
    $("#thread-vote").onclick = (e) =>
      action(e.currentTarget, "discussions/" + id + "/vote", {
        active: !d.voted,
      });
    $("#thread-follow").onclick = (e) =>
      action(e.currentTarget, "discussions/" + id + "/follow", {
        active: !d.following,
      });
    $("#thread-report").onclick = () => reportItem("discussion", id);
    if (owner) {
      $("#thread-edit").onclick = () => compose({ ...d, kind: "discussion" });
      $("#thread-delete").onclick = () =>
        deleteItem("discussion", id, () => location.assign("/discussions/"));
    }
    if (session?.isAdmin)
      $("#thread-moderate").onclick = () =>
        moderateItem("discussion", id, () => detailView(root, id));
    let offset = 0;
    async function replies(more = false) {
      const data = await api(
        "/api/community/discussions/" + id + "/replies?offset=" + offset,
      );
      if (!more) $("#reply-list").replaceChildren();
      for (const r of data.replies) {
        const el = document.createElement("article");
        el.className = "reply panel";
        const owns = session?.profile.id === r.author.id;
        el.innerHTML = `<div class="discussion-meta">${author(r.author)}<time>${date(r.created_at)}</time>${r.official ? '<span class="team-label">Official Response</span>' : ""}</div><div class="community-prose"></div><div class="thread-actions"><button class="text-button" data-reply-vote aria-pressed="${r.voted}">↑ ${r.votes} ${r.voted ? "Upvoted" : "Upvote"}</button><button class="text-button" data-report>Report</button>${owns ? '<button class="text-button" data-edit>Edit</button><button class="text-button danger" data-delete>Delete</button>' : ""}${session?.isAdmin ? '<button class="text-button" data-moderate>Moderate</button>' : ""}</div>`;
        renderBody(el.querySelector(".community-prose"), r.body);
        el.querySelector("[data-reply-vote]").onclick = (e) =>
          action(e.currentTarget, "replies/" + r.id + "/vote", {
            active: !r.voted,
          });
        el.querySelector("[data-report]").onclick = () =>
          reportItem("reply", r.id);
        if (owns) {
          el.querySelector("[data-edit]").onclick = () =>
            compose({ ...r, kind: "reply" });
          el.querySelector("[data-delete]").onclick = () =>
            deleteItem("reply", r.id, () => detailView(root, id));
        }
        if (session?.isAdmin)
          el.querySelector("[data-moderate]").onclick = () =>
            moderateItem("reply", r.id, () => detailView(root, id));
        $("#reply-list").append(el);
      }
      offset = data.next;
      $("#reply-more").hidden = offset === null;
      if (!more && !data.replies.length)
        $("#reply-list").innerHTML =
          '<p class="fine muted">No replies yet. Start the conversation thoughtfully.</p>';
    }
    $("#reply-more").onclick = async (e) => {
      e.currentTarget.disabled = true;
      try {
        await replies(true);
      } catch (error) {
        flash($("#thread-status"), error.message, true);
      } finally {
        $("#reply-more").disabled = false;
      }
    };
    await replies();
    if ($("#reply-form"))
      $("#reply-form").onsubmit = async (e) => {
        e.preventDefault();
        const f = e.currentTarget,
          b = f.querySelector("button"),
          s = f.querySelector("[role=status]");
        b.disabled = true;
        try {
          await api("/api/community/discussions/" + id + "/replies", "POST", {
            body: $("#reply-body").value,
            official: !!$("#official-reply")?.checked,
          });
          await detailView(root, id);
        } catch (error) {
          flash(s, error.message, true);
          b.disabled = false;
        }
      };
  } catch (e) {
    root.innerHTML =
      '<div class="community-empty panel"><h2>Conversation unavailable.</h2><p role="alert"></p><a class="secondary" href="/discussions/">Back to discussions</a></div>';
    root.querySelector("p").textContent = e.message;
  }
}
function reportItem(kind, id) {
  if (!canParticipate()) return;
  const d = dialog(
    "Flag content for review",
    `<p class="fine muted">Reports are private to moderators. Explain the concern without adding private information.</p><form><label>Reason<textarea name="reason" minlength="10" maxlength="1000" rows="4" required></textarea></label><button class="primary">Send report</button><p class="form-message" role="status"></p></form>`,
  );
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.currentTarget.querySelector("button");
    b.disabled = true;
    try {
      await api(
        "/api/community/" +
          (kind === "reply" ? "replies" : "discussions") +
          "/" +
          id +
          "/report",
        "POST",
        { reason: d.querySelector("textarea").value },
      );
      d.querySelector("form").innerHTML =
        '<p role="status">Your report has been saved privately for moderator review.</p>';
    } catch (error) {
      flash(d.querySelector("[role=status]"), error.message, true);
      b.disabled = false;
    }
  };
}
function deleteItem(kind, id, done) {
  const d = dialog(
    "Remove your contribution?",
    `<p class="muted">It will disappear from public conversations. A moderation record remains available for review and restoration.</p><button class="secondary" data-cancel>Keep it</button> <button class="primary" data-remove>Delete my ${kind}</button><p role="status" class="form-message"></p>`,
  );
  d.querySelector("[data-cancel]").onclick = () => d.close();
  d.querySelector("[data-remove]").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api(
        "/api/community/" +
          (kind === "reply" ? "replies" : "discussions") +
          "/" +
          id,
        "DELETE",
      );
      d.close();
      await done();
    } catch (error) {
      flash(d.querySelector("[role=status]"), error.message, true);
      e.currentTarget.disabled = false;
    }
  };
}
async function profileView(root, id) {
  root.innerHTML = '<p role="status">Loading public profile…</p>';
  try {
    const data = await api("/api/community/profiles/" + id),
      p = data.profile;
    root.innerHTML = `${communityBar()}<a class="back-link" href="/discussions/">← Community</a><section class="profile-header panel">${avatar(p.display_name, true)}<div><p class="eyebrow">PUBLIC COMMUNITY PROFILE</p><h1>${esc(p.display_name)}</h1><p id="profile-bio" class="community-prose"></p><small class="muted">Joined ${date(p.created_at)}</small></div>${session?.profile.id === id ? '<a class="secondary" href="/account/">Edit my profile</a>' : ""}${session?.isAdmin && session.profile.id !== id ? '<button class="secondary" id="profile-restrict">Posting restrictions</button>' : ""}</section><div class="profile-columns"><section class="panel"><h2>Discussions</h2>${data.discussions.map((d) => `<a class="profile-contribution" href="/discussions/${d.id}/">${categoryTag(d.category)}<strong>${esc(d.title)}</strong><small>${date(d.created_at)}</small></a>`).join("") || '<p class="fine muted">No public discussions yet.</p>'}</section><section class="panel"><h2>Replies</h2>${data.replies.map((r) => `<a class="profile-contribution" href="/discussions/${r.discussion_id}/"><strong>${esc(r.title)}</strong><span>${esc(r.excerpt)}</span></a>`).join("") || '<p class="fine muted">No public replies yet.</p>'}</section></div><p class="fine muted">Showing up to 20 recent public contributions per type. Account emails and private account identifiers are never shown.</p>`;
    $("#profile-bio").textContent = p.bio || "A member of the SOMAS community.";
    if ($("#profile-restrict"))
      $("#profile-restrict").onclick = () =>
        moderateItem("profile", id, () => profileView(root, id));
  } catch (e) {
    root.innerHTML = '<p role="alert"></p>';
    root.firstChild.textContent = e.message;
  }
}
function safeReturn() {
  const target =
    new URLSearchParams(location.search).get("return_to") || "/discussions/";
  return /^\/discussions(?:\/|$)/.test(target) && !target.includes("\\")
    ? target
    : "/discussions/";
}
async function accountView(root) {
  root.innerHTML = communityBar();
  if (!session) {
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="account-layout"><section><p class="eyebrow">A REAL COMMUNITY ACCOUNT</p><h1>Ideas grow<br>through conversation.</h1><p class="muted">Sign in to share a perspective, ask a question, or help shape SOMAS.</p><div class="account-illustration">${avatar("Your Voice", true)}<span>✦</span>${avatar("Our Future", true)}</div><p class="fine muted">No AI workspace or paid subscription is created. Contributor inquiries are separate. Email addresses are private and self-reported.</p></section><section class="panel account-form"><div class="account-tabs"><button class="selected" data-auth="login">Sign in</button><button data-auth="register">Create account</button></div><h2 id="auth-title">Welcome back.</h2><form id="authForm"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="180"></label><label>Password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"></label><p class="fine muted">12–128 characters. No verification code is requested.</p><div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div><button class="primary" id="auth-submit">Sign in ↗</button><p class="form-message" role="status"></p></form></section></div>`,
    );
    let mode = "login";
    root.querySelectorAll("[data-auth]").forEach(
      (b) =>
        (b.onclick = () => {
          mode = b.dataset.auth;
          root
            .querySelectorAll("[data-auth]")
            .forEach((x) => x.classList.toggle("selected", x === b));
          $("#auth-title").textContent =
            mode === "login" ? "Welcome back." : "A new perspective.";
          $("#auth-submit").textContent =
            mode === "login" ? "Sign in ↗" : "Create account ↗";
          root.querySelector("[name=password]").autocomplete =
            mode === "login" ? "current-password" : "new-password";
        }),
    );
    $("#authForm").onsubmit = async (e) => {
      e.preventDefault();
      const b = $("#auth-submit"),
        s = e.currentTarget.querySelector("[role=status]");
      b.disabled = true;
      flash(s, "Connecting securely…");
      try {
        session = await api(
          "/api/auth/" + mode,
          "POST",
          Object.fromEntries(new FormData(e.currentTarget)),
        );
        location.assign(
          mode === "register" ? "/account/?welcome=true" : safeReturn(),
        );
      } catch (error) {
        flash(s, error.message, true);
        b.disabled = false;
      }
    };
    return;
  }
  root.insertAdjacentHTML(
    "beforeend",
    `<div class="section-head"><div><p class="eyebrow">YOUR COMMUNITY SPACE</p><h1>Your voice. Your profile.</h1></div><button class="secondary" id="sign-out">Sign out</button></div>${session.profile.suspended ? '<p class="restriction-notice">Posting is restricted for this account. You can still read discussions and notifications. Contact the SOMAS team to appeal.</p>' : ""}<div class="account-columns"><section class="panel"><h2>Your public profile</h2><form id="profile-form"><label>Display name<input name="display_name" minlength="2" maxlength="50" required value="${esc(session.profile.display_name)}"></label><label>Short introduction<textarea name="bio" rows="4" maxlength="500">${esc(session.profile.bio)}</textarea></label><p class="fine muted">These fields are public. Never include your email or other private information here.</p><button class="primary">Save profile</button><p class="form-message" role="status"></p></form><a class="back-link" href="/discussions/profiles/${session.profile.id}/">View my public profile ↗</a></section><section class="panel inbox"><div class="section-head"><h2>Your inbox</h2><button class="text-button" id="refresh-notices">Refresh</button></div><p class="fine muted">Replies to conversations you follow. Private, database-backed notifications; refresh to check for updates.</p><div id="notification-list" aria-live="polite"></div><button class="secondary" id="mark-read">Mark all as read</button></section></div>`,
  );
  $("#sign-out").onclick = async () => {
    try {
      await api("/api/auth/logout", "POST", {});
      session = null;
      await accountView(root);
    } catch (e) {
      alertStatus(root, e.message);
    }
  };
  $("#profile-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      const data = await api(
        "/api/community/me",
        "PUT",
        Object.fromEntries(new FormData(f)),
      );
      session.profile = data.profile;
      flash(f.querySelector("[role=status]"), "Your public profile was saved.");
    } catch (error) {
      flash(f.querySelector("[role=status]"), error.message, true);
    } finally {
      b.disabled = false;
    }
  };
  const notices = async () => {
    try {
      const data = await api("/api/community/notifications");
      $("#notification-list").innerHTML =
        data.notifications
          .map(
            (n) =>
              `<a class="notification ${n.read_at ? "read" : ""}" href="/discussions/${n.discussion_id}/"><span>${n.kind === "official" ? "Official SOMAS response" : "New reply"}</span><strong>${esc(n.title)}</strong><small>${date(n.created_at)}</small></a>`,
          )
          .join("") ||
        '<p class="fine muted">You’re all caught up. Follow a discussion to receive reply updates.</p>';
    } catch (e) {
      $("#notification-list").textContent = e.message;
    }
  };
  $("#refresh-notices").onclick = notices;
  $("#mark-read").onclick = async () => {
    try {
      await api("/api/community/notifications/read", "POST", {});
      await notices();
    } catch (e) {
      alertStatus(root, e.message);
    }
  };
  await notices();
}
function alertStatus(root, message) {
  let node = root.querySelector(".community-alert");
  if (!node) {
    node = document.createElement("p");
    node.className = "community-alert form-message error";
    node.role = "alert";
    root.prepend(node);
  }
  node.textContent = message;
}
function moderateItem(kind, id, done, initial) {
  if (!session?.isAdmin) return;
  const actions =
    kind === "profile"
      ? ["suspend", "unsuspend"]
      : kind === "report"
        ? ["resolve_report"]
        : kind === "reply"
          ? ["hide", "restore", "delete", "official"]
          : [
              "pin",
              "unpin",
              "lock",
              "unlock",
              "hide",
              "restore",
              "delete",
              "official",
              "suggestion",
            ];
  const d = dialog(
    "SOMAS moderation",
    `<p class="fine muted">Actions require administrator authorization and are saved in the private moderation history.</p><form><label>Action<select name="action">${actions.map((a) => `<option ${a === initial ? "selected" : ""}>${a}</option>`).join("")}</select></label>${kind === "discussion" ? `<label>Suggestion state · only for idea discussions<select name="state">${states.map((s) => `<option value="${s}">${words(s)}</option>`).join("")}</select></label>` : ""}<label>Reason<textarea name="reason" rows="3" minlength="3" maxlength="500" required></textarea></label><button class="primary">Apply moderation</button><p class="form-message" role="status"></p></form>`,
  );
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.currentTarget.querySelector("button");
    b.disabled = true;
    try {
      await api("/api/community/admin/moderate", "POST", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        id,
        kind,
      });
      d.close();
      await done();
    } catch (error) {
      flash(d.querySelector("[role=status]"), error.message, true);
      b.disabled = false;
    }
  };
}
async function moderationView(root) {
  if (!session?.isAdmin) {
    root.innerHTML = `<div class="community-empty panel"><h1>Private moderation.</h1><p>Only the configured SOMAS administrator may review reports and manage official community states.</p>${!session ? signIn() : '<a href="/discussions/">Return to the community</a>'}</div>`;
    return;
  }
  root.innerHTML = '<p role="status">Loading private moderation…</p>';
  try {
    const data = await api("/api/community/admin/review");
    root.innerHTML = `${communityBar()}<div class="section-head"><div><p class="eyebrow">SOMAS TEAM / PRIVATE</p><h1>Community stewardship.</h1><p class="muted">Review reports. Protect the conversation. Listen for the next useful idea.</p></div><button class="primary" data-new data-announcement>Publish announcement ↗</button></div><div class="moderation-columns"><section class="panel"><h2>Open reports · ${data.reports.length}</h2>${data.reports.map((r) => `<article class="moderation-item"><span class="badge">${r.reply_id ? "Reply" : "Discussion"} report</span><h3>${esc(r.title)}</h3><p>${esc(r.reason)}</p><details><summary>Reported content</summary><p class="community-prose">${esc(r.content)}</p></details><div class="thread-actions"><button class="secondary" data-mod-kind="${r.reply_id ? "reply" : "discussion"}" data-mod-id="${r.reply_id || r.discussion_id}">Moderate content</button><button class="text-button" data-mod-kind="profile" data-mod-id="${r.target_profile_id}">Restrict author</button><button class="text-button" data-mod-kind="report" data-mod-id="${r.id}">Resolve report</button></div></article>`).join("") || '<p class="fine muted">No open reports.</p>'}</section><section class="panel"><h2>Suggestions to consider</h2>${data.suggestions.map((s) => `<article class="moderation-item"><span class="suggestion-label">${words(s.suggestion_state)}</span><h3><a href="/discussions/${s.id}/">${esc(s.title)}</a></h3><p class="fine muted">${s.votes} genuine upvotes</p><button class="text-button" data-mod-kind="discussion" data-mod-id="${s.id}" data-initial="suggestion">Update official status</button></article>`).join("") || '<p class="fine muted">No suggestions yet.</p>'}</section><section class="panel"><h2>Hidden & removed content</h2>${[...data.hidden.map((d) => ({ ...d, kind: "discussion", label: d.title })), ...data.hiddenReplies.map((r) => ({ ...r, kind: "reply", label: r.excerpt }))].map((r) => `<article class="moderation-item"><span class="badge">${r.status}</span><p>${esc(r.label)}</p><button class="text-button" data-mod-kind="${r.kind}" data-mod-id="${r.id}" data-initial="restore">Review / restore</button></article>`).join("") || '<p class="fine muted">No hidden or deleted content.</p>'}</section><section class="panel"><h2>Posting restrictions</h2>${data.restricted.map((p) => `<p>${esc(p.display_name)} <button class="text-button" data-mod-kind="profile" data-mod-id="${p.id}" data-initial="unsuspend">Review restriction</button></p>`).join("") || '<p class="fine muted">No restricted accounts.</p>'}<h2>Recent moderation history</h2>${data.audit.map((a) => `<article class="audit-event"><strong>${esc(a.action)}</strong><p>${esc(a.reason)}</p><small>${date(a.created_at)} · ${a.target_id.slice(0, 8)}</small></article>`).join("") || '<p class="fine muted">No moderation actions yet.</p>'}</section></div><p class="fine muted">Bounded review: up to 100 reports, 50 suggestions and 50 recent audit events. Public feedback never executes AI actions.</p>`;
    root
      .querySelectorAll("[data-mod-id]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            moderateItem(
              b.dataset.modKind,
              b.dataset.modId,
              () => moderationView(root),
              b.dataset.initial,
            )),
      );
    bindNew(root);
  } catch (e) {
    root.innerHTML = '<p role="alert"></p>';
    root.firstChild.textContent = e.message;
  }
}
