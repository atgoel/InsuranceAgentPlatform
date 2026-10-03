# Insurance Distribution Platform — clickable prototype (static site)

A self-contained web build of the design prototype: 47 linked screens (agent and customer phone screens, CRM and web console), with the same interactions as the design canvas. No build step, no server code, no sign-in.

## Publish on GitHub Pages
1. Create a **public** repository, for example `insurance-platform-prototype` (keep your design repository private).
2. Upload the contents of this folder to the repository root: `index.html`, `app.js`, `screens.js`, `vendor/`, `.nojekyll`.
3. In the repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
4. After a minute the prototype is live at `https://<your-user>.github.io/<repository>/`.

Share that link with prospects. Deep links work too, e.g. `…/#/ProposalForm` or `…/#/CRMLeads`.

## Try it locally
Run `python3 -m http.server 8000` in this folder and open http://localhost:8000. Opening `index.html` directly also works, but the browser may block the storage that carries language and journey progress between screens.

## How it works
- `screens.js` holds every screen’s template and logic, generated from the design canvas.
- `app.js` renders them with React (bundled in `vendor/`, no CDN needed) and routes with `#/ScreenName`.
- Phone screens appear in a device frame on desktop and full-screen on a phone.
- Language and demo progress are kept in the browser’s local storage; “Reset demo” on the start screen clears them.
- Fonts load from Google Fonts; without them the system font is used.

All names, insurers and amounts are illustrative sample data. Insurer, customer and payment events are simulated with buttons marked “Demo”.
