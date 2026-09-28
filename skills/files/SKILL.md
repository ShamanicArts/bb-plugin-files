---
name: files
description: Inspect the Files BB plugin's file browser, read-only previews, and bounded media transport. Use when asked about the Files plugin or its RPC.
---

# Files plugin

Open Files from the BB sidebar or the thread's New tab → Files action. A thread panel starts at its environment directory. Files supports local and connected remote hosts.

Use `bb plugin rpc inspect files` for the current input/output schemas. `bb plugin rpc call files <method> --input-file <file> --json` invokes a method. Never send or submit a chat merely to insert file paths; the UI's Use in chat action edits the draft only.

Methods:
- `context`: `{threadId: string|null, projectId: string|null}` resolves host, working directory, project shortcut and available machines.
- `list`: `{hostId, path, base?}` lists one directory with metadata; a file path lists its parent and selects that file. Accepts `~`, relative and absolute paths.
- `text`: `{hostId, path}` returns up to 512 KiB and flags binary/truncated data.
- `preview`: `{hostId, path}` creates a confined image preview root; do not use this for video.
- `media`: `{hostId, path}` creates a temporary video/audio URL supporting HTTP ranges. Stream chunks are bounded at 256 KiB, cancellable and checked for file changes.

The browser is read-only. Copy/Use in chat supplies paths, not uploaded attachments. Listings disclose their 20,000-entry ceiling. Video decoding is browser-dependent; do not claim universal codec or GPU reliability.

Build/reload using `bb plugin build <path>` and `bb plugin reload files`. Inspect failures using `bb plugin logs files`.
