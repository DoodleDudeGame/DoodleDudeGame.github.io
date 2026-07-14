const WINNERS_DATA_URL = "data/winners.json";

function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function fetchWinners() {
  const res = await fetch(WINNERS_DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load winners.json (${res.status})`);
  const data = await res.json();
  return [...data].sort((a, b) => (a.date < b.date ? 1 : -1));
}

function winnerCardHTML(winner) {
  const link = winner.instagram_url || "#";
  return `
    <a class="winner-card" href="${link}" target="_blank" rel="noopener">
      <div class="photo">
        <img src="${winner.image_url}" alt="Winning drawing by ${winner.winner_name}" loading="lazy">
      </div>
      <div class="info">
        <span class="date">${formatDate(winner.date)}</span>
        <span class="prompt">${winner.prompt}</span>
        <span class="name">${winner.winner_name}</span>
      </div>
    </a>
  `;
}

function winnerHighlightHTML(winner) {
  return `
    <div class="winner-photo">
      <img src="${winner.image_url}" alt="Winning drawing by ${winner.winner_name}" loading="lazy">
    </div>
    <div class="winner-copy">
      <span class="badge">Winner!</span>
      <p class="date" style="color:var(--warm-gray); font-weight:600; text-transform:uppercase; letter-spacing:.06em; font-size:.85rem;">${formatDate(winner.date)}</p>
      <h3>${winner.prompt}</h3>
      <p>${winner.caption || ""}</p>
      <p><strong>${winner.winner_name}</strong></p>
      ${winner.instagram_url ? `<a class="btn btn-outline" href="${winner.instagram_url}" target="_blank" rel="noopener">See it on Instagram</a>` : ""}
    </div>
  `;
}

async function renderArchive() {
  const grid = document.getElementById("archive-grid");
  if (!grid) return;
  try {
    const winners = await fetchWinners();
    if (!winners.length) {
      grid.outerHTML = `<div class="archive-empty"><p>No winners posted yet. Check back Wednesday.</p></div>`;
      return;
    }
    grid.innerHTML = winners.map(winnerCardHTML).join("");
  } catch (err) {
    grid.outerHTML = `<div class="archive-error"><p>Couldn't load the archive right now. Try refreshing.</p></div>`;
  }
}

async function renderRecentWinner() {
  const slot = document.getElementById("recent-winner");
  if (!slot) return;
  try {
    const winners = await fetchWinners();
    if (!winners.length) {
      slot.closest(".section")?.remove();
      return;
    }
    slot.innerHTML = winnerHighlightHTML(winners[0]);
  } catch (err) {
    slot.closest(".section")?.remove();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderArchive();
  renderRecentWinner();
});
