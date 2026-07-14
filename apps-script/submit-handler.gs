/**
 * DoodleDude: submission form backend.
 *
 * Receives {email, name, prompt, caption, file:{data, mimeType, filename}},
 * saves the photo to a Drive folder, and logs a row to a Sheet. This sheet +
 * folder pair is exactly what Workato should watch to pull new submissions
 * into the site.
 *
 * SETUP:
 * 1. Create a Google Drive folder for incoming submission photos, copy its
 *    ID into DRIVE_FOLDER_ID below (the long string in the folder's URL).
 * 2. Create (or open) the Sheet you want submissions logged in.
 * 3. Extensions > Apps Script, paste this file in as Code.gs.
 * 4. Deploy > New deployment > type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL into SUBMIT_WEBHOOK_URL in js/submit-form.js.
 */

const DRIVE_FOLDER_ID = "PASTE_YOUR_DRIVE_FOLDER_ID_HERE";
const SHEET_NAME = "Submissions";
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB safety cap

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (!data.file || !data.file.data) {
      return jsonResponse({ success: false, error: "No photo attached." });
    }

    const bytes = Utilities.base64Decode(data.file.data);
    if (bytes.length > MAX_FILE_BYTES) {
      return jsonResponse({ success: false, error: "Photo is too large." });
    }

    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const safeName = (data.name || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${dateStr}_${safeName}_${new Date().getTime()}`;

    const blob = Utilities.newBlob(bytes, data.file.mimeType || "image/jpeg", filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", "Date", "Email", "Name", "Prompt", "Caption",
        "Drive File ID", "Drive File URL", "Status",
      ]);
    }

    sheet.appendRow([
      new Date(),
      dateStr,
      (data.email || "").trim().toLowerCase(),
      data.name || "",
      data.prompt || "",
      data.caption || "",
      file.getId(),
      file.getUrl(),
      "pending", // Workato / manual review flips this to "approved" / "winner" etc.
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
