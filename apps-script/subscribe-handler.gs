/**
 * DoodleDude: subscribe form backend.
 *
 * SETUP:
 * 1. Create (or open) the Google Sheet you want subscribers stored in.
 * 2. Extensions > Apps Script, paste this file in as Code.gs.
 * 3. Update SHEET_NAME below if you want a different tab name.
 * 4. Deploy > New deployment > type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL into SUBSCRIBE_WEBHOOK_URL in js/subscribe-form.js.
 *
 * This is the same pattern already used for the email-verify webhook
 * (js/email-gate.js), a public Apps Script endpoint backed by a private sheet.
 *
 * Workato: watch this sheet's "onFormSubmit"-style new-row trigger (or poll it)
 * as the subscriber source for anything that needs the subscriber list.
 */

const SUBSCRIBERS_SHEET_ID = "131TBaB_HfXCPZRGw_qvXPiZQ_QTyDsM0doyHVrUPU30"; // DoodleDudeSubscribers
// Must match the existing tab name in that spreadsheet exactly.
const SHEET_NAME = "Form Responses 1";

// Column order matches the sheet's real header row exactly:
// Timestamp | Email Address | Username or Instagram Handle | First Name |
// Last Name | Phone Number | Phone Carrier |
// How would you like to get your daily prompt? | Can we tag your username on Instagram?
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SUBSCRIBERS_SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, error: `Sheet tab "${SHEET_NAME}" not found.` });
    }

    sheet.appendRow([
      new Date(),
      (data.email || "").trim().toLowerCase(),
      data.username || "",
      data.firstName || "",
      data.lastName || "",
      data.phone || "",
      data.carrier || "",
      data.deliveryMethod || "",
      !!data.tagInstagram,
    ]);

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: "Server error: " + err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
