# Hobgoblin Android Google Play First Release Design

**Date:** 2026-07-27
**Status:** Approved for inline execution by user delegation
**Release:** `versionCode 1` / `versionName 0.1.0`

## Goal

Prepare a self-contained, auditable Google Play first-release package for Hobgoblin Android without uploading to Play Console, publishing GitHub Pages, accessing production credentials, creating a Git commit, or changing the public rollout state.

## Confirmed Product Decisions

- Developer identity: `MRongM`.
- Privacy contact: `jiangisright@gmail.com`.
- Store locales: English (`en-US`), Simplified Chinese (`zh-CN`), Japanese (`ja-JP`), and Korean (`ko-KR`).
- Screenshot UI locale: English for every device class.
- Target audience: adults aged 18 and over; the app is not designed for children.
- Commercial model: free, no ads, no in-app purchases, and no subscriptions.
- Store category: Productivity.
- Android identity: `com.mrongm.hobgoblin`, version code `1`, version name `0.1.0`, minimum SDK `26`, target SDK `37`.

## Considered Approaches

### 1. Complete release packet with deterministic assets — selected

Create localized listing copy, privacy pages, Play Console declaration guidance, app-review instructions, deterministic brand tooling, real-UI screenshot tooling, a release checklist, and an unsigned AAB verification record. Add an in-app privacy-policy entry so the runtime matches Play policy.

This requires more work than a text-only handoff, but it prevents policy answers, public copy, generated assets, and the shipped app from drifting apart.

### 2. Text-only Play Console checklist

Prepare only listing copy, declaration answers, and a privacy-policy document. This is faster, but it leaves the required in-app privacy link, graphics, screenshots, and artifact validation unresolved.

### 3. Fully automated publishing pipeline

Add signing, Play Developer API upload, track management, and public rollout automation. This is intentionally rejected for the first release because it would handle credentials and irreversible external state before the release packet has been reviewed manually.

## Release Package Layout

The release-specific package lives under `release/google-play/0.1.0/`:

```text
release/google-play/0.1.0/
├── README.md
├── app-content.md
├── data-safety.md
├── foreground-service-declaration.md
├── review-access.md
├── release-notes/
│   ├── en-US.txt
│   ├── zh-CN.txt
│   ├── ja-JP.txt
│   └── ko-KR.txt
├── store-listing/
│   ├── en-US/
│   ├── zh-CN/
│   ├── ja-JP/
│   └── ko-KR/
└── graphics/
    ├── app-icon.png
    ├── feature-graphic.svg
    ├── feature-graphic.png
    ├── asset-manifest.tsv
    ├── phone/
    ├── tablet-7/
    └── tablet-10/
```

Each locale contains `title.txt`, `short-description.txt`, `full-description.txt`, and `screenshot-copy.md`. Text is Android-specific and must not promise desktop-only or server-mode behavior.

## Privacy Contract

The canonical public privacy entry point is:

```text
https://mrongm.github.io/hobgoblin/privacy/
```

The existing Pages workflow publishes `docs/**`, so the policy pages live under `docs/privacy/`. The index links to four static localized HTML pages. Play Console may use the locale-specific page URLs; the Android settings screen uses the stable index URL.

The policy must state the observed application behavior:

- MRongM does not operate an application backend and does not collect analytics, advertising data, crash reports, or account data.
- Host aliases, addresses, usernames, ports, remote paths, trusted host-key fingerprints, forwarding rules, preferences, retained terminal metadata, and bounded terminal-output snapshots are stored locally in private application storage.
- Imported or generated SSH private keys are encrypted with AES-GCM using a key held by Android Keystore.
- A temporary server password is used in memory to install the generated public key and is cleared after the attempt; it is not persisted by the app.
- SSH traffic goes directly from the device to the server selected by the user and is encrypted in transit. MRongM is not an intermediary or recipient.
- When the user explicitly opens a session in Termux, Hobgoblin may send the SSH command and, when direct command access is available, private-key material to the separately installed Termux app for that user-requested action.
- When the user explicitly copies a Termux command, the command is placed on the Android clipboard.
- Foreground-terminal notifications may show a terminal label and session state according to device notification settings.
- Local records can be deleted in the app where controls exist. All remaining local application data can be removed through Android's Clear storage action or by uninstalling the app. MRongM holds no server-side application data to delete.

The policy must not inherit AudioLoop's unverified claims about microphone data, usage analytics, device information, service providers, or server-side deletion requests.

## In-App Privacy Entry

