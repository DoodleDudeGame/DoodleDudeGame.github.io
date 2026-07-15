// Homepage scrolling ticker: today's prompt, skill, and twist, from the same
// prompt-list sheet (and Apps Script doGet) that powers the submission form's
// prompt dropdown. See apps-script/submit-handler.gs's doGet.
const TICKER_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwdpxGfqRl6DfxqFvztKIufRd6a4jdWb8kWiJalDXfb42YH7yaNugskkWwljmIdjgL3/exec";

function tickerItemHTML(label, value) {
  return `<span class="ticker-item"><span class="ticker-label">${label}</span> ${value}</span><span class="ticker-sep">•</span>`;
}

async function initTodayTicker() {
  const ticker = document.getElementById("today-ticker");
  const track = document.getElementById("today-ticker-track");
  if (!ticker || !track) return;

  try {
    const res = await fetch(TICKER_WEBHOOK_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("ticker fetch failed");
    const { today } = await res.json();
    if (!today || !today.prompt) return; // leave hidden, nothing to show yet

    const parts = [tickerItemHTML("Today's Prompt", today.prompt)];
    if (today.skill) parts.push(tickerItemHTML("Skill", today.skill));
    if (today.twist) parts.push(tickerItemHTML("Twist", today.twist));
    const setHTML = parts.join("");

    // The CSS animation slides the track by -50%, so it needs to consist of
    // two identical, back-to-back halves for the loop to be seamless - and
    // each half needs to be at least as wide as the ticker itself, or short
    // content (e.g. just one item) ends up sitting in a corner instead of
    // spanning/scrolling across the full bar. Keep doubling until that holds.
    let repeated = setHTML;
    track.innerHTML = repeated;
    ticker.hidden = false;
    while (track.scrollWidth < ticker.clientWidth && repeated.length < 20000) {
      repeated += setHTML;
      track.innerHTML = repeated;
    }
    track.innerHTML = repeated + repeated;
  } catch (err) {
    // leave hidden - no ticker is better than a broken/empty one
  }
}

document.addEventListener("DOMContentLoaded", initTodayTicker);
