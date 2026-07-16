# Data contract for Workato

This is the exact file shape the site expects. Workato's job is to keep these
files (and the images they point to) committed to this repo via the GitHub API.
GitHub Pages rebuilds automatically on every commit to `main`.

## Winners: `data/winners.json`

Public, no gate. One flat array, newest first isn't required (the site sorts
it client-side). Each entry:

```json
{
  "date": "2026-07-14",
  "prompt": "Twisted Wooden Chair",
  "winner_name": "Alex",
  "image_url": "Images/submissions/2026-07/2026-07-14-alex.png",
  "caption": "Gave it googly-eye legs.",
  "instagram_url": "https://instagram.com/p/xxxxx"
}
```

Workato appends one entry here whenever a winner is picked.

## Submissions: `data/submissions/YYYY-MM.json`

Gated behind the email check. One file per month, flat array of every
submission that month (not just winners). Each entry:

```json
{
  "date": "2026-07-14",
  "prompt": "Twisted Wooden Chair",
  "submitter_name": "Alex",
  "image_url": "Images/submissions/2026-07/2026-07-14-alex.png",
  "caption": "Gave it googly-eye legs."
}
```

`today.html` reads the current month's file and filters to today's date.
`submissions.html` reads whichever month is selected and groups by `date`,
newest day first.

## Month index: `data/submissions/index.json`

A flat array of month strings, e.g. `["2026-07", "2026-06"]`, in **any order**
(the site re-sorts it newest-first). This is what drives the month dropdown
on `submissions.html`.

**This is the one file Workato must remember to update whenever a new month
starts.** It's how a new month shows up in the dropdown automatically,
without anyone hand-editing `submissions.html`. Recipe logic: on the first
submission of a new `YYYY-MM`, check whether that string is already in
`index.json`. If not, append it and commit.

## Prompts: `data/prompts.json`

Drives the "which prompt is this for?" dropdown on the submit form (so a
subscriber can still pick yesterday's prompt if they're a day late). Newest
first, small rolling list is enough, just a few days back:

```json
[
  { "date": "2026-07-14", "prompt": "Twisted Wooden Chair" },
  { "date": "2026-07-13", "prompt": "Frosty Glass Bottle" }
]
```

Whatever sends the daily prompt text should also be the thing that adds a new
entry here each day (prepend, keep the last ~7 days). Today's entry is
auto-selected in the dropdown.

## Images

Recommendation: have Workato resize submission photos to ~1200px on the long
edge, JPEG ~80% quality, before committing. Keeps the repo small forever even
once months of daily photos pile up. See the PRD for the full trade-off.

## One-time Drive import script

`scripts/import_drive_submissions.py` pulls approved photos out of the Drive
folder and captions/dates out of the "Doodle Dude (Responses)" sheet's "Form
Responses 2" tab, resizes them, and writes them straight into
`Images/submissions/YYYY-MM/` plus the matching `data/submissions/YYYY-MM.json`
and `index.json`. See the docstring at the top of that file for setup (needs
a one-time Google Cloud OAuth client, this can't run without your own Google
login). Re-running it is safe: it skips files it's already imported.

It expects Drive filenames in the form `{Select Prompt}_{UserName}_approved.ext`
and matches them to the sheet by prompt + username, taking whichever row has
`Approve = TRUE`. A couple of things it can't fix on its own: any file whose
name doesn't match that pattern gets skipped and reported at the end, and any
approved photo with no matching sheet row still gets imported (just with a
blank caption) since the filename itself is the "this is approved" signal per
the naming convention.

## Suggested Workato recipe shape

1. Trigger: new file in the Google Drive submissions folder (or new row in
   the `Submissions` sheet from `apps-script/submit-handler.gs`).
2. Resize/compress the image.
3. GitHub API: create/update the image file under `Images/submissions/YYYY-MM/`.
4. GitHub API: fetch `data/submissions/YYYY-MM.json` (create it as `[]` if it
   doesn't exist yet), append the new entry, commit it back.
5. GitHub API: fetch `data/submissions/index.json`, add `YYYY-MM` if missing,
   commit it back.
6. Separately, whenever a winner is picked (manual review step), append to
   `data/winners.json` the same way.
