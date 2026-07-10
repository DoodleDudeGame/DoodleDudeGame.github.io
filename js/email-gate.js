// Gates the submission form behind an email check against the subscriber list.
// Verification happens server-side via a Google Apps Script web app so the
// actual subscriber list is never exposed in this public site's code.
const EMAIL_VERIFY_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxbpUth_jG8YQnb_fj5qpb4-PWrzX3qMhBuFyeaopOt2gwxbwvYVazdaMblH46KKjmG/exec";

const SESSION_KEY = "ddg_verified_email";

document.addEventListener("DOMContentLoaded", () => {
  const gate = document.getElementById("email-gate");
  const panel = document.getElementById("submit-panel");
  const form = document.getElementById("email-gate-form");
  const input = document.getElementById("email-gate-input");
  const msg = document.getElementById("email-gate-msg");

  if (!gate || !panel || !form) return;

  function unlock() {
    gate.hidden = true;
    panel.hidden = false;
  }

  function showMessage(text) {
    msg.textContent = text;
    msg.hidden = false;
  }

  if (sessionStorage.getItem(SESSION_KEY)) {
    unlock();
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!email) return;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Checking…";
    msg.hidden = true;

    try {
      const response = await fetch(EMAIL_VERIFY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (data.verified) {
        sessionStorage.setItem(SESSION_KEY, email);
        unlock();
      } else {
        showMessage("We couldn't find that email on our subscriber list. Sign up on the Subscribe page first, then come back.");
      }
    } catch (err) {
      showMessage("Something went wrong checking that email. Try again in a moment.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue";
    }
  });
});
