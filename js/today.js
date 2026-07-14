document.querySelector(".gated-content")?.addEventListener("ddg:unlocked", initToday);

async function initToday() {
  const grid = document.getElementById("today-grid");
  if (!grid || grid.dataset.loaded) return;
  grid.dataset.loaded = "true";

  const todayISO = ddgTodayISO();
  const month = todayISO.slice(0, 7);
  const [monthEntries, winnerKeys] = await Promise.all([ddgLoadMonth(month), ddgLoadWinnerKeys()]);
  const entries = monthEntries.filter((e) => e.date === todayISO);

  if (!entries.length) {
    grid.outerHTML = `<div class="archive-empty"><p>No submissions in yet for today. Check back later.</p></div>`;
    return;
  }

  const withFlags = entries.map((entry) => ({
    entry,
    isWinner: winnerKeys.has(ddgWinnerKey(entry.date, entry.submitter_name)),
  }));
  withFlags.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

  grid.innerHTML = withFlags.map(({ entry, isWinner }) => ddgSubmissionCardHTML(entry, isWinner)).join("");
}
