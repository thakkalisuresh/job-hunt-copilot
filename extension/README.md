# Job Hunt Copilot — Chrome autofill extension

A small Manifest V3 extension that fills application forms from the profile you
saved in the app, triages the Gmail message you're looking at, and pre-fills
outreach drafts into Gmail/LinkedIn compose boxes — so you stop re-typing the
same dozen answers and re-copying outreach text.

## What it does (and what it deliberately doesn't)

- **Does:** reads your resume contact info + application profile from the local
  app (`http://localhost:3000`), maps them to fields on the current page, fills
  what it can, and outlines filled fields **green** and likely-required fields it
  left blank **orange**.
- **Does:** lets you mark a tracked application as "applied" from the popup.
- **Does:** on an open Gmail message, **"Triage this email"** reads the
  sender/subject/body and runs it through the same classifier as the Gmail
  poller — auto-updates the matching application's status when confident, or
  surfaces a suggestion (shown in the dashboard's "Needs review" panel) when not.
- **Does:** **"Fill compose / DM here"** picks an application with a saved
  outreach draft and writes its subject/body into an open Gmail compose window,
  or its body into an open LinkedIn message box.
- **Does NOT submit, send, or message anything itself.** There is no auto-submit,
  no auto-send, no auto-advancing through multiple postings, and no background
  scraping. You review every field/draft and click submit/send yourself. This
  keeps you fast without behaving like a bot.

## Install (developer mode)

1. Make sure the app is running: `npm run dev` (so `http://localhost:3000` is up)
   and you've added your resume + profile in **Setup**.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select this `extension/` folder.
5. Pin the extension and open it on any job application page.

## Usage

### Autofill a form
1. Navigate to an application form (Greenhouse, Lever, Workday, a company page…).
2. Click the extension → **Autofill this page**.
3. Green-outlined fields were filled from your profile; orange-outlined fields are
   likely required and need your input. Review the whole form.
4. Submit the form yourself.
5. Optionally, use **Mark as applied** in the popup to advance the application's
   Tracker card.

### Triage a Gmail message
1. Open a message in Gmail (thread view, not the inbox list).
2. Click the extension → **Triage this email** (only shown on `mail.google.com`).
3. The popup shows the classification, the matched application (if any), and
   either the status it just applied (confident match) or a note that it was
   sent to the dashboard's "Needs review" panel.

### Pre-fill an outreach draft
1. Generate an outreach draft for an application in the Lab first.
2. Open a Gmail compose/reply window (subject + body empty), or open a LinkedIn
   conversation with an empty message box.
3. Click the extension, pick the application from **Pre-fill outreach**, then
   **Fill compose / DM here**.
4. Review the filled subject/body (Gmail) or message (LinkedIn) and click
   Send yourself.

## How mapping works

The injected script builds a label string for each field from its `<label>`,
`aria-label`, `placeholder`, `name`, `id`, and `autocomplete`, then matches it
against a list of patterns (name, email, phone, LinkedIn/GitHub/portfolio,
location, work authorization, years of experience, salary, notice period, start
date, references, role). React-controlled inputs are handled via the native value
setter plus `input`/`change` events, and `<select>` menus are matched by option
text/value.

Radios and checkboxes (e.g. yes/no authorization questions) are intentionally
**not** auto-answered — those are too easy to get wrong, so they're left for you.

## Tweaking

- Field patterns live in `popup.js` inside `autofillPage` (the `PATTERNS` array).
  Add a pattern + dictionary key to cover a field a given ATS phrases unusually.
- The dictionary itself is built in `buildFields()` from `/api/resume` and
  `/api/profile`.
- Gmail/LinkedIn DOM selectors (`extractGmailEmail`, `fillGmailCompose`,
  `fillLinkedInMessage`) are based on current Gmail/LinkedIn markup and may need
  updating if Google/LinkedIn change their UI. They fail closed (return `null`,
  shown as an error in the popup) rather than filling the wrong field.

## Requirements

- The app must be running locally at `http://localhost:3000` (the extension's
  only host permission). Nothing is sent anywhere else.
- Gmail triage and outreach pre-fill use `activeTab` + `scripting` to read/write
  the page you're currently looking at — no broad host permissions, no background
  access to your inbox or LinkedIn beyond the tab you have open when you click
  the button.
