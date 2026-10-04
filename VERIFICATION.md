# Release verification

Files 0.3.2 is built against BB 0.44.0 and Plugin SDK 0.5.29. React and BB's source renderer are provided by the SDK runtime. Zod is the only runtime package dependency.

## Automated checks

- TypeScript checks the app, server, host and contract boundaries.
- Backend tests exercise filesystem navigation, hidden files, symlinks, bounded reads, binary detection, source/host/storage targeting, byte ranges, file identity checks, backpressure, cancellation, and decoder lifetime.
- Real FFmpeg tests cover VP9/Opus decoding, seeking, JPEG frames, finite nonzero PCM, EOF, capacity, idle expiry, explicit stop and disposal.
- Headless live BB UI tests cover paths, filters, history, selection, keyboard navigation, list/grid/column virtualization, narrow layouts, and wheel scrolling directories containing 240 folders in all three views.
- Compatibility playback tests check moving canvas pixels, repeated play/seek/pause, stable paused frames, nonzero scheduled audio, closed audio contexts, and the absence of native video elements.
- A 12 MiB HTML regression verifies content and interactive scripts at the end of a document larger than the host RPC message limit, with full-document streaming and no file-size ceiling.
- HTML tests load and interact with relative JavaScript assets, prove that parent DOM access is blocked, check that embedded video makes no request, and exercise the source/render toggle.
- An optional live-thread integration test checks BB's own file-opening route. Set `BB_THREAD_ID` to an existing thread on the fixture machine.
- Local and connected Unix host integration checks verify exact range bytes and playback/seek. The remote fixture is temporary and removed in `finally`.
- The package check requires all three prebuilt entries, matching SDK metadata, styles, manifest, README, license and skill, and excludes local artifacts, dependencies and test output.

Run commands and environment variables are documented in [README](README.md). Public screenshots contain only generated fixtures and the plugin surface.

## Assumptions and limits

The 2026-10-04 audit passed all 17 backend tests, typechecking and the package
check. Headless UI checks passed 12 tests, failed one and skipped the optional
live-thread routing test. The failing regression is `source preview displays
edited Markdown at the same path`: Files rereads the changed text, but BB's
shared source renderer caches highlighted output by path and retains the old
display. Formatted Markdown updates pass. The shared renderer needs a separate
BB change; this plugin release does not fix it. The regression remains enabled.

BB selects the first matching file opener when there is no extension preference; another plugin or an explicit built-in preference can win. Set the extension to Files in BB Settings when a guaranteed default is wanted. Preferences are per client. Unknown and extensionless links retain BB's existing handling.

Workspace and storage paths resolve against their owning root on the actual host. Missing source information fails explicitly. An explicit host path is authoritative even if the thread belongs to another machine. This browser is read-only and does not form a security boundary restricting the user to a project directory.

HTML scripts are enabled in an opaque-origin sandbox. BB itself is isolated, but HTML can contact network services; the preview is not an offline or untrusted-code execution service. Child frames, objects and native media are disabled. Module/fetch requests may encounter CORS, directory preview URLs cannot serve assets outside the granted root, and backend-dependent apps need an ordinary server.

Video uses an independent FFmpeg subprocess and contains no HTML video element by default. This bypasses the native video surface associated with flicker and input freezes on Arch. Hidden Electron and Chromium tests cannot prove that a visible compositor bug is fixed; no BB or graphics-driver fix is claimed. Native playback is opt-in and may still trigger that issue. Compatibility playback trades fidelity and bandwidth for reliability: at most 1280×720, 24 fps, 48 kHz stereo, JPEG transport and frame dropping on slow connections. Each host needs FFmpeg/ffprobe. Network latency can reduce frame rate.

Linux local and remote hosts are tested. macOS and Windows are unverified. The GitHub CI job runs backend tests and type checks on Linux; live installed-BB checks and packaging are release checks performed separately.

## Fixed regressions

The folder-scroll failure was reproduced as `TypeError: Cannot read properties of null (reading 'scrollTop')`, a React UI exception. The handler retained an event inside a deferred updater after React cleared `currentTarget`. Capturing the numeric scroll position synchronously fixes the event lifetime. The regression checks wheel scrolling and opening folders afterward in list, grid and column views.
