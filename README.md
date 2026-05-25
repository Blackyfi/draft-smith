# DraftSmith

> A lightweight desktop companion for League of Legends that detects the live
> matchup and continuously recommends **what to build next** — for **any
> champion**, against **any enemy**, reacting in real time to what the enemy
> actually buys.

DraftSmith reads only **Riot-sanctioned data** — the local **Live Client Data
API** and the **Data Dragon** CDN — and is strictly **advisory**: it recommends,
the player decides. No memory reading, no injection, no automation.

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the authoritative product spec.

---

## How it works

```
Live Client API (127.0.0.1:2999)  ─┐
                                    ├─►  Rust core  ─► typed Tauri events ─►  React UI
Data Dragon CDN (cached to disk)  ─┘   (poll · resolve · engine)
```

- **`live_client/`** polls `127.0.0.1:2999` every 2–5 s over the scoped
  self-signed-cert client; "connection refused" outside a game is the normal
  *no-game* state, not an error.
- **`ddragon/`** resolves item/champion IDs to names + icons from an on-disk
  cache, refreshing from the CDN only when the patch changes.
- **`engine/`** is the **pure, data-driven brain**: it classifies each enemy
  into a threat profile and ranks an explained build path. No champion, item, or
  patch is hardcoded in control flow — adding one is a **data** change in
  [`src-tauri/src/rules/data/*.json`](./src-tauri/src/rules/data).
- **`poll/`** diffs game state and emits Tauri events; the React UI re-ranks
  reactively (no recomputation in the frontend).

## Tech stack

Tauri v2 (Rust core) · React 19 + TypeScript (strict) · Vite · Tailwind CSS v4 ·
shadcn/ui · TanStack Query + Zustand · Framer Motion. Rust: tokio, reqwest +
serde, insta snapshot tests.

---

## Getting started

