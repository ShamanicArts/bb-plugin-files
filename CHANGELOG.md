# Changelog

## 0.3.2 — 2026-10-04

- Preserve selected preview text when copying, while folder-list copy still copies file paths.
- Render Markdown and reread changed preview text while visible, including edits that preserve size and modification time.
- Cancel old preview reads on navigation and closure; manual refresh rereads unchanged listing entries.
- Keep the source-refresh regression enabled and document BB’s shared renderer cache issue for a separate fix.

## 0.3.1 — 2026-09-30

- Removed the HTML preview file-size cap. Complete HTML now streams over HTTP from local or connected machines, including documents larger than the host RPC message limit.
- Relative assets, interactive scripts, source toggling, sandbox isolation and blocked native media remain supported.
- Added full-document, tail-content, stream cancellation and large interactive HTML regressions.
- The `html` RPC now returns a temporary streaming URL instead of document text.

## 0.3.0 — 2026-09-30

First public release.

- BB file-opener integration for HTML, source, images, video and audio. Explicit extension preferences remain under BB's Settings → File openers.
- Interactive HTML preview with local assets, sandbox isolation, source toggle, and a bounded 2 MiB read. Embedded native media is blocked.
- File targets resolve on their owning machine, including workspace, host and thread storage; explicit host links may target a machine other than the thread's environment.
- Path navigation, list/grid/directory columns, bookmarks, filtering, selection, syntax highlighting and lazy image thumbnails.
- Default software video playback uses FFmpeg, canvas and Web Audio, avoiding native video surfaces. Play/pause/seek, bounded queues and worker cleanup are covered by regressions.
- Fixed the React event lifetime error that crashed the UI when scrolling folder lists.
- Portable integration-test configuration, Linux CI, clean package checks, screenshots and installation documentation.

Requires BB 0.44.0+ and Plugin SDK 0.5.29+. FFmpeg/ffprobe are required only for compatibility video. Preview video is limited to 720p/24 fps; native playback is an explicit opt-in and remains affected by the reported Arch desktop issue. This release does not fix BB's compositor.
