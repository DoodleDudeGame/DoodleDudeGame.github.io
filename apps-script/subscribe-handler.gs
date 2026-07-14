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

const SHEET_NAME = "Subscribers";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", "First Name", "Last Name", "Username", "Email",
        "Phone", "Carrier", "Delivery Method", "Tag on Instagram",
      ]);
    }

    sheet.appendRow([
      new Date(),
      data.firstName || "",
      data.lastName || "",
      data.username || "",
      (data.email || "").trim().toLowerCase(),
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
