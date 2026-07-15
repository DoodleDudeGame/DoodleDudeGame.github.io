// Native subscribe form. Replaces the old embedded Google Form.
//
// SETUP REQUIRED: point this at your Apps Script "subscribe handler" web app
// (see apps-script/subscribe-handler.gs for the code to deploy). Until this
// URL is filled in, the form will show a friendly "not connected yet" message
// instead of silently failing.
const SUBSCRIBE_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzLBKD93juxKELi_j9u0PuKE5m4Zvi95vhAkmWp2TP-pS0_LuS7SBbDv9Q50p3_qbYn/exec";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("subscribe-form");
  if (!form) return;

  const msg = document.getElementById("subscribe-form-msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("button[type=submit]");
    msg.hidden = true;

    const payload = {
      email: document.getElementById("sub-email").value.trim(),
      username: document.getElementById("sub-username").value.trim(),
      firstName: document.getElementById("sub-first-name").value.trim(),
      lastName: document.getElementById("sub-last-name").value.trim(),
      phone: document.getElementById("sub-phone").value.trim(),
      carrier: document.getElementById("sub-carrier").value,
      deliveryMethod: document.getElementById("sub-delivery").value,
      tagInstagram: document.getElementById("sub-tag-ig").checked,
    };

    if (!SUBSCRIBE_WEBHOOK_URL) {
      msg.textContent = "Signups aren't connected yet. Check back soon while we finish wiring this up.";
      msg.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Joining…";

    try {
      // text/plain avoids a CORS preflight; Apps Script parses the JSON body regardless.
      const response = await fetch(SUBSCRIBE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.success) {
        form.reset();
        msg.textContent = "You're in! Watch for your first prompt.";
        msg.hidden = false;
      } else {
        msg.textContent = data.error || "Something went wrong signing you up. Try again in a moment.";
        msg.hidden = false;
      }
    } catch (err) {
      msg.textContent = "Something went wrong signing you up. Try again in a moment.";
      msg.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Join Dudes That Doodle";
    }
  });
});
