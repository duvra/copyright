/* ========= Utilities ========= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const STORAGE_KEY = "yt_strikes";

function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  const d2 = new Date(d.getTime() - off*60*1000);
  return d2.toISOString().slice(0,10);
}
function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

const YT_ID_REGEXES = [
  /(?:^|\/)watch\?[^#]*\bv=([\w-]{11})/i,       // youtube.com/watch?v=ID
  /youtu\.be\/([\w-]{11})(?:[?&#].*)?$/i,       // youtu.be/ID
  /youtube\.com\/shorts\/([\w-]{11})/i,         // shorts/ID
  /youtube\.com\/embed\/([\w-]{11})/i,          // embed/ID
  /youtube\.com\/live\/([\w-]{11})/i            // live/ID
];

function extractVideoId(url){
  if (!url) return null;
  url = url.trim().replace(/^https?:\/\/(m\.|music\.)/i, "https://www.");
  for (const re of YT_ID_REGEXES){
    const m = url.match(re);
    if (m) return m[1];
  }
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
  } catch {}
  return null;
}

function thumbUrl(vid){ return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`; }

async function fetchJson(url){
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch { return null; }
}

/* Get metadata via oEmbed (primary) then noembed (fallback). Always returns id + thumbnail at minimum. */
async function fetchMetaByUrl(url){
  const id = extractVideoId(url);
  let title = null, author = null, thumbnail = id ? thumbUrl(id) : null;

  const oe = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (oe && oe.title){
    return {
      id,
      title: oe.title,
      author: oe.author_name || null,
      thumbnail: oe.thumbnail_url || thumbnail,
      url
    };
  }
  const ne = await fetchJson(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
  if (ne && ne.title){
    return {
      id,
      title: ne.title,
      author: ne.author_name || null,
      thumbnail: ne.thumbnail_url || thumbnail,
      url
    };
  }
  return { id, title, author, thumbnail, url };
}

/* ========= Local Storage ========= */
function loadStrikes(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveStrikes(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/* ========= Index (new notice) ========= */
function makeVideoRow(initialUrl=""){
  const row = document.createElement("div");
  row.className = "video-row";
  row.innerHTML = `
    <div class="field">
      <label>YouTube Video URL <span class="req">*</span></label>
      <input type="url" class="video-url" placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX" value="${initialUrl}">
    </div>
    <div class="field">
      <label>Timestamps (optional)</label>
      <input type="text" class="video-stamps" placeholder="e.g., 00:10-00:45; 02:00-02:15">
    </div>
    <div class="field">
      <label>Detected Title</label>
      <input type="text" class="video-title" placeholder="(auto)" readonly>
    </div>
    <button type="button" class="btn outline remove">Remove</button>

    <div class="video-meta" hidden>
      <img alt="Video thumbnail" class="vm-thumb" />
      <div>
        <div class="vm-title"></div>
        <div class="vm-author"></div>
      </div>
    </div>
  `;

  const urlInput = $(".video-url", row);
  const titleInput = $(".video-title", row);
  const vm = $(".video-meta", row);
  const vmTitle = $(".vm-title", row);
  const vmAuthor = $(".vm-author", row);
  const vmThumb = $(".vm-thumb", row);

  let debounce;
  const updatePreview = async () => {
    const url = urlInput.value.trim();
    if (!url) { vm.hidden = true; titleInput.value = ""; return; }
    const id = extractVideoId(url);
    if (!id){ vm.hidden = true; titleInput.value = ""; return; }

    // Always show a thumbnail immediately (even if metadata fetch fails)
    vmThumb.src = thumbUrl(id);
    vm.hidden = false;
    vmTitle.textContent = "Fetching title…";
    vmAuthor.textContent = "";
    titleInput.value = "";

    const meta = await fetchMetaByUrl(url);
    // Update only if the same ID is still present (avoid race conditions)
    if (extractVideoId(urlInput.value.trim()) === id){
      if (meta?.title) { vmTitle.textContent = meta.title; titleInput.value = meta.title; }
      else { vmTitle.textContent = "(Title unavailable)"; }
      vmAuthor.textContent = meta?.author ? `by ${meta.author}` : "";
      if (meta?.thumbnail) vmThumb.src = meta.thumbnail;
    }
  };

  urlInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(updatePreview, 300);
  });
  urlInput.addEventListener("blur", updatePreview);

  $(".remove", row).addEventListener("click", () => {
    row.remove();
    ensureAtLeastOneVideo();
  });

  if (initialUrl) updatePreview();
  return row;
}

function ensureAtLeastOneVideo(){
  const wrap = $("#videos");
  if (!wrap.children.length) wrap.appendChild(makeVideoRow());
}

function initIndexPage(){
  const year = $("#year"); if (year) year.textContent = new Date().getFullYear();
  const dateEl = $("#date"); if (dateEl) dateEl.value = todayISO();

  ensureAtLeastOneVideo();
  $("#addVideo").addEventListener("click", () => {
    $("#videos").appendChild(makeVideoRow());
  });

  $("#strikeForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    // Collect
    const workTitle = $("#workTitle").value.trim();
    const workType  = $("#workType").value.trim();
    const desc      = $("#infringementDesc").value.trim();
    const sig       = $("#signature").value.trim();
    const date      = $("#date").value;
    const att1      = $("#attestGoodFaith").checked;
    const att2      = $("#attestAccuracy").checked;

    // Validate (pure JS; browser won't auto-block)
    const errors = [];
    if (!workTitle) errors.push("Title of your work is required.");
    if (!att1 || !att2) errors.push("You must check both legal attestations.");
    if (!sig) errors.push("Electronic signature is required.");

    const rows = $$(".video-row");
    if (!rows.length) errors.push("At least one video is required.");

    const toAdd = [];
    for (const row of rows){
      const url = $(".video-url", row).value.trim();
      if (!url){ errors.push("A video URL is empty."); continue; }
      const id = extractVideoId(url);
      if (!id){ errors.push(`Invalid YouTube URL: ${url}`); continue; }
      const title = $(".video-title", row).value.trim();
      const stamps = $(".video-stamps", row).value.trim();
      toAdd.push({ url, id, title, stamps });
    }

    if (errors.length){
      alert("Please fix the following:\n\n- " + errors.join("\n- "));
      return;
    }

    // Fetch any missing titles (doesn't block thumbnail)
    await Promise.all(toAdd.map(async item => {
      if (!item.title){
        const meta = await fetchMetaByUrl(item.url);
        if (meta?.title) item.title = meta.title;
      }
    }));

    // Build & save strikes (one per video)
    const strikes = loadStrikes();
    const now = new Date().toISOString();
    toAdd.forEach(item => {
      strikes.push({
        id: uid(),
        createdAt: now,
        date,
        workTitle,
        workType: workType || null,
        infringementDesc: desc || null,
        video: {
          url: item.url,
          id: item.id,
          title: item.title || "(title unavailable)",
          thumbnail: thumbUrl(item.id),
          timestamps: item.stamps || null
        },
        attest: { goodFaith: att1, accuracy: att2 },
        signature: sig
      });
    });
    strikes.sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    saveStrikes(strikes);

    // Redirect to chart
    location.href = "strikes.html";
  });
}