Add a localized `Privacy policy` action to the Android settings screen. It opens the canonical HTTPS URL with Compose's URI handler. Keep URL ownership in a small settings policy object so the UI and contract test consume one value.

The change is limited to Android-owned UI and does not alter shared, server, web, or Electron architecture boundaries.

## Google Play Declarations

The release packet records recommended answers and their code evidence:

- Ads: No.
- App access: Some functionality requires an SSH server. A stable reviewer-only host, key, remote path, and English instructions must be entered directly in Play Console before review.
- Target audience: 18 and over; not designed for children.
- Data safety: MRongM collects no user data and shares no user data. Direct end-to-end SSH transfer to a user-selected destination is not developer collection; local-only processing is outside the collection definition.
- Accounts: The app does not create or manage Hobgoblin accounts, so account-deletion requirements do not apply.
- Content rating: Productivity/utility behavior with no app-supplied violent, sexual, gambling, drug, or other mature content. User-controlled terminal output is not hosted or distributed by MRongM.
- Government, news, health, finance, and dating declarations: No.
- Foreground service: `specialUse` supports user-started, interactive SSH terminal sessions that must remain connected while the user changes screens or briefly backgrounds the app. The ongoing notification makes the work user perceptible. Provide a short unlisted demonstration video to Play Console.

These are implementation-derived recommendations, not legal advice. Final Play Console answers must be checked against the exact uploaded AAB and current behavior.

## Brand Assets

Use `assets/hobgoblin-icon.svg` and `assets/icon.png` as canonical sources. Do not use AI-generated brand variants.

Palette:

- terminal black: `#020617`
- slate surface: `#111827`
- shell white: `#F8FAFC`
- branch cyan: `#38BDF8`
- branch green: `#22C55E`
- secondary slate: `#CBD5E1`

The Play icon is a 512×512 PNG with alpha, derived from `assets/icon.png`. Google Play applies the final icon mask; no new outer mask or badge is added.

The 1024×500 feature graphic is a deterministic SVG/PNG extension of the current icon system. Its signature element is a terminal prompt that becomes a Git branch path. It includes the exact copy `Remote worktrees. Persistent terminals.` and avoids gradients unrelated to the existing icon, device frames, Play badges, awards, pricing, or promotional claims.

## Screenshot Story

Use actual English application UI without device frames or added marketing text. Prepare the same ordered story for phone, 7-inch tablet, and 10-inch tablet where the responsive UI is usable:

1. **Hosts:** a privacy-safe reviewer/demo SSH host.
2. **Projects:** a privacy-safe remote Git project or workspace.
3. **Worktrees:** the project's real remote worktree and branch surface.
4. **Terminal:** an active SSH terminal using non-sensitive demo output.
5. **Terminals:** retained terminal sessions and their lifecycle actions.

The capture workflow may automate a debug APK, emulator display profiles, and a purpose-built local demo SSH server. It must never embed a production credential, private repository, personal path, personal hostname, or long-lived secret. If no safe demo SSH environment is available, the scripts and shot list are delivered, but incomplete screenshots are not represented as upload-ready.

## Validation

Deterministic validators enforce:

- app icon: PNG, 512×512, at most 1 MiB;
- feature graphic: JPEG or 24-bit PNG without alpha, 1024×500;
- screenshots: PNG/JPEG, exact selected dimensions, approved 9:16 portrait ratio, no alpha, at most 8 MiB;
- localized title at most 30 characters;
- localized short description at most 80 characters;
- localized full description at most 4,000 characters;
- privacy pages contain developer identity, contact, effective date, data handling, sharing, security, retention, deletion, children, changes, and Termux disclosure;
- release material contains no placeholder secrets or personal demo data.

## Build and External-Action Boundary

Build and inspect the unsigned release AAB locally. Do not generate or import an upload key, add signing passwords to the repository, upload to Play Console, publish Pages, create a test track, create a Git commit/tag, or push without final explicit authorization.

The final handoff must isolate the remaining human-only items:

- stable Play reviewer SSH access;
- unlisted foreground-service demonstration video URL;
- public privacy-page deployment;
- upload-key selection and signed AAB generation;
- Play Console account/device verification and, if applicable, 12-testers-for-14-days closed testing;
- final Console declarations, country availability, review submission, and production rollout.

## Self-Review

- No `TBD` or `TODO` placeholders are used as if complete.
- Store and privacy scope is Android-only and does not promise desktop capabilities.
- Policy wording matches observed dependencies and storage/network paths.
- Generated graphics extend the existing SVG brand system.
- External credentials and irreversible publication remain outside autonomous execution.
