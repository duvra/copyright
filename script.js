// Helpers
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const YT_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]{11}(?:[^\s]*)?|youtu\.be\/[\w-]{11}(?:[^\s]*)?)$/i;

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const d2 = new Date(d.getTime() - off*60*1000);
  return d2.toISOString().slice(0,10);
}

function encodeMailtoBody(text){
  return encodeURIComponent(text).replace(/%20/g, "+");
}

// Build dynamic video row
function videoRow(url = "", timestamps = "") {
  const row = document.createElement("div");
  row.className = "video-row";
  row.innerHTML = `
    <div class="field">
      <label>YouTube Video URL <span class="req">*</span></label>
      <input type="url" class="video-url" placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX" required value="${url}">
    </div>
    <div class="field">
      <label>Timestamps (optional)</label>
      <input type="text" class="video-stamps" placeholder="e.g., 00:10-00:45; 02:00-02:15" value="${timestamps}">
    </div>
    <button type="button" class="btn outline remove">Remove</button>
  `;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    ensureAtLeastOneVideo();
  });
  return row;
}

function ensureAtLeastOneVideo(){
  const wrap = $("#videos");
  if (!wrap.children.length) {
    wrap.appendChild(videoRow());
  }
}

function collectForm() {
  const data = {
    claimant: {
      fullName: $("#fullName").value.trim(),
      organization: $("#organization").value.trim() || null,
      email: $("#email").value.trim(),
      phone: $("#phone").value.trim() || null,
      address: {
        street: $("#street").value.trim() || null,
        city: $("#city").value.trim() || null,
        state: $("#state").value.trim() || null,
        postal: $("#postal").value.trim() || null,
        country: $("#country").value.trim() || null,
      }
    },
    work: {
      title: $("#workTitle").value.trim() || null,
      description: $("#workType").value.trim() || null
    },
    infringement: {
      videos: $$(".video-row").map(row => ({
        url: $(".video-url", row).value.trim(),
        timestamps: $(".video-stamps", row).value.trim() || null
      })),
      description: $("#infringementDesc").value.trim() || null
    },
    requestedAction: {
      removeVideos: $("#removeVideos").checked,
      disableAccount: $("#disableAccount").checked
    },
    attestations: {
      goodFaith: $("#attestGoodFaith").checked,
      accuracyAndAuthority: $("#attestAccuracy").checked
    },
    signature: {
      name: $("#signature").value.trim(),
      date: $("#date").value
    }
  };
  return data;
}

function validateData(data){
  const errors = [];

  if (!data.claimant.fullName) errors.push("Full legal name is required.");
  if (!data.claimant.email) errors.push("Email is required.");

  // Validate each video URL
  const vids = data.infringement.videos;
  if (!vids.length) errors.push("At least one YouTube video URL is required.");
  vids.forEach((v, idx) => {
    if (!v.url) errors.push(`Video ${idx+1}: URL is required.`);
    else if (!YT_REGEX.test(v.url)) errors.push(`Video ${idx+1}: URL must be a valid YouTube link (youtube.com/watch?v=... or youtu.be/...).`);
  });

  if (!data.attestations.goodFaith) errors.push("You must check the good-faith attestation.");
  if (!data.attestations.accuracyAndAuthority) errors.push("You must check the accuracy/authority attestation.");

  if (!data.signature.name) errors.push("Electronic signature (full legal name) is required.");

  return errors;
}

function pretty(data){ return JSON.stringify(data, null, 2); }

function download(filename, text){
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  URL.revokeObjectURL(url); a.remove();
}

function buildEmailBody(data){
  // Compact plaintext summary for email bodies
  const lines = [];
  lines.push("DMCA-style Notice — YouTube Copyright Infringement");
  lines.push("");
  lines.push("1) Claimant");
  lines.push(`- Name: ${data.claimant.fullName}`);
  if (data.claimant.organization) lines.push(`- Organization: ${data.claimant.organization}`);
  lines.push(`- Email: ${data.claimant.email}`);
  if (data.claimant.phone) lines.push(`- Phone: ${data.claimant.phone}`);
  const a = data.claimant.address;
  if (a.street || a.city || a.state || a.postal || a.country){
    lines.push("- Address:");
    if (a.street) lines.push(`  ${a.street}`);
    lines.push(`  ${[a.city, a.state, a.postal].filter(Boolean).join(", ")}`.trim());
    if (a.country) lines.push(`  ${a.country}`);
  }
  lines.push("");
  lines.push("2) Copyrighted Work");
  if (data.work.title) lines.push(`- Title: ${data.work.title}`);
  if (data.work.description) lines.push(`- Description: ${data.work.description}`);
  lines.push("");
  lines.push("3) Infringing Material");
  data.infringement.videos.forEach((v, i) => {
    lines.push(`- Video ${i+1}: ${v.url}`);
    if (v.timestamps) lines.push(`  Timestamps: ${v.timestamps}`);
  });
  if (data.infringement.description) lines.push(`- Description: ${data.infringement.description}`);
  lines.push("");
  lines.push("4) Requested Action");
  if (data.requestedAction.removeVideos) lines.push("- Remove video(s) from YouTube");
  if (data.requestedAction.disableAccount) lines.push("- Disable access/account (repeat infringement)");
  lines.push("");
  lines.push("5) Legal Attestations");
  lines.push("- Good-faith belief: YES");
  lines.push("- Accurate & authorized under penalty of perjury: YES");
  lines.push("");
  lines.push("6) Signature");
  lines.push(`- Name: ${data.signature.name}`);
  lines.push(`- Date: ${data.signature.date}`);
  lines.push("");
  lines.push("I certify that the information above is accurate.");
  return lines.join("\n");
}

document.addEventListener("DOMContentLoaded", () => {
  // Autofill date + footer year
  $("#date").value = todayISO();
  $("#year").textContent = new Date().getFullYear();

  // Video list: start with one row
  ensureAtLeastOneVideo();
  $("#addVideo").addEventListener("click", () => {
    $("#videos").appendChild(videoRow());
  });

  // Form submit → Preview modal + download JSON
  const form = $("#strikeForm");
  const modal = $("#previewModal");
  const preview = $("#previewContent");
  const downloadBtn = $("#downloadJson");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm();
    const errors = validateData(data);

    if (errors.length){
      alert("Please fix the following:\n\n- " + errors.join("\n- "));
      return;
    }

    preview.textContent = pretty(data);
    modal.showModal();

    // Download handler (bound each open for fresh data)
    downloadBtn.onclick = () => download("youtube_copyright_notice.json", pretty(data));
  });

  $("#closePreview").addEventListener("click", () => modal.close());
  $("#closePreview2").addEventListener("click", () => modal.close());

  // Email draft
  $("#emailDraft").addEventListener("click", () => {
    const data = collectForm();
    const errors = validateData(data);
    if (errors.length){
      alert("Please fix the following before creating the email draft:\n\n- " + errors.join("\n- "));
      return;
    }
    const subject = encodeURIComponent("YouTube Copyright Infringement Notice");
    const body = encodeMailtoBody(buildEmailBody(data));

    // You can change the recipient below if you want a different mailbox.
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    window.location.href = mailto;
  });
});