/* ========= Strikes (history chart) ========= */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function makeRow(s){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${s.date || ""}</td>
    <td>
      <div style="display:flex;flex-direction:column;gap:6px">
        <a href="${s.video.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.video.title)}</a>
        <div class="muted tiny">${s.video.timestamps ? `Timestamps: ${escapeHtml(s.video.timestamps)}` : ""}</div>
      </div>
    </td>
    <td>
      <a href="${s.video.url}" target="_blank" rel="noopener noreferrer">
        <img class="thumb" src="${s.video.thumbnail}" alt="Video thumbnail">
      </a>
    </td>
    <td>
      <div><strong>${escapeHtml(s.workTitle)}</strong></div>
      <div class="muted tiny">${s.workType ? escapeHtml(s.workType) : ""}</div>
    </td>
  `;
  return tr;
}

function initStrikesPage(){
  const year = $("#year"); if (year) year.textContent = new Date().getFullYear();

  const tbody = $("#strikesBody");
  const list = loadStrikes();
  if (!list.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">No strikes submitted yet.</td>`;
    tbody.appendChild(tr);
  } else {
    list.forEach(s => tbody.appendChild(makeRow(s)));
  }
  $("#summary").textContent = `${list.length} strike${list.length===1?"":"s"} stored locally.`;

  $("#clearHistory").addEventListener("click", () => {
    if (confirm("This will clear your local strike history (cannot be undone). Continue?")){
      saveStrikes([]);
      location.reload();
    }
  });
}

/* ========= Auto-router ========= */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("strikeForm")) initIndexPage();
  if (document.getElementById("strikesTable")) initStrikesPage();
});
