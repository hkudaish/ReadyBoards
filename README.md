# ReadyBoards

Arabic launch presentation with editable text, logos, applause, IndexedDB event history, JSON backups, standalone HTML export, and password-protected Netlify cloud backups.

## Project layout

- `src/index.html`: Arabic presentation and editor markup, original logo data.
- `src/styles.css`: presentation and editor styles.
- `src/app.js`: presentation, local persistence, history, imports and exports.
- `src/cloud.js`: explicit cloud save/restore and portable export asset packaging.
- `src/assets/applause.mp3`: original embedded audio extracted into an asset.
- `netlify/functions/boards.mjs`: authenticated and validated Netlify Blobs API.
- `scripts/build.mjs`: static build into `dist`.
- `.github/workflows/ci.yml`: tests and build on pushes and pull requests.
- `ReadBoards.html`: untouched original standalone app for reference and offline use.

## Develop and check

Use Node.js 22 or newer:

```sh
npm ci
npm run check
```

Serve `dist` through a local HTTP server to use the modular app. Open the original `ReadBoards.html` directly for the previous standalone version. For full local Netlify function testing, use Netlify CLI `netlify dev` after linking your site and setting the environment variable below.

## GitHub and Netlify

GitHub repository: [hkudaish/ReadyBoards](https://github.com/hkudaish/ReadyBoards). Netlify deployment still needs to be linked to this repository.

1. Use the GitHub repository above as the source for deployment.
2. In Netlify, import that GitHub repository. `netlify.toml` supplies the build command, publish directory, functions directory and Node version.
3. Set `BOARDS_STORAGE_PASSWORD` to a long random password in Netlify environment variables with **Functions** scope, then redeploy. Keep it out of GitHub and browser source files.
4. In the app's display settings, enter that password and select cloud save or restore.

Netlify handles its Blobs credentials automatically inside the deployed function. No Netlify personal token belongs in browser code. GitHub stores the app source; Netlify Blobs stores the board settings and event history.

## Storage behavior

Edits continue to save locally. Cloud backup is explicit, includes logos and history, and requires the shared storage password for both reads and writes. The password is held only in the input for the current page session and removed from exported HTML.

The first cloud save creates a backup only if none exists. For an existing backup, restore it before saving. Each save uses the version from the previous restore/save; conflicting writes return an error rather than overwrite another client's changes. Export your local JSON before restoring if you want to retain a separate copy of current settings. Restore retains local event history.

Cloud backups are limited to 4 MiB, including history and logo data. Larger histories can still be exported locally. Production, deploy-preview, branch-deploy and local contexts use separate store names; previews share their context's backup but cannot change production data. Backups persist through redeployments of the same site and context. Anyone with the shared password can read or replace that context's backup; per-user access is not implemented.

Reference: [Netlify Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
