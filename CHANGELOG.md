# Changelog

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
