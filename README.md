# Files for BB

A compact, path-first file browser and picker. Open **Files** from the sidebar, or open a thread's right panel, choose **New tab → Files**. The thread panel starts in that thread's working directory; the standalone page starts at the project's default source when BB supplies project context, otherwise the server machine's home directory.

- Editable absolute, relative, `~`, and `file://` paths, breadcrumbs, back/forward, and parent navigation.
- List, thumbnail grid, and two-column directory navigation. Large lists render only the visible rows.
- Source preview with BB's syntax highlighting, image fit/actual size, video and audio playback, and next/previous file browsing.
- Folder filtering, hidden files, name/modified/size sorting, persistent bookmarks and view preference.
- Multi-select with Ctrl/Cmd-click, Shift-click, or Ctrl/Cmd-A. Copy paths or **Use in chat** to insert quoted paths into the draft. This does not send a message or upload attachments.
- An explicit machine selector for local and remote BB hosts.

## Keyboard

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd L | Focus and select the path |
| Ctrl/Cmd F | Filter the current folder |
| Alt Left / Right | Back / forward |
| Alt Up or Backspace | Parent folder |
| Arrow keys, Home, End | Select files |
| Enter | Open folder or expand file preview |
| Space | Expand/collapse quick look |
| Escape | Collapse quick look, clear filter, or close preview |
| Ctrl/Cmd Enter | Insert selected paths into chat |
| Ctrl/Cmd C | Copy selected paths |
| Ctrl/Cmd . | Show hidden files |
| Ctrl/Cmd 1 / 2 / 3 | List / grid / columns |
| F5 | Refresh directory |
| ? | Shortcut reference |

Shortcuts apply while focus is inside Files. Text and native media controls retain their own editing/playback keys.

## Media architecture

Video and audio do **not** use BB's built-in preview loader. In the tested BB installation its `/file-previews` route ignored `Range` and buffered the entire file. Files instead issues a temporary media lease via its typed RPC, then serves an authenticated plugin HTTP endpoint with `HEAD`, HTTP 206, open/suffix ranges, 416 for unsatisfiable ranges, and `If-Range` handling.

A host worker reads at most 256 KiB per request. The response pulls one chunk at a time with backpressure, and propagates cancellation to host RPC. File identity is checked for each chunk; a changed file stops playback rather than mixing versions. Worker file handles close after every read. Closing or replacing a player pauses it and clears its source. Plugin reload aborts active streams. At most eight media responses stream concurrently; expired leases are bounded and evicted. No video thumbnails, autoplay, transcoding, or whole-video blobs are used.

This avoids the verified whole-file buffering failure. Playback still depends on the browser's codec and hardware decoder support; unsupported formats show an error and offer download. Chromium playback and seeking were checked locally and from a second connected host. Remote Connect access and every desktop GPU/codec combination have not been exhaustively validated.

Images use BB's confined preview URLs. Grid thumbnails load lazily and skip originals larger than 10 MiB. Text previews are read-only and capped at 512 KiB. Listings cap at 20,000 entries and disclose truncation. No files are edited, renamed, or deleted by the plugin. Column mode shows the parent directory and current directory, with preview beside or below them depending on panel width.

## Development

```sh
npm install
bb plugin types .
npm run typecheck
npm test
npm run build
bb plugin install . --yes
```

The frontend uses React/TypeScript and the installed BB theme and source renderer. The host entry is portable Node, distributed by BB to connected machines. There is no Rust/Wasm dependency: the significant work here is filesystem I/O and streaming, where BB's host boundary and browser codecs already operate.

`npm run test:ui` runs headless Chromium against the running BB server (`BB_SERVER_URL`, with a local fallback). The live UI suite uses the local fixture directory under `artifacts/fixtures/Studio`, prepared by `npm run fixtures`; it requires Files installed and loaded. `CHROMIUM_PATH` overrides `/usr/bin/chromium`. It does not launch visible windows or send chat messages.

## RPC

Inspect contracts with `bb plugin rpc inspect files`. Methods: `context`, `list`, `text`, `preview` (images), and `media` (bounded video/audio stream). For example, save `{"hostId":"<machine-id>","path":"~"}` to an input file and run:

```sh
bb plugin rpc call files list --input-file input.json --json
```

`context` takes `{threadId, projectId}` (both nullable). `list` takes `{hostId,path,base?}`. `text`, `preview` and `media` take `{hostId,path}`. Media URLs are temporary and remain under BB's normal plugin HTTP authentication. The plugin owns no external service, server port, or credentials.
