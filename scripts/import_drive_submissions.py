#!/usr/bin/env python3
"""
Pull approved doodle submissions out of Google Drive and Sheets and drop them
straight into this repo in the shape the site expects.

WHY THIS EXISTS: the approved photos live in a Drive folder and their prompt/
caption/approval data lives in the "Doodle Dude (Responses)" sheet's "Form
Responses 2" tab. This script downloads each approved file, resizes/converts
it, writes it into Images/submissions/YYYY-MM/, and appends/updates the
matching entry in data/submissions/YYYY-MM.json (plus data/submissions/
index.json). Run it any time new files get approved; it skips ones it's
already imported.

SETUP (one time):
  1. pip install --upgrade google-api-python-client google-auth-oauthlib google-auth-httplib2 pillow
  2. In Google Cloud Console, enable the "Google Drive API" and "Google
     Sheets API" for a project, then create an OAuth client ID of type
     "Desktop app" and download it as credentials.json into this scripts/
     folder. (One-time browser consent screen will pop up the first run;
     after that a token.json is cached here and reused.)
  3. Run: python scripts/import_drive_submissions.py

Naming convention this script expects in the Drive folder:
  "{Select Prompt}_{UserName}_approved.{ext}"
"""

import io
import json
import os
import re
import sys
from datetime import datetime, timezone

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

# ---- fixed IDs for this project (from the Drive links Sarah shared) ----
DRIVE_FOLDER_ID = "1ZWdJ34FdPb5wh9Fft5E8wYUota0A0uaSoKm88OKVp5ToiRTgJFLFKGWhBgigppUyf03RInUg"
RESPONSES_SHEET_ID = "1lzi9OJQXuWO1CEO8rS5zS_P_tKMHH4-XoQM72C5TNzo"
RESPONSES_TAB = "Form Responses 2"

# ---- repo paths (this script lives in <repo>/scripts/, so repo root is one level up) ----
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGES_ROOT = os.path.join(REPO_ROOT, "Images", "submissions")
DATA_ROOT = os.path.join(REPO_ROOT, "data", "submissions")

MAX_LONG_EDGE = 1200  # resize target, matches the recommendation in data/README.md
JPEG_QUALITY = 82

FILENAME_RE = re.compile(r"^(?P<prompt>.+?)_(?P<user>[^_]+)_approved$", re.IGNORECASE)


def get_credentials():
    creds = None
    token_path = os.path.join(SCRIPT_DIR, "token.json")
    creds_path = os.path.join(SCRIPT_DIR, "credentials.json")

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(creds_path):
                sys.exit(
                    f"Missing {creds_path}. Download an OAuth 'Desktop app' "
                    f"client ID from Google Cloud Console and save it there."
                )
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return creds


def load_response_rows(sheets_service):
    """Returns list of dicts keyed by the Form Responses 2 header row."""
    result = sheets_service.spreadsheets().values().get(
        spreadsheetId=RESPONSES_SHEET_ID,
        range=f"'{RESPONSES_TAB}'!A1:M",
    ).execute()
    rows = result.get("values", [])
    if not rows:
        return []
    header = rows[0]
    out = []
    for row in rows[1:]:
        padded = row + [""] * (len(header) - len(row))
        out.append(dict(zip(header, padded)))
    return out


def build_caption_lookup(rows):
    """
    Keyed by (prompt.lower(), username.lower()) -> {date, caption}.
    Later approved rows win (a subscriber can resubmit and get re-approved).
    """
    lookup = {}
    for row in rows:
        prompt = (row.get("Select Prompt") or "").strip()
        username = (row.get("UserName") or "").strip()
        approve = (row.get("Approve") or "").strip().upper()
        caption = (row.get("Caption") or "").strip()
        timestamp = (row.get("Timestamp") or "").strip()
        if not prompt or not username or approve != "TRUE":
            continue
        # Skip rows where the "caption" is actually a leaked error message,
        # not something a person typed.
        if caption.lower().startswith("error"):
            caption = ""
        try:
            dt = datetime.strptime(timestamp, "%m/%d/%Y %H:%M:%S")
            date_str = dt.strftime("%Y-%m-%d")
        except ValueError:
            date_str = None
        key = (prompt.lower(), username.lower())
        lookup[key] = {"date": date_str, "caption": caption}
    return lookup


