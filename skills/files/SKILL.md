---
name: files
description: Inspect the Files BB plugin's file browser, read-only previews, and bounded media transport. Use when asked about the Files plugin or its RPC.
---

# Files plugin

Open Files from the BB sidebar or the thread's New tab → Files action. A thread panel starts at its environment directory. Files supports local and connected remote hosts.

Use `bb plugin rpc inspect files` for the current input/output schemas. `bb plugin rpc call files <method> --input-file <file> --json` invokes a method. Never send or submit a chat merely to insert file paths; the UI's Use in chat action edits the draft only.

Methods:

- `resolveFile`: `{path, source}` resolves a BB file-opener target from its host, workspace or thread-storage source. Inspect the exact source schema before calling.
- `html`: `{hostId, path}` returns `{url,expiresAtMs}` for a complete streaming HTML document without a file-size cap. Interactive previews use a sandbox; media embeds are disabled.
- `context`: `{threadId: string|null, projectId: string|null}` resolves host, working directory, project shortcut and available machines.
- `list`: `{hostId, path, base?}` lists one directory with metadata; a file path lists its parent and selects that file. Accepts `~`, relative and absolute paths.
- `text`: `{hostId, path}` returns up to 512 KiB and flags binary/truncated data.
- `info`: `{hostId, path}` returns file size, modification time and identity for preview change detection.
- `preview`: `{hostId, path}` creates a confined image preview root; do not use this for video.
- `videoInfo`, `videoPoster`, `videoStart`, `videoPoll`, `videoStop`: software playback via FFmpeg on the file host. Info takes `{hostId,path}`; poster/start add `time` in seconds; poll/stop take `{hostId,id}` from start. Stop sessions when finished.
- `media`: `{hostId, path}` creates a temporary video/audio URL supporting HTTP ranges. Stream chunks are bounded at 256 KiB, cancellable and checked for file changes.

The browser is read-only. Ctrl/Cmd+C copies selected preview text; explicit Copy path and Use in chat actions supply paths, not uploaded attachments. Markdown renders with a source toggle; line-specific links open source. Open text previews check file identity every two seconds while visible and on focus; Refresh forces a reread. Listings disclose their 20,000-entry ceiling. Videos default to FFmpeg software decoding on the host, canvas frames and Web Audio; `ffmpeg` and `ffprobe` must exist on that host. Preview output is capped at 720p/24 fps. Native video is explicit opt-in and can still trigger the Arch desktop flicker. Do not describe the workaround as fixing BB itself or claim universal GPU reliability.

Build/reload using `bb plugin build <path>` and `bb plugin reload files`. Inspect failures using `bb plugin logs files`.

Files registers BB file openers for known HTML, text/source, image and media extensions. BB chooses the first matching opener by default; Settings → File openers controls per-extension choices separately on each client. Respect existing choices and do not claim that registration overwrites them.
