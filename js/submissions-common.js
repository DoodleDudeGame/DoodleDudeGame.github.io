// Shared helpers for today.html and submissions.html.

function ddgFormatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function ddgFormatMonth(monthStr) {
  const [year, month] = monthStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ddgTodayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function ddgLoadMonthIndex() {
  try {
    const res = await fetch("data/submissions/index.json", { cache: "no-store" });
    if (!res.ok) return [];
    const months = await res.json();
    // newest first
    return [...months].sort((a, b) => (a < b ? 1 : -1));
  } catch (err) {
    return [];
  }
}

async function ddgLoadMonth(monthStr) {
  try {
    const res = await fetch(`data/submissions/${monthStr}.json`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    return [];
  }
}

function ddgWinnerKey(date, name) {
  return `${date}|${(name || "").trim().toLowerCase()}`;
}

// A submission is "the winner" for a day once that day's date + submitter
// name shows up in data/winners.json. Loaded once and reused across pages.
async function ddgLoadWinnerKeys() {
  try {
    const res = await fetch("data/winners.json", { cache: "no-store" });
    if (!res.ok) return new Set();
    const winners = await res.json();
    return new Set(winners.map((w) => ddgWinnerKey(w.date, w.winner_name)));
  } catch (err) {
    return new Set();
  }
}

function ddgGroupByDay(entries) {
  const byDay = new Map();
  entries.forEach((entry) => {
    if (!byDay.has(entry.date)) byDay.set(entry.date, []);
    byDay.get(entry.date).push(entry);
  });
  // newest day first
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function ddgEscapeAttr(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ddgSubmissionCardHTML(entry, isWinner) {
  const entryData = ddgEscapeAttr(JSON.stringify(entry));
  return `
    <div class="submission-card${isWinner ? " is-winner" : ""}" data-entry="${entryData}">
      ${isWinner ? `<span class="winner-ribbon">Winner</span>` : ""}
      <button type="button" class="photo" aria-label="View larger doodle by ${ddgEscapeAttr(entry.submitter_name)}">
        <img src="${entry.image_url}" alt="Doodle by ${entry.submitter_name}" loading="lazy">
      </button>
      <div class="info">
        <span class="name">${entry.submitter_name}</span>
        ${entry.caption ? `<p class="caption">${entry.caption}</p>` : ""}
      </div>
    </div>
  `;
}

// ---------- lightbox (click a thumbnail to see it larger) ----------

let ddgLightboxEls = null;

function ddgEnsureLightbox() {
  if (ddgLightboxEls) return ddgLightboxEls;

  const overlay = document.createElement("div");
  overlay.className = "ddg-lightbox";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="ddg-lightbox-backdrop" data-ddg-close></div>
    <div class="ddg-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Doodle detail">
      <button type="button" class="ddg-lightbox-close" data-ddg-close aria-label="Close">&times;</button>
      <div class="ddg-lightbox-photo">
        <img alt="">
      </div>
      <div class="ddg-lightbox-info">
        <span class="ddg-lightbox-date"></span>
        <span class="ddg-lightbox-prompt"></span>
        <span class="ddg-lightbox-name"></span>
        <p class="ddg-lightbox-caption"></p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const els = {
    overlay,
    img: overlay.querySelector(".ddg-lightbox-photo img"),
    date: overlay.querySelector(".ddg-lightbox-date"),
    prompt: overlay.querySelector(".ddg-lightbox-prompt"),
    name: overlay.querySelector(".ddg-lightbox-name"),
    caption: overlay.querySelector(".ddg-lightbox-caption"),
    trigger: null,
  };

  function close() {
    overlay.hidden = true;
    document.body.classList.remove("ddg-lightbox-open");
    if (els.trigger) els.trigger.focus();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-ddg-close]")) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  els.close = close;
  ddgLightboxEls = els;
  return els;
}

function ddgOpenLightbox(entry, trigger) {
  const els = ddgEnsureLightbox();
  els.trigger = trigger || null;
  els.img.src = entry.image_url;
  els.img.alt = `Doodle by ${entry.submitter_name}`;
  els.date.textContent = entry.date ? ddgFormatDate(entry.date) : "";
  els.date.hidden = !entry.date;
  els.prompt.textContent = entry.prompt || "";
  els.prompt.hidden = !entry.prompt;
  els.name.textContent = entry.submitter_name || "";
  els.caption.textContent = entry.caption || "";
  els.caption.hidden = !entry.caption;
  els.overlay.hidden = false;
  document.body.classList.add("ddg-lightbox-open");
  els.overlay.querySelector(".ddg-lightbox-close").focus();
}

document.addEventListener("click", (e) => {
  const photoBtn = e.target.closest(".submission-card .photo");
  if (!photoBtn) return;
  const card = photoBtn.closest(".submission-card");
  if (!card || !card.dataset.entry) return;
  try {
    const entry = JSON.parse(card.dataset.entry);
    ddgOpenLightbox(entry, photoBtn);
  } catch (err) {
    // ignore malformed entry data
  }
});

// winnerKeys is optional (a Set from ddgLoadWinnerKeys). When present, the
// day's winner (if any) is sorted first and gets the gold filigree treatment.
function ddgDaySectionHTML([date, entries], winnerKeys) {
  const prompt = entries[0] && entries[0].prompt ? entries[0].prompt : "";
  const withFlags = entries.map((entry) => ({
    entry,
    isWinner: !!winnerKeys && winnerKeys.has(ddgWinnerKey(entry.date, entry.submitter_name)),
  }));
  withFlags.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

  return `
    <div class="day-section">
      <div class="day-heading">
        <h3>${ddgFormatDate(date)}</h3>
        ${prompt ? `<span class="day-prompt">${prompt}</span>` : ""}
      </div>
      <div class="submission-grid">
        ${withFlags.map(({ entry, isWinner }) => ddgSubmissionCardHTML(entry, isWinner)).join("")}
      </div>
    </div>
  `;
}
