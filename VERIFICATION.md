# Verification: 28 September 2026

Built and installed as `files@0.1.0` against BB Plugin SDK 0.4.101, from `/home/shamanic/dev/bb-plugin-files`. The package has no runtime dependency beyond Zod; React and the source renderer are BB runtime shims.

## Passed

- `npm run typecheck`
- `npm test`: 9 tests covering file and relative-path navigation, percent-encoded file URLs, hidden entries, symlinks, bounded text/binary reads, host schema validation, mutation detection, sparse 2 GiB reads, range parsing, exact response bodies, HEAD, backpressure, abort, cleanup, and If-Range.
- `npm run test:ui`: 4 headless Chromium workflows covering navigation, history, filtering, hidden files, range selection, quick look/Escape, editable paths, error retention, columns, virtualized grids, keyboard navigation, narrow layouts and preserving the folder across BB's responsive remount.
- One browser workflow performs 12 consecutive video play → seek → close cycles and asserts the detached player is paused and its source removed. No page errors.
- Real thread-panel launch starts at that thread's environment directory. Source, column, and image previews checked at 609 px panel width without visible desktop launches.
- Connected-host directory listings checked on wubulon, chatgpt-dev, and warmap.
- MP4 streamed from chatgpt-dev: successful playback and seek to 8 seconds, no media or page errors. Temporary test file removed.
- Live media endpoint: initial, middle and suffix requests return exact 1024-byte slices with HTTP 206; an out-of-range request returns 416; HEAD reports the correct size; complete response matches the original bytes.
- A changed file invalidates its lease with HTTP 409. Unknown leases return 404.
- Plugin build includes server, app and host bundles; permanent path installation reports running.

## Why the media transport is separate

A live `Range: bytes=0-1023` request to BB's built-in `/api/v1/file-previews/.../playback-check.mp4` returned HTTP 200 and all 2,505,981 bytes. The local BB source's `routes/files.ts` and `services/hosts/daemon-file-response.ts` confirm that path obtains and decodes whole file content and does not forward the range. This is evidence against using that endpoint for video, not proof that it causes every reported BB crash.

Files uses a plugin HTTP route and host RPC chunks of at most 256 KiB, with backpressure and cancellation. Active playback extends the lease; file identity is pinned across requests and verified on every chunk. It still uses the browser's native audio/video decoder. No claim is made that every codec, GPU, desktop WebView, or Connect network path has been tested.

## Screenshots and machine results

- [Thread panel: source](artifacts/side-panel-source.png)
- [Thread panel: directory columns](artifacts/side-panel-columns.png)
- [Thread panel: images](artifacts/side-panel-images.png)
- [Dark source view](artifacts/source-wide.png)
- [Dark video view](artifacts/video-final.png)
- [Remote playback](artifacts/remote-video.png)
- [Narrow image view](artifacts/narrow-images.png)
- [Transport results](artifacts/transport-results.json)
- [Remote playback results](artifacts/remote-media-results.json)

Screenshots and generated media fixtures are local artifacts, excluded from version control. `npm run fixtures` prepares the reproducible fixtures used by the browser tests. The read-only media integration scripts live under `tests/`; the remote test temporarily uploads a fixture and removes it in `finally`.
