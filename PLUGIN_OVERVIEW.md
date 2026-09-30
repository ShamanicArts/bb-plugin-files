# Files

Browse your machine without leaving the conversation. Paste a path, switch between list, thumbnail grid, and directory columns, then preview source, interactive HTML, images, video, or audio.

Open **New tab → Files** in a thread's right panel to start at its working directory. Use the sidebar **Files** page for a larger workspace. Switch between connected machines from the toolbar.

Select multiple files, copy paths, or add the selection to your chat draft. Bookmarks, hidden files, sorting, keyboard navigation, and an editable path stay within reach.

Videos default to compatibility playback with host-side software decoding, canvas frames and Web Audio. This avoids the native video surface implicated in BB desktop flicker on Arch. FFmpeg/ffprobe are required on the file host; previews are limited to 720p/24 fps. Native playback remains opt-in. Audio files and downloads use a bounded byte-range stream. Files does not change or delete your files.

Files integrates with BB file links. Choose Files in Settings → File openers to pin it for each extension. HTML has a source toggle, relative assets and sandboxed scripts; embedded media and child frames are disabled. Requires BB 0.44.0+. Linux is tested; macOS and Windows are unverified.
