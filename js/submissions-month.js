document.querySelector(".gated-content")?.addEventListener("ddg:unlocked", initMonthPage);

async function initMonthPage() {
  const container = document.getElementById("month-container");
  const select = document.getElementById("month-select");
  if (!container || container.dataset.loaded) return;
  container.dataset.loaded = "true";

  const months = await ddgLoadMonthIndex();

  if (!months.length) {
    container.innerHTML = `<div class="archive-empty"><p>No submissions posted yet. Check back soon.</p></div>`;
    select.closest(".month-picker")?.setAttribute("hidden", "");
    return;
  }

  select.innerHTML = months.map((m) => `<option value="${m}">${ddgFormatMonth(m)}</option>`).join("");
  const winnerKeys = await ddgLoadWinnerKeys();

  async function renderMonth(monthStr) {
    container.innerHTML = `<div class="archive-empty"><p>Loading…</p></div>`;
    const entries = await ddgLoadMonth(monthStr);
    if (!entries.length) {
      container.innerHTML = `<div class="archive-empty"><p>No submissions for ${ddgFormatMonth(monthStr)} yet.</p></div>`;
      return;
    }
    const byDay = ddgGroupByDay(entries);
    container.innerHTML = byDay.map((day) => ddgDaySectionHTML(day, winnerKeys)).join("");
  }

  select.addEventListener("change", () => renderMonth(select.value));
  renderMonth(months[0]);
}
