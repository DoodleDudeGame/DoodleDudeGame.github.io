/**
 * DoodleDude: submission form backend.
 *
 * Receives {email, prompt, caption, file:{data, mimeType, filename}}, saves
 * the photo to a Drive folder, and logs a row to a Sheet. This sheet + folder
 * pair is exactly what Workato should watch to pull new submissions into the
 * site.
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

const DRIVE_FOLDER_ID = "1ZWdJ34FdPb5wh9Fft5E8wYUota0A0uaSoKm88OKVp5ToiRTgJFLFKGWhBgigppUyf03RInUg";
const RESPONSES_SHEET_ID = "1lzi9OJQXuWO1CEO8rS5zS_P_tKMHH4-XoQM72C5TNzo"; // "Doodle Dude (Responses)"
// Must match the existing tab name in that spreadsheet exactly.
const SHEET_NAME = "Form Responses 2";
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB safety cap - note Apps Script's own
// request-size ceiling may reject very large base64 payloads before this check runs.

// Same subscriber sheet the email-gate check reads, used here to look up the
// submitter's Username/Instagram handle by email for filenames.
const SUBSCRIBERS_SHEET_ID = "131TBaB_HfXCPZRGw_qvXPiZQ_QTyDsM0doyHVrUPU30"; // DoodleDudeSubscribers
const SUBSCRIBERS_TAB = "Form Responses 1";

// Looks up the Username or Instagram Handle for a given email from the
// subscriber sheet. Returns "" if not found.
function lookupUsername(email) {
  if (!email) return "";
  const sheet = SpreadsheetApp.openById(SUBSCRIBERS_SHEET_ID).getSheetByName(SUBSCRIBERS_TAB);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const emailCol = header.indexOf("Email Address");
  const usernameCol = header.indexOf("Username or Instagram Handle");
  if (emailCol === -1 || usernameCol === -1) return "";

  const target = email.trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][emailCol] || "").trim().toLowerCase();
    if (rowEmail === target) return String(data[i][usernameCol] || "");
  }
  return "";
}

// Same source the live Google Form's "Select Prompt" dropdown pulls from
// (see the existing updateFormDropdown() script) - kept in sync here so the
// native form offers the same two choices: yesterday's prompt and today's.
const PROMPT_LIST_SHEET_ID = "1YaVDbKVr5piz-COjXCyBozLVwkq0Kzlj6NnFFUGPinU";
const PROMPT_LIST_TAB = "2026_historicalpromptlist";

// GET handler: returns { yesterday: {date, prompt}, today: {date, prompt,
// skill, twist} } for the native form's prompt dropdown and the homepage
// ticker to fetch instead of a static JSON file. Column layout in the
// prompt-list sheet: A=date, B=prompt, C=skill, D=twist.
function doGet(e) {
  const sheet = SpreadsheetApp.openById(PROMPT_LIST_SHEET_ID).getSheetByName(PROMPT_LIST_TAB);
  const lastRow = sheet.getLastRow();
  const formatDate = (d) => Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const todayString = formatDate(today);
  const yesterdayString = formatDate(yesterday);

  let yesterdayPrompt = "";
  let todaySkill = "";
  let todayTwist = "";
  let todayPrompt = "";

  if (lastRow >= 2) {
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      const cellDateStr = formatDate(new Date(row[0]));
      if (cellDateStr === yesterdayString) {
        yesterdayPrompt = row[1];
      } else if (cellDateStr === todayString) {
        todayPrompt = row[1];
        todaySkill = row[2] || "";
        todayTwist = row[3] || "";
      }
    }
  }

  return jsonResponse({
    yesterday: { date: yesterdayString, prompt: yesterdayPrompt },
    today: { date: todayString, prompt: todayPrompt, skill: todaySkill, twist: todayTwist },
  });
}

// Column order matches the sheet's real header row exactly:
// Timestamp | Email Address | Upload your sketch | Select Prompt | Caption |
// FileName | UserName | Approve | Reason | Relevance Score | Relevance Reason |
// skillScore | skillReason
// FileName and UserName are set directly below. Approve onward is still
// populated later by the review/AI pipeline, so those stay blank here.
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (!data.file || !data.file.data) {
      return jsonResponse({ success: false, error: "No photo attached." });
    }

    // Safety net - the site's file picker and client-side compression should
    // already prevent this, but reject anything else (e.g. TIFF) that
    // somehow reaches this endpoint directly.
    const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
    if (!ACCEPTED_TYPES.includes(data.file.mimeType)) {
      return jsonResponse({ success: false, error: "Only PNG or JPG photos are accepted." });
    }

    const bytes = Utilities.base64Decode(data.file.data);
    if (bytes.length > MAX_FILE_BYTES) {
      return jsonResponse({ success: false, error: "Photo is too large." });
    }

    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const username = lookupUsername(data.email) || "anonymous";
    const safePrompt = (data.prompt || "untitled").replace(/[^a-zA-Z0-9 _-]/g, "").trim();
    const safeUsername = username.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
    const filename = `${safePrompt}_${safeUsername}`;

    const blob = Utilities.newBlob(bytes, data.file.mimeType || "image/jpeg", filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const sheet = SpreadsheetApp.openById(RESPONSES_SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, error: `Sheet tab "${SHEET_NAME}" not found.` });
    }

    sheet.appendRow([
      new Date(),
      (data.email || "").trim().toLowerCase(),
      file.getUrl(),
      data.prompt || "",
      data.caption || "",
      file.getName(), // FileName - the native form bypasses the real Form's
                       // onFormSubmit trigger, so this is set directly here
      username, // UserName - looked up above by email, same reason as FileName
      "", // Approve - filled in by review pipeline
      "", // Reason
      "", // Relevance Score
      "", // Relevance Reason
      "", // skillScore
      "", // skillReason
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
