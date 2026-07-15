// Native submission form. Replaces the old embedded Google Form.
//
// SETUP REQUIRED: point this at your Apps Script "submission handler" web app
// (see apps-script/submit-handler.gs for the code to deploy). Until this URL
// is filled in, the form will show a friendly "not connected yet" message
// instead of silently failing.
const SUBMIT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwdpxGfqRl6DfxqFvztKIufRd6a4jdWb8kWiJalDXfb42YH7yaNugskkWwljmIdjgL3/exec";

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

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_LONG_EDGE = 1600; // resize target, matches scripts/import_drive_submissions.py
const JPEG_QUALITY = 0.85;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resizes/re-encodes the chosen image in-browser before upload, so large
// photos (multi-MB phone camera shots) don't get sent - or saved to
// Drive - at full size. Rejects anything the browser can't actually decode
// as an image (e.g. TIFF has no browser decoder, so this naturally catches
// it even if a file somehow got past the <input accept> filter).
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const longEdge = Math.max(img.width, img.height);
      const scale = Math.min(1, MAX_LONG_EDGE / longEdge);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Couldn't process that image."));
          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image - is it actually a PNG or JPG?"));
    };
    img.src = objectUrl;
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

    if (!ACCEPTED_TYPES.includes(file.type)) {
      msg.textContent = "Please upload a PNG or JPG - other formats like TIFF or HEIC aren't supported.";
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
      const compressed = await compressImage(file);
      const base64 = await fileToBase64(compressed);
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
            mimeType: "image/jpeg",
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
      msg.textContent = err?.message || "Something went wrong submitting that. Try again in a moment.";
      msg.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit my doodle";
    }
  });
});
