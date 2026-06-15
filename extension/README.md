# Job Hunt Copilot — Chrome autofill extension

A small Manifest V3 extension that fills application forms from the profile you
saved in the app, so you stop re-typing the same dozen answers on every ATS.

## What it does (and what it deliberately doesn't)

- **Does:** reads your resume contact info + application profile from the local
  app (`http://localhost:3000`), maps them to fields on the current page, fills
  what it can, and outlines filled fields **green** and likely-required fields it
  left blank **orange**.
- **Does:** lets you mark a tracked application as "applied" from the popup.
- **Does NOT submit anything.** There is no auto-submit, no auto-advancing
  through multiple postings, and no background scraping. You review every field
  and click submit yourself. This keeps you fast without behaving like a bot.

## Install (developer mode)

1. Make sure the app is running: `npm run dev` (so `http://localhost:3000` is up)
   and you've added your resume + profile in **Setup**.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select this `extension/` folder.
5. Pin the extension and open it on any job application page.

## Usage

1. Navigate to an application form (Greenhouse, Lever, Workday, a company page…).
2. Click the extension → **Autofill this page**.
3. Green-outlined fields were filled from your profile; orange-outlined fields are
   likely required and need your input. Review the whole form.
4. Submit the form yourself.
5. Optionally, use **Mark as applied** in the popup to advance the application's
   Tracker card.

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

## Requirements

- The app must be running locally at `http://localhost:3000` (the extension's
  only host permission). Nothing is sent anywhere else.