def parse_filename(title):
    name = os.path.splitext(title)[0]
    m = FILENAME_RE.match(name)
    if not m:
        return None
    return m.group("prompt").strip(), m.group("user").strip()


def convert_and_save(image_bytes, dest_path):
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert("RGB")
    w, h = img.size
    long_edge = max(w, h)
    if long_edge > MAX_LONG_EDGE:
        scale = MAX_LONG_EDGE / long_edge
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    img.save(dest_path, "JPEG", quality=JPEG_QUALITY)


def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def main():
    creds = get_credentials()
    drive = build("drive", "v3", credentials=creds)
    sheets = build("sheets", "v4", credentials=creds)

    print("Reading Form Responses 2 for captions/dates...")
    rows = load_response_rows(sheets)
    caption_lookup = build_caption_lookup(rows)

    print("Listing Drive folder...")
    files = []
    page_token = None
    while True:
        resp = drive.files().list(
            q=f"'{DRIVE_FOLDER_ID}' in parents and trashed = false",
            fields="nextPageToken, files(id, name, createdTime, mimeType)",
            pageToken=page_token,
        ).execute()
        files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    imported = 0
    skipped = []

    for f in files:
        parsed = parse_filename(f["name"])
        if not parsed:
            skipped.append((f["name"], "doesn't match '{Prompt}_{User}_approved' pattern"))
            continue
        prompt, username = parsed

        lookup_hit = caption_lookup.get((prompt.lower(), username.lower()))
        if lookup_hit and lookup_hit["date"]:
            date_str = lookup_hit["date"]
            caption = lookup_hit["caption"]
        else:
            # Fall back to the file's Drive creation date if we can't match
            # a real form response row (still imports the photo, just with
            # no caption).
            created = datetime.fromisoformat(f["createdTime"].replace("Z", "+00:00"))
            date_str = created.astimezone(timezone.utc).strftime("%Y-%m-%d")
            caption = ""

        month = date_str[:7]
        safe_user = re.sub(r"[^a-zA-Z0-9_-]", "_", username)
        image_filename = f"{date_str}-{safe_user}.jpg"
        dest_path = os.path.join(IMAGES_ROOT, month, image_filename)
        rel_image_url = f"Images/submissions/{month}/{image_filename}"

        month_json_path = os.path.join(DATA_ROOT, f"{month}.json")
        entries = load_json(month_json_path, [])

        already_have = any(e.get("image_url") == rel_image_url for e in entries)
        if already_have and os.path.exists(dest_path):
            skipped.append((f["name"], "already imported"))
            continue

        print(f"Downloading {f['name']}...")
        request = drive.files().get_media(fileId=f["id"])
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        convert_and_save(buf.getvalue(), dest_path)

        if not already_have:
            entries.append({
                "date": date_str,
                "prompt": prompt,
                "submitter_name": username,
                "image_url": rel_image_url,
                "caption": caption,
                "submitted_at": f["createdTime"],
            })
            save_json(month_json_path, entries)

        # keep the month index in sync
        index_path = os.path.join(DATA_ROOT, "index.json")
        months = load_json(index_path, [])
        if month not in months:
            months.append(month)
            save_json(index_path, months)

        imported += 1
        print(f"  -> saved {dest_path}")

    print(f"\nDone. Imported {imported} file(s).")
    if skipped:
        print("Skipped:")
        for name, reason in skipped:
            print(f"  - {name}: {reason}")


if __name__ == "__main__":
    main()
