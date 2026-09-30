**Files for BB — first public release**

A path-first file browser, picker and viewer for BB, with an editable path bar, list/grid/directory columns, keyboard navigation, bookmarks, source previews and image thumbnails. Open it in the sidebar or a thread's right panel; browse local or connected machines.

Files can also handle BB file links, including interactive HTML reports with a source toggle. Choose Files for your extensions in **Settings → File openers**.

Video defaults to host-side FFmpeg decoding into canvas + Web Audio. This avoids the native video surface behind the Arch desktop flicker/freezes. Preview limit: 720p/24 fps; FFmpeg/ffprobe required on the file host. This is a plugin workaround, not a BB compositor fix.

Repository: https://github.com/ShamanicArts/bb-plugin-files
Release: https://github.com/ShamanicArts/bb-plugin-files/releases/tag/v0.3.1

Install on BB 0.44.0+:
```sh
bb plugin install 'git:https://github.com/ShamanicArts/bb-plugin-files.git@^0.3.1' --yes
```

MIT licensed. Linux local/remote tests, software-media and folder-scroll regressions, HTML sandbox tests, and package checks are documented in the repo. macOS and Windows testing welcome.
