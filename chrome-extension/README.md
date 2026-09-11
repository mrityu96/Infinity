# CML Tool Chrome Extension

A Manifest V3 Chrome/Edge extension that uses **Salesforce orgs already
open in Chrome**. It does not run Python and does not use the Salesforce CLI.

Pinned extension ID (from the `key` in `manifest.json`):
`kjjnjiakeemdgpenipimehklndhfbmmp`

## What works now (browser session)

- Org list from open Lightning/Classic tabs (`sid` cookie, API host)
- Constraint model version list
- Fetch CML for an exact version

Deploy, rollback, and Constraint Data writes are still the desktop Python
tool. They return a clear "not in this slice yet" message here.

## Requirements

- Chrome or Edge
- You are logged into the org in a normal browser tab, and that tab stays open
- For two-org compare later, both orgs must be logged in

No Python. No `sf` CLI. No server of yours.

## Load unpacked

1. Log into the Salesforce org in Chrome.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this `chrome-extension/` folder.
5. If Chrome asks for new permissions (cookies / Salesforce sites), allow them.
6. Click the toolbar icon. A full-page tab opens.

The badge shows the number of detected orgs, or `!` if none.

## After UI changes

HTML/CSS/JS copied from `main/` are generated. Edit `main/templates/` and
`main/assets/`, then:

```bash
python3 chrome-extension/scripts/sync-assets.py
```

Reload the unpacked extension. Do not forget `lib/` files — those live only
in this folder.

## Permissions

- `cookies` and Salesforce `host_permissions` — read the `sid` of open orgs
  and call Salesforce REST as that user
- `tabs` — find which Salesforce tabs are open
- `storage` / `alarms` — badge refresh

The session stays in the service worker. Org pickers receive alias, username,
and org Id only — not the session token.

## What this extension does not do yet

- Guarded CML deploy / rollback
- Constraint Data compare/deploy
- Native Messaging / auto-start of Python
- Chrome Web Store packaging
