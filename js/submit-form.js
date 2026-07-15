// Native submission form. Replaces the old embedded Google Form.
//
// SETUP REQUIRED: point this at your Apps Script "submission handler" web app
// (see apps-script/submit-handler.gs for the code to deploy). Until this URL
// is filled in, the form will show a friendly "not connected yet" message
// instead of silently failing.
const SUBMIT_WEBHOOK_URL = ""; // e.g. "https://script.google.com/macros/s/XXXXXXXX/exec"

const VERIFIED_EMAIL_KEY = "ddg_verified_email";

// Populates the "which prompt is this for?" dropdown the same way the real
// Google Form's dropdown works: yesterday's prompt and today's prompt, live
// from submit-handler.gs's doGet (which reads the 2026_historicalpromptlist
// sheet). Defaults to today's.
async function loadPromptOptions(selectEl) {
  if (!SUBMIT_WEBHOOK_URL) {
    selectEl.innerHTML = `<option value="">Couldn't load prompts, type it in below</option>`;
    return;
  }
  try {
    const res = await fetch(SUBMIT_WEBHOOK_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("prompt fetch failed");
    const { yesterday, today } = await res.json();
    if (!yesterday?.prompt && !today?.prompt) throw new Error("no prompts returned");

    const options = [yesterday, today].filter((p) => p && p.prompt);
    selectEl.innerHTML = options
      .map((p) => `<option value="${p.prompt}" data-date="${p.date}">${p.prompt}${p === today ? " (today)" : ""}</option>`)
      .join("");

    if (today?.prompt) selectEl.value = today.prompt;
  } catch (err) {
    selectEl.innerHTML = `<option value="">Couldn't load prompts, type it in below</option>`;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("submit-form");
  if (!form) return;

  const promptInput = document.getElementById("submit-prompt");
  const msg = document.getElementById("submit-form-msg");

  if (promptInput) loadPromptOptions(promptInput);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("button[type=submit]");
    const email = sessionStorage.getItem(VERIFIED_EMAIL_KEY) || "";
    const prompt = promptInput.value.trim();
    const caption = document.getElementById("submit-caption").value.trim();
    const fileInput = document.getElementById("submit-photo");
    const file = fileInput.files[0];

    msg.hidden = true;

    if (!file) {
      msg.textContent = "Please choose a photo of your sketch first.";
      msg.hidden = false;
      return;
    }

    if (!SUBMIT_WEBHOOK_URL) {
      msg.textContent = "Submissions aren't connected yet. Check back soon while we finish wiring this up.";
      msg.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      const base64 = await fileToBase64(file);
      // text/plain avoids a CORS preflight; Apps Script parses the JSON body regardless.
      const response = await fetch(SUBMIT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          email,
          prompt,
          caption,
          file: {
            data: base64,
            mimeType: file.type,
            filename: file.name,
          },
        }),
      });
      const data = await response.json();

      if (data.success) {
        form.reset();
        promptInput.value = prompt;
        msg.textContent = "Got it! Your doodle's in. Check back once winners are posted.";
        msg.hidden = false;
      } else {
        msg.textContent = data.error || "Something went wrong submitting that. Try again in a moment.";
        msg.hidden = false;
      }
    } catch (err) {
      msg.textContent = "Something went wrong submitting that. Try again in a moment.";
      msg.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit my doodle";
    }
  });
});
