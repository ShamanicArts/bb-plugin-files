# Files design

Files sits beside an active BB conversation on Lucas's desktop. It inherits the surrounding BB light/dark theme so changing focus between conversation and files does not change the visual environment.

## Tokens and type

Use BB's background, foreground, muted, muted-foreground, border, primary and destructive tokens. Restrained accent for selection and focus. File-type icons use small semantic hues: warm folders, blue source, green images, mauve video. System sans for controls; monospace for paths and source.

## Layout

An editable path with back/forward/parent controls is always visible. A machine selector and breadcrumbs sit below it. List/grid/columns, folder filter, sort, hidden and preview toggles occupy one compact toolbar. Workspace, project, home and bookmarks form a scrollable shortcut row.

Rows are 36 px; grid cells are 134 px tall. A wide surface places preview beside files. Below a 720 px plugin width the preview moves below the files. Expanded quick look uses the available content region. All scrolling stays within the relevant region.

## Behavior

Single click selects and previews. Double click or Enter opens folders and expands file previews. Space toggles quick look. Preserve selection between view modes. Path errors retain the last good directory. Loading states retain geometry. Native media controls remain familiar, with no autoplay. CSS motion only covers brief loading-opacity feedback and respects reduced motion.