**Prerequisites:** [Node 20+](https://nodejs.org), the
[Rust toolchain](https://rustup.rs), and the
[Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for
your OS (on Windows: WebView2, already present on Win 11).

```bash
npm install
npm run tauri dev      # run the app (frontend + Rust core) with hot reload
```

### Develop without launching League

The Live Client API only responds during a real game. To exercise the full
poll → recompute → re-rank loop without League, run the mock server (it serves a
captured `/allgamedata` fixture over TLS on `127.0.0.1:2999` and walks a scripted
enemy-purchase timeline):

```bash
npm run mock           # in one terminal — stop League first; it owns that port
npm run tauri dev      # in another — the build re-ranks as the mock "enemies" buy
```

---

## Commands

| Task | Command |
|---|---|
| Dev app | `npm run tauri dev` |
| Production build / installer | `npm run tauri build` |
| Mock live game | `npm run mock` |
| Frontend tests | `npm run test` (single: `npm run test -- <pattern>`) |
| Rust tests | `cargo test` in `src-tauri/` |
| Review engine snapshots | `cargo insta review` in `src-tauri/` |
| Lint / format | `cargo clippy --all-targets -- -D warnings`, `cargo fmt`, `npm run lint` |

---

## Packaging, signing & auto-update

### Build a local installer

```bash
npm run tauri build
```

The installer lands at:

```
src-tauri/target/release/bundle/nsis/DraftSmith_<version>_x64-setup.exe
```

(alongside `…_x64-setup.exe.sig`, the updater signature). A local build is
**unsigned** (Authenticode), which keeps it independent of the Windows SDK — good
for testing on your own machine. For a build you hand to others, cut a release
(below) so it's signed and auto-updatable.

### Cutting a release (signed, published, auto-updatable)

Releases are produced by GitHub Actions, not by hand. To publish version `x.y.z`:

1. Bump the version in **both** `package.json` and `src-tauri/tauri.conf.json`
   (and `src-tauri/Cargo.toml`), and commit it.
2. Tag and push:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. The **`release.yml`** workflow builds + signs the installer and creates a
   **draft GitHub Release** with the installer, its `.sig`, and `latest.json`
   (the file the auto-updater reads).
4. Go to **https://github.com/Blackyfi/draft-smith/releases**, open the draft,
   and click **Publish release**. The installer is the `…_x64-setup.exe` asset;
   that's the file users download.

> The signing secrets (`TAURI_SIGNING_PRIVATE_KEY`, `WINDOWS_CERTIFICATE`, …) must
> already be set in the repo (see [CI / release secrets](#ci--release-secrets)).

### Code signing (Windows)

Authenticode signing requires `signtool.exe` from the Windows SDK, so it is wired
to run **only in the release pipeline** (GitHub's `windows-latest` runners ship
the SDK). The signing settings live in a release-only overlay,
[`src-tauri/tauri.release.conf.json`](./src-tauri/tauri.release.conf.json), which
`release.yml` applies via `tauri build --config …`. Keeping them out of the base
`tauri.conf.json` means local `npm run tauri build` works without installing the
SDK.

The configured certificate is a **self-signed** dev cert — Windows SmartScreen
will still warn end users because it chains to an untrusted CA. For public
distribution, replace it with an OV/EV code-signing certificate and update the
thumbprint in the overlay. To sign locally too, install the Windows SDK and add
the overlay: `npm run tauri build -- --config src-tauri/tauri.release.conf.json`.

Generate a self-signed dev certificate (PowerShell):

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=DraftSmith Dev" `
  -CertStoreLocation "Cert:\CurrentUser\My" -KeyUsage DigitalSignature `
  -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5)
$cert.Thumbprint   # paste into src-tauri/tauri.release.conf.json
Export-PfxCertificate -Cert $cert -FilePath "$env:USERPROFILE\.tauri\draftsmith_codesign.pfx" `
  -Password (ConvertTo-SecureString "<password>" -Force -AsPlainText)
```

### Auto-updater

**Yes — DraftSmith has built-in auto-update.** It ships `tauri-plugin-updater`.
Right-click the tray icon → **"Check for updates…"**: the app queries the latest
GitHub Release, and if a newer version exists it asks for confirmation, then
downloads, installs, and relaunches itself. It only finds something once you've
**published a newer release** (see above) — an installed `0.1.0` will offer to
update the moment `0.1.1` is published. Update bundles are cryptographically
verified against the **minisign public key** embedded in `tauri.conf.json`
(`plugins.updater.pubkey`), so a tampered update is rejected.

Generate the updater keypair once:

```bash
npm run tauri signer generate -- -w ~/.tauri/draftsmith_updater.key
```

Paste the public key into `plugins.updater.pubkey`. **Keep the private key
secret** (it lives outside the repo and is git-ignored).

### CI / release secrets

CI lives in [`.github/workflows`](./.github/workflows):

- **`ci.yml`** — on every push/PR: frontend lint + Vitest + build, and the Rust
  core (`rustfmt`, `clippy -D warnings`, `cargo test`) on Windows **and** Ubuntu.
- **`release.yml`** — on a `v*` tag: builds, signs, and publishes a draft GitHub
  Release with the installer and `latest.json` (the updater manifest).

Configure these repository **secrets** for releases:

| Secret | Purpose |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the minisign private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for that key |
| `WINDOWS_CERTIFICATE` | Base64 of the code-signing `.pfx` (optional — unsigned build if absent) |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` |

```powershell
# Produce the base64 for the WINDOWS_CERTIFICATE secret:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.tauri\draftsmith_codesign.pfx"))
```

---

## Compliance

DraftSmith is built to Riot's developer policies: **sanctioned data only**
(Live Client + Data Dragon), **advisory only** (never auto-acts), the TLS
exception is scoped to `127.0.0.1:2999` alone, and it shows **no Arena item or
Augment win rates**. The product must be registered with Riot before public
distribution.

## Project layout

```
src/             React + TS frontend (components, hooks, Tauri bridge, types.ts)
src-tauri/src/   Rust core: live_client/ ddragon/ model/ engine/ rules/ poll/
                 commands.rs · tray.rs · updater.rs · lib.rs
src-tauri/src/rules/data/   data-driven champion/item/counter JSON (no code to add a champ)
scripts/         mock-live-server.mjs (the no-League dev loop)
.github/workflows/   CI + release pipelines
```

## License

**All Rights Reserved** — proprietary. Copyright © 2026 Blackyfi. No use, copying,
modification, or distribution is permitted; viewing the source grants no rights.
See [LICENSE.md](./LICENSE.md). Not affiliated with Riot Games.
