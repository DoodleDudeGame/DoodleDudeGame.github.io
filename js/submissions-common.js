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

function ddgSubmissionCardHTML(entry, isWinner) {
  return `
    <div class="submission-card${isWinner ? " is-winner" : ""}">
      ${isWinner ? `<span class="winner-ribbon">Winner</span>` : ""}
      <div class="photo">
        <img src="${entry.image_url}" alt="Doodle by ${entry.submitter_name}" loading="lazy">
      </div>
      <div class="info">
        <span class="name">${entry.submitter_name}</span>
        ${entry.caption ? `<p class="caption">${entry.caption}</p>` : ""}
      </div>
    </div>
  `;
}

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
