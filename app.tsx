import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useId,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  definePluginApp,
  useRpc,
  useBbContext,
  useBbNavigate,
  useComposer,
  experimental_SourceCode as SourceCode,
  type PluginFileOpenerProps,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract, Entry, Listing } from "./contract";
import {
  fileKind,
  sizeLabel,
  filterEntries,
  assetUrl,
  pathTail,
  readPreference,
  savePreference,
} from "./model";
import { Glyph, FileGlyph } from "./icons";
import { htmlPreviewDocument } from "./html-preview";
import { SUPPORTED_EXTENSIONS } from "./supported-files";
import { SafeVideo } from "./safe-video";
import "./app.css";
type View = "list" | "grid" | "columns";
type Location = { hostId: string; path: string };
function sessionLocation(key: string): Location | null {
  try {
    const item = JSON.parse(sessionStorage.getItem(key) || "null");
    return item &&
      typeof item.hostId === "string" &&
      typeof item.path === "string"
      ? item
      : null;
  } catch {
    return null;
  }
}
type Place = Location & { name: string };
function Tool({
  icon,
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ff-tool ${active ? "is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph name={icon} />
      {children}
    </button>
  );
}
function Thumbnail({ entry, base }: { entry: Entry; base: string | null }) {
  const [failed, setFailed] = useState(false);
  const kind = fileKind(entry);
  return kind === "image" &&
    base &&
    !failed &&
    entry.size <= 10 * 1024 * 1024 ? (
    <img
      className="ff-thumb"
      loading="lazy"
      decoding="async"
      src={assetUrl(base, entry.name, entry.modified)}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <FileGlyph kind={kind} large />
  );
}
function MediaPlayer({
  kind,
  url,
  name,
  onError,
}: {
  kind: "video" | "audio";
  url: string;
  name: string;
  onError: () => void;
}) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  useEffect(() => {
    const media = ref.current;
    return () => {
      if (media) {
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
    };
  }, [url]);
  return kind === "video" ? (
    <video
      ref={(el) => {
        ref.current = el;
      }}
      src={url}
      controls
      playsInline
      preload="metadata"
      aria-label={name}
      onError={onError}
    />
  ) : (
    <div className="ff-audio">
      <FileGlyph kind="audio" large />
      <strong>{name}</strong>
      <audio
        ref={(el) => {
          ref.current = el;
        }}
        src={url}
        controls
        preload="metadata"
        aria-label={name}
        onError={onError}
      />
    </div>
  );
}
function Preview({
  entry,
  hostId,
  base,
  expanded,
  setExpanded,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onCopy,
  onUse,
  lineRange,
}: {
  lineRange?: { startLineNumber: number; endLineNumber: number } | null;
  entry: Entry;
  hostId: string;
  base: string | null;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onCopy: () => void;
  onUse: (paths: string[]) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [text, setText] = useState<{
    content: string;
    binary: boolean;
    truncated: boolean;
    size: number;
  } | null>(null);
  const [error, setError] = useState("");
  const highlightedLines = useMemo(
    () =>
      lineRange
        ? { start: lineRange.startLineNumber, end: lineRange.endLineNumber }
        : null,
    [lineRange],
  );
  const [renderHtml, setRenderHtml] = useState(!lineRange);
  useEffect(() => {
    if (lineRange) setRenderHtml(false);
  }, [lineRange]);
  const [wrap, setWrap] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [nativeVideo, setNativeVideo] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  const kind = fileKind(entry);
  const isMedia = ["image", "video", "audio"].includes(kind);
  useEffect(() => {
    let alive = true;
    setText(null);
    setError("");
    setZoom(false);
    setMediaError(false);
    if (!isMedia && entry.kind === "file")
      rpc
        .call(kind === "html" ? "html" : "text", { hostId, path: entry.path })
        .then(
          (v) => {
            if (alive) setText(v);
          },
          (e) => {
            if (alive) setError(String(e.message || e));
          },
        );
    return () => {
      alive = false;
    };
  }, [entry.path, entry.modified, hostId, isMedia, kind, rpc]);
  useEffect(() => {
    let alive = true;
    setStreamUrl(null);
    if (kind === "video" || kind === "audio")
      rpc.call("media", { hostId, path: entry.path }).then(
        (v) => {
          if (alive) setStreamUrl(v.url);
        },
        (e) => {
          if (alive) setError(String(e.message || e));
        },
      );
    return () => {
      alive = false;
    };
  }, [entry.path, entry.modified, hostId, kind, rpc, retry]);
  const url =
    kind === "video" || kind === "audio"
      ? streamUrl
      : base
        ? assetUrl(base, entry.name, entry.modified)
        : null;
  return (
    <section
      className={`ff-preview ${expanded ? "ff-expanded" : ""}`}
      aria-label={`Preview of ${entry.name}`}
    >
      <header className="ff-preview-header">
        <div className="ff-preview-heading">
          <FileGlyph kind={kind} />
          <strong title={entry.path}>{entry.name}</strong>
        </div>
        <div className="ff-tools">
          <Tool
            icon="back"
            label="Previous file"
            onClick={onPrevious}
            disabled={!hasPrevious}
          />
          <Tool
            icon="forward"
            label="Next file"
            onClick={onNext}
            disabled={!hasNext}
          />
          <Tool
            icon={expanded ? "shrink" : "expand"}
            label={expanded ? "Collapse preview" : "Expand preview (Space)"}
            onClick={() => setExpanded(!expanded)}
          />
          <Tool icon="close" label="Close preview (Escape)" onClick={onClose} />
        </div>
      </header>
      <div
        className={`ff-preview-body ${kind === "image" ? "ff-image-stage" : ""} ${zoom ? "ff-zoomed" : ""}`}
      >
        {entry.kind === "directory" ? (
          <div className="ff-preview-empty">
            <FileGlyph kind="folder" large />
            <strong>{entry.name}</strong>
            <span>Folder</span>
          </div>
        ) : entry.kind === "other" ? (
          <div className="ff-preview-empty">
            <FileGlyph kind="file" large />
            <p>This entry is not a regular file.</p>
          </div>
        ) : isMedia ? (
          kind === "video" && !nativeVideo ? (
            <SafeVideo
              key={`${entry.modified}:${entry.size}`}
              hostId={hostId}
              path={entry.path}
              name={entry.name}
              onNative={() => setNativeVideo(true)}
            />
          ) : url ? (
            <>
              {kind === "image" && (
                <img
                  src={url}
                  alt={entry.name}
                  onError={() => setMediaError(true)}
                  onDoubleClick={() => setZoom(!zoom)}
                />
              )}
              {(kind === "video" || kind === "audio") && (
                <MediaPlayer
                  key={url}
                  kind={kind}
                  url={url}
                  name={entry.name}
                  onError={() => setMediaError(true)}
                />
              )}
              {kind === "video" && nativeVideo && (
                <button
                  className="ff-native-return"
                  onClick={() => setNativeVideo(false)}
                >
                  Use compatibility playback
                </button>
              )}
              {mediaError && (
                <div className="ff-media-error" role="alert">
                  <p>
                    {kind === "image"
                      ? "This image could not be displayed."
                      : "Playback stopped. Retry, or download the file if this browser does not support its format."}
                  </p>
                  {kind !== "image" && (
                    <button
                      onClick={() => {
                        setMediaError(false);
                        setError("");
                        setRetry((r) => r + 1);
                      }}
                    >
                      Retry playback
                    </button>
                  )}
                </div>
              )}
            </>
          ) : error ? (
            <div className="ff-empty" role="alert">
              {error}
            </div>
          ) : (
            <div className="ff-loading">Preparing preview…</div>
          )
        ) : error ? (
          <div className="ff-empty" role="alert">
            {error}
          </div>
        ) : !text ? (
          <div className="ff-loading">Loading preview…</div>
        ) : text.binary ? (
          <div className="ff-preview-empty">
            <FileGlyph kind={kind} large />
            <p>No text preview for this file.</p>
            <span>{sizeLabel(text.size)}</span>
          </div>
        ) : kind === "html" && renderHtml ? (
          text.truncated ? (
            <div className="ff-preview-empty" role="alert">
              <p>
                HTML preview is limited to 2 MB. Switch to source to inspect the
                beginning.
              </p>
            </div>
          ) : base ? (
            <iframe
              className="ff-html-preview"
              title={`HTML preview of ${entry.name}`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={htmlPreviewDocument(
                text.content,
                new URL(`${base.replace(/\/$/, "")}/`, window.location.href)
                  .href,
              )}
            />
          ) : (
            <div className="ff-loading">Preparing HTML assets…</div>
          )
        ) : (
          <div className="ff-source">
            <SourceCode
              content={text.content}
              path={entry.path}
              highlightedLines={highlightedLines}
              overflow={wrap ? "wrap" : "scroll"}
            />
            {text.truncated && (
              <p className="ff-truncated">
                Showing the bounded beginning of this file. Download it to view
                the rest.
              </p>
            )}
          </div>
        )}
      </div>
      <footer className="ff-preview-footer">
        <div className="ff-file-meta">
          <span>
            {entry.kind === "directory" ? "Folder" : sizeLabel(entry.size)}
          </span>
          <span>
            {new Date(entry.modified).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
        <div className="ff-preview-actions">
          <div className="ff-tools">
            {kind === "image" && (
              <Tool
                icon="zoom"
                label={zoom ? "Fit image" : "View image at actual size"}
                onClick={() => setZoom(!zoom)}
                active={zoom}
              />
            )}{" "}
            {kind === "html" && (
              <button
                className="ff-html-toggle"
                onClick={() => setRenderHtml((v) => !v)}
              >
                {renderHtml ? "View source" : "Render HTML"}
              </button>
            )}
            {!isMedia && text && !text.binary && (
              <Tool
                icon="wrap"
                label="Wrap lines"
                active={wrap}
                onClick={() => setWrap(!wrap)}
              />
            )}
            <Tool icon="copy" label="Copy file path" onClick={onCopy} />
            {kind !== "video" && kind !== "audio" && (
              <Tool
                icon="external"
                label="Open in BB"
                onClick={() => {
                  if (
                    !navigate.experimental_openFilePreview({
                      target: { kind: "host", hostId, path: entry.path },
                      location: null,
                    })
                  )
                    setError(
                      "Open this file from a thread to use the BB preview.",
                    );
                }}
              />
            )}
            {url && entry.kind === "file" && (
              <a
                className="ff-tool"
                href={url}
                download={entry.name}
                aria-label="Download file"
                title="Download file"
              >
                <Glyph name="download" />
              </a>
            )}
          </div>
          <button className="ff-use" onClick={() => onUse([entry.path])}>
            <Glyph name="chat" />
            Use in chat
          </button>
        </div>
      </footer>
    </section>
  );
}
function EntryList({
  entries,
  view,
  selected,
  cursor,
  onSelect,
  onOpen,
  base,
  listRef,
}: {
  entries: Entry[];
  view: View;
  selected: Set<string>;
  cursor: string | null;
  onSelect: (e: Entry, event?: MouseEvent) => void;
  onOpen: (e: Entry) => void;
  base: string | null;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const listId = useId();
  const [viewport, setViewport] = useState({ height: 600, width: 500, top: 0 });
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const update = () =>
      setViewport((v) => ({
        ...v,
        height: node.clientHeight,
        width: node.clientWidth,
        top: node.scrollTop,
      }));
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, [listRef, view]);
  const cols =
    view === "grid" ? Math.max(1, Math.floor((viewport.width - 16) / 124)) : 1;
  const rowHeight = view === "grid" ? 134 : 36;
  const start = Math.max(0, Math.floor(viewport.top / rowHeight) - 3) * cols;
  const end = Math.min(
    entries.length,
    (Math.ceil((viewport.top + viewport.height) / rowHeight) + 3) * cols,
  );
  const total = Math.ceil(entries.length / cols) * rowHeight;
  useEffect(() => {
    const node = listRef.current;
    const i = entries.findIndex((e) => e.path === cursor);
    if (!node || i < 0) return;
    const top = Math.floor(i / cols) * rowHeight;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + rowHeight > node.scrollTop + node.clientHeight)
      node.scrollTop = top + rowHeight - node.clientHeight;
  }, [cursor, cols, rowHeight]);
  return (
    <div
      className={`ff-entries ff-${view}`}
      ref={listRef}
      onScroll={(e) => {
        // React clears currentTarget after dispatch; state updaters can run later.
        const top = e.currentTarget.scrollTop;
        setViewport((v) => ({ ...v, top }));
      }}
      role="listbox"
      aria-label="Files and folders"
      aria-multiselectable="true"
      aria-activedescendant={
        cursor
          ? `${listId}-${entries.findIndex((e) => e.path === cursor)}`
          : undefined
      }
      tabIndex={0}
    >
      <div style={{ height: total, position: "relative" }}>
        <div
          className="ff-window"
          style={{
            position: "absolute",
            top: Math.floor(start / cols) * rowHeight,
            left: 0,
            right: 0,
            display: view === "grid" ? "grid" : "block",
            gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
          }}
        >
          {entries.slice(start, end).map((e, index) => (
            <div
              key={e.path}
              id={`${listId}-${start + index}`}
              role="option"
              aria-selected={selected.has(e.path)}
              className={`ff-entry ${selected.has(e.path) ? "is-selected" : ""} ${cursor === e.path ? "is-cursor" : ""}`}
              title={e.path}
              data-path={e.path}
              onClick={(event) => onSelect(e, event)}
              onDoubleClick={() => onOpen(e)}
            >
              {view === "grid" ? (
                <div className="ff-thumbnail">
                  <Thumbnail key={e.path} entry={e} base={base} />
                  {fileKind(e) === "video" && (
                    <span className="ff-video-chip">VIDEO</span>
                  )}
                </div>
              ) : (
                <FileGlyph kind={fileKind(e)} />
              )}
              <span className="ff-entry-name">
                {e.name}
                {e.symlink && (
                  <span className="ff-symlink" title="Symbolic link">
                    ↗
                  </span>
                )}
              </span>
              {view === "list" && (
                <>
                  <span className="ff-entry-size">
                    {e.kind === "directory" ? "—" : sizeLabel(e.size)}
                  </span>
                  <span className="ff-entry-date">
                    {new Date(e.modified).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </>
              )}
              {view === "columns" && e.kind === "directory" && (
                <Glyph name="forward" size={13} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function FilesBrowser({
  threadId = null,
  projectId = null,
  initialTarget,
  lineRange,
  onUse,
}: {
  threadId?: string | null;
  projectId?: string | null;
  initialTarget?: { hostId: string; path: string };
  lineRange?: { startLineNumber: number; endLineNumber: number } | null;
  onUse: (paths: string[]) => void;
}) {
  const scopeKey = `bb-files:location:${threadId || projectId || "standalone"}`;
  const rpc = useRpc<typeof rpcContract>();
  const [context, setContext] = useState<{
    hostId: string;
    path: string;
    projectPath: string | null;
    projectHostId: string | null;
    hosts: { id: string; name: string; connected: boolean }[];
  } | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [parent, setParent] = useState<Listing | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(() => {
    const v = readPreference("view", "list");
    return ["list", "grid", "columns"].includes(v) ? (v as View) : "list";
  });
  const [hidden, setHidden] = useState(
    () => readPreference<boolean>("hidden", false) === true,
  );
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);
  const [base, setBase] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Place[]>(() => {
    const v = readPreference<unknown>("bookmarks", []);
    return Array.isArray(v)
      ? v
          .filter(
            (p) =>
              p &&
              typeof p.hostId === "string" &&
              typeof p.path === "string" &&
              typeof p.name === "string",
          )
          .slice(0, 50)
      : [];
  });
  const [history, setHistory] = useState<{ items: Location[]; index: number }>({
    items: [],
    index: -1,
  });
  const request = useRef(0);
  const pathRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (expanded && previewOpen)
      rootRef.current?.focus({ preventScroll: true });
  }, [expanded, previewOpen]);
  const visible = useMemo(
    () => filterEntries(listing?.entries || [], query, hidden, sort),
    [listing, query, hidden, sort],
  );
  const current = listing?.entries.find((e) => e.path === cursor) || null;
  const files = visible.filter((e) => e.kind === "file");
  const fileIndex = files.findIndex((e) => e.path === cursor);
  const navigate = useCallback(
    async (
      path: string,
      hostId: string,
      mode: "push" | "refresh" | "history" = "push",
      historyIndex?: number,
      basePath?: string,
    ) => {
      const token = ++request.current;
      setBusy(true);
      setError("");
      try {
        const result = await rpc.call("list", {
          path,
          hostId,
          ...(basePath ? { base: basePath } : {}),
        });
        if (token !== request.current) return;
        const loc = { hostId, path: result.path };
        setListing(result);
        setLocation(loc);
        try {
          sessionStorage.setItem(scopeKey, JSON.stringify(loc));
        } catch {}
        setPathInput(result.path);
        setQuery("");
        setBase(null);
        setParent(null);
        if (mode !== "refresh") {
          setSelected(new Set(result.selected ? [result.selected.path] : []));
          setCursor(result.selected?.path || null);
          setExpanded(false);
          anchor.current = null;
        } else {
          setSelected(
            (old) =>
              new Set(
                [...old].filter((p) =>
                  result.entries.some((e) => e.path === p),
                ),
              ),
          );
          setCursor((old) =>
            result.entries.some((e) => e.path === old) ? old : null,
          );
        }
        if (result.selected) {
          setPreviewOpen(true);
          if (result.selected.name.startsWith(".")) setHidden(true);
        }
        if (mode === "push")
          setHistory((h) =>
            h.items[h.index]?.path === loc.path &&
            h.items[h.index]?.hostId === loc.hostId
              ? h
              : {
                  items: [...h.items.slice(0, h.index + 1), loc].slice(-100),
                  index: Math.min(h.index + 1, 99),
                },
          );
        else if (mode === "history" && historyIndex !== undefined)
          setHistory((h) => ({ ...h, index: historyIndex }));
        if (listRef.current && mode !== "refresh")
          listRef.current.scrollTop = 0;
        return true;
      } catch (e) {
        if (token === request.current)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (token === request.current) setBusy(false);
      }
    },
    [rpc, scopeKey],
  );
  useEffect(() => {
    let alive = true;
    const initialRequest = request.current;
    setBusy(true);
    rpc.call("context", { threadId, projectId }).then(
      (c) => {
        if (alive) {
          setContext(c);
          if (request.current === initialRequest) {
            const saved = initialTarget || sessionLocation(scopeKey);
            void navigate(
              saved?.path || c.path,
              saved?.hostId || c.hostId,
            ).then((ok) => {
              if (alive && ok && initialTarget) setExpanded(true);
            });
          }
        }
      },
      (e) => {
        if (alive) {
          setError(String(e.message || e));
          setBusy(false);
        }
      },
    );
    return () => {
      alive = false;
      ++request.current;
    };
  }, [threadId, projectId, rpc, navigate, scopeKey, initialTarget]);
  useEffect(() => {
    if (!location) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      rpc
        .call("preview", { hostId: location.hostId, path: location.path })
        .then(
          (v) => {
            if (alive) {
              setBase(v.baseUrl);
              timer = setTimeout(
                load,
                Math.max(1000, v.expiresAtMs - Date.now() - 60000),
              );
            }
          },
          (e) => {
            if (alive)
              setNotice(`Media preview unavailable: ${e.message || e}`);
          },
        );
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [location, rpc]);
  useEffect(() => {
    if (view !== "columns" || !listing?.parent || !location) {
      setParent(null);
      return;
    }
    let alive = true;
    rpc.call("list", { hostId: location.hostId, path: listing.parent }).then(
      (v) => {
        if (alive) setParent(v);
      },
      () => {
        if (alive) setParent(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [view, listing?.parent, location?.hostId, rpc]);
  useEffect(() => {
    savePreference("view", view);
  }, [view]);
  useEffect(() => {
    savePreference("hidden", hidden);
  }, [hidden]);
  useEffect(() => {
    savePreference("bookmarks", bookmarks);
  }, [bookmarks]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const go = (path: string, host = location?.hostId || context?.hostId) => {
    if (host) void navigate(path, host, "push", undefined, location?.path);
  };
  const select = (entry: Entry, event?: MouseEvent) => {
    setCursor(entry.path);
    setPreviewOpen(true);
    if (event?.shiftKey && anchor.current) {
      const a = visible.findIndex((e) => e.path === anchor.current);
      const b = visible.findIndex((e) => e.path === entry.path);
      setSelected(
        new Set(
          visible
            .slice(Math.max(0, Math.min(a, b)), Math.max(a, b) + 1)
            .map((e) => e.path),
        ),
      );
    } else if (event?.metaKey || event?.ctrlKey) {
      setSelected((old) => {
        const n = new Set(old);
        if (n.has(entry.path)) n.delete(entry.path);
        else n.add(entry.path);
        return n;
      });
      anchor.current = entry.path;
    } else {
      setSelected(new Set([entry.path]));
      anchor.current = entry.path;
    }
    listRef.current?.focus({ preventScroll: true });
  };
  const open = (entry: Entry) => {
    if (entry.kind === "directory") go(entry.path);
    else {
      select(entry);
      setExpanded(true);
    }
  };
  const step = (delta: number) => {
    const e = files[fileIndex + delta];
    if (e) select(e);
  };
  const back = (delta: number) => {
    const i = history.index + delta;
    const loc = history.items[i];
    if (loc) void navigate(loc.path, loc.hostId, "history", i);
  };
  const copy = async (paths: string[]) => {
    try {
      await navigator.clipboard.writeText(paths.join("\n"));
      setNotice(
        paths.length === 1 ? "Path copied" : `${paths.length} paths copied`,
      );
    } catch {
      setError(
        "Clipboard unavailable. Select and copy the path in the address bar.",
      );
    }
  };
  const usePaths = (paths: string[]) => {
    onUse(paths);
    setNotice(
      paths.length === 1
        ? "Path added to draft"
        : `${paths.length} paths added to draft`,
    );
  };
  const changeView = (next: View) => {
    setView(next);
    if (listRef.current) listRef.current.scrollTop = 0;
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const input =
      event.target instanceof HTMLElement &&
      ([
        "INPUT",
        "TEXTAREA",
        "SELECT",
        "VIDEO",
        "AUDIO",
        "BUTTON",
        "A",
      ].includes(event.target.tagName) ||
        event.target.isContentEditable);
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "l") {
      event.preventDefault();
      pathRef.current?.focus();
      pathRef.current?.select();
      return;
    }
    if (mod && event.key.toLowerCase() === "f") {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (mod && event.key === ".") {
      event.preventDefault();
      setHidden(!hidden);
      return;
    }
    if (
      event.altKey &&
      ["ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowUp" && listing?.parent) go(listing.parent);
      else back(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setHelp(false);
      if (expanded) setExpanded(false);
      else if (query) setQuery("");
      else setPreviewOpen(false);
      return;
    }
    if (input) return;
    if (mod && event.key === "a") {
      event.preventDefault();
      setSelected(new Set(visible.map((e) => e.path)));
      return;
    }
    if (mod && event.key === "c") {
      event.preventDefault();
      void copy(
        selected.size ? [...selected] : location ? [location.path] : [],
      );
      return;
    }
    if (mod && ["1", "2", "3"].includes(event.key)) {
      event.preventDefault();
      changeView((["list", "grid", "columns"] as View[])[+event.key - 1]);
      return;
    }
    if (event.key === " " && current) {
      event.preventDefault();
      setExpanded(!expanded);
      setPreviewOpen(true);
      return;
    }
    if (event.key === "Enter" && current) {
      event.preventDefault();
      if (mod) usePaths([...selected]);
      else open(current);
      return;
    }
    if (event.key === "Backspace" && listing?.parent) {
      event.preventDefault();
      go(listing.parent);
      return;
    }
    if (event.key === "?") {
      event.preventDefault();
      setHelp(!help);
      return;
    }
    if (event.key === "F5" && location) {
      event.preventDefault();
      void navigate(location.path, location.hostId, "refresh");
      return;
    }
    if (expanded && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      event.preventDefault();
      const i = visible.findIndex((e) => e.path === cursor);
      const cols =
        view === "grid"
          ? Math.max(
              1,
              Math.floor(((listRef.current?.clientWidth || 500) - 16) / 124),
            )
          : 1;
      const delta =
        event.key === "ArrowUp"
          ? -cols
          : event.key === "ArrowDown"
            ? cols
            : event.key === "ArrowLeft"
              ? -1
              : 1;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? visible.length - 1
            : i < 0
              ? 0
              : Math.min(visible.length - 1, Math.max(0, i + delta));
      const e = visible[next];
      if (e) {
        if (event.shiftKey) {
          const a = visible.findIndex((e) => e.path === anchor.current);
          setSelected(
            new Set(
              visible
                .slice(Math.max(0, Math.min(a, next)), Math.max(a, next) + 1)
                .map((e) => e.path),
            ),
          );
          setCursor(e.path);
        } else select(e);
      }
    }
  };
  const crumbs = (location?.path || "").split(/[\\/]/).filter(Boolean);
  const isBookmarked = bookmarks.some(
    (b) => b.path === location?.path && b.hostId === location?.hostId,
  );
  const bookmark = () => {
    if (!location) return;
    setBookmarks((old) =>
      isBookmarked
        ? old.filter(
            (b) => b.path !== location.path || b.hostId !== location.hostId,
          )
        : [...old, { ...location, name: pathTail(location.path) }].slice(-50),
    );
  };
  return (
    <div
      className={`ff-browser ${expanded && current && previewOpen ? "ff-is-expanded" : ""}`}
      ref={rootRef}
      onKeyDown={keyDown}
      tabIndex={-1}
    >
      <div className="ff-navigation">
        <div className="ff-tools">
          <Tool
            icon="back"
            label="Back (Alt+Left)"
            disabled={history.index <= 0 || busy}
            onClick={() => back(-1)}
          />
          <Tool
            icon="forward"
            label="Forward (Alt+Right)"
            disabled={history.index >= history.items.length - 1 || busy}
            onClick={() => back(1)}
          />
          <Tool
            icon="up"
            label="Parent folder (Alt+Up)"
            disabled={!listing?.parent || busy}
            onClick={() => listing?.parent && go(listing.parent)}
          />
        </div>
        <form
          className="ff-address"
          onSubmit={(e) => {
            e.preventDefault();
            go(pathInput);
          }}
        >
          <Glyph name="folder" />
          <input
            ref={pathRef}
            aria-label="File or folder path"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Paste a file or folder path…"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            title="Go to path"
            aria-label="Go to path"
            disabled={!pathInput || busy}
          >
            <Glyph name="forward" size={14} />
          </button>
        </form>
        <Tool
          icon="refresh"
          label="Refresh folder (F5)"
          disabled={!location || busy}
          onClick={() =>
            location && void navigate(location.path, location.hostId, "refresh")
          }
        />
      </div>
      <div className="ff-context-bar">
        <label className="ff-machine">
          <Glyph name="device" />
          <select
            aria-label="Machine"
            value={location?.hostId || context?.hostId || ""}
            onChange={(e) => go("~", e.target.value)}
          >
            {context?.hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.connected ? "" : " · offline"}
              </option>
            ))}
          </select>
        </label>
        <nav className="ff-breadcrumbs" aria-label="Directory breadcrumbs">
          <button title="Filesystem root" onClick={() => go("/")}>
            /
          </button>
          {crumbs.map((part, i) => (
            <span key={i}>
              <Glyph name="forward" size={10} />
              <button
                title={"/" + crumbs.slice(0, i + 1).join("/")}
                onClick={() => go("/" + crumbs.slice(0, i + 1).join("/"))}
              >
                {part}
              </button>
            </span>
          ))}
        </nav>
        <Tool
          icon="star"
          label={isBookmarked ? "Remove bookmark" : "Bookmark this folder"}
          active={isBookmarked}
          onClick={bookmark}
          disabled={!location}
        />
      </div>
      <div className="ff-toolbar">
        <div className="ff-view-switch" role="group" aria-label="File view">
          <Tool
            icon="list"
            label="List view (Ctrl+1)"
            active={view === "list"}
            onClick={() => changeView("list")}
          />
          <Tool
            icon="grid"
            label="Grid view (Ctrl+2)"
            active={view === "grid"}
            onClick={() => changeView("grid")}
          />
          <Tool
            icon="columns"
            label="Column view (Ctrl+3)"
            active={view === "columns"}
            onClick={() => changeView("columns")}
          />
        </div>
        <div className="ff-filter">
          <Glyph name="search" size={14} />
          <input
            ref={searchRef}
            aria-label="Filter this folder"
            placeholder="Filter this folder"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (listRef.current) listRef.current.scrollTop = 0;
            }}
          />
          {query && (
            <button aria-label="Clear filter" onClick={() => setQuery("")}>
              <Glyph name="close" size={13} />
            </button>
          )}
        </div>
        <select
          className="ff-sort"
          aria-label="Sort files"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Name ↑</option>
          <option value="descending">Name ↓</option>
          <option value="modified">Modified</option>
          <option value="size">Size</option>
        </select>
        <Tool
          icon={hidden ? "eye" : "hidden"}
          label="Show hidden files (Ctrl+.)"
          active={hidden}
          onClick={() => setHidden(!hidden)}
        />
        <Tool
          icon="panel"
          label="Toggle preview"
          active={previewOpen}
          onClick={() => setPreviewOpen(!previewOpen)}
        />
      </div>
      <div className="ff-places">
        <button
          onClick={() => go(context?.path || "~", context?.hostId)}
          title="Thread working directory"
        >
          <Glyph name="folder" size={14} />
          {threadId ? "Workspace" : "Start"}
        </button>
        {context?.projectPath && (
          <button
            onClick={() => go(context.projectPath!, context.projectHostId!)}
          >
            <Glyph name="folder" size={14} />
            Project
          </button>
        )}
        <button onClick={() => go("~")}>
          <Glyph name="home" size={14} />
          Home
        </button>
        {bookmarks
          .filter((b) => b.hostId === location?.hostId)
          .map((b) => (
            <button
              key={b.path}
              title={b.path}
              className={location?.path === b.path ? "is-current" : ""}
              onClick={() => go(b.path, b.hostId)}
            >
              <Glyph name="star" size={12} />
              {b.name}
            </button>
          ))}
      </div>
      {error && (
        <div className="ff-error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <Glyph name="close" />
          </button>
        </div>
      )}
      {help && (
        <div className="ff-shortcuts">
          <strong>Keyboard shortcuts</strong>
          {[
            ["Ctrl / ⌘ L", "Edit path"],
            ["Ctrl / ⌘ F", "Filter folder"],
            ["Alt ← / →", "Back / forward"],
            ["Alt ↑", "Parent folder"],
            ["↑ ↓ ← →", "Select file"],
            ["Enter", "Open"],
            ["Space", "Quick look"],
            ["Ctrl / ⌘ Enter", "Use in chat"],
            ["Ctrl / ⌘ .", "Hidden files"],
            ["Ctrl / ⌘ 1–3", "Change view"],
            ["Shift + click", "Select range"],
            ["Esc", "Close preview"],
          ].map(([key, label]) => (
            <div key={key}>
              <kbd>{key}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ff-content" aria-busy={busy}>
        <div className={`ff-browse-region ${busy ? "ff-pending" : ""}`}>
          {view === "columns" && parent && (
            <aside className="ff-parent-column" aria-label="Parent directory">
              <div className="ff-column-title" title={parent.path}>
                {pathTail(parent.path)}
              </div>
              {filterEntries(parent.entries, "", hidden, "name")
                .filter((e) => e.kind === "directory")
                .map((e) => (
                  <button
                    key={e.path}
                    className={e.path === location?.path ? "is-current" : ""}
                    onClick={() => go(e.path)}
                  >
                    <FileGlyph kind="folder" />
                    <span>{e.name}</span>
                    <Glyph name="forward" size={12} />
                  </button>
                ))}
            </aside>
          )}
          <div className="ff-main-files">
            {view === "list" ? (
              <div className="ff-list-head">
                <span>Name</span>
                <span>Size</span>
                <span>Modified</span>
              </div>
            ) : view === "columns" ? (
              <div className="ff-column-title">
                {pathTail(location?.path || "")}
              </div>
            ) : null}
            {busy && !listing ? (
              <div className="ff-skeleton" aria-label="Loading files">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} />
                ))}
              </div>
            ) : !visible.length ? (
              <div className="ff-empty">
                <Glyph name={query ? "search" : "folder"} size={32} />
                <strong>
                  {query
                    ? "No matching files"
                    : listing
                      ? "This folder is empty"
                      : "Choose a folder"}
                </strong>
                <p>
                  {query
                    ? "Try another name or clear the filter."
                    : listing
                      ? "Paste a path above, or go to the parent folder."
                      : "Paste a file or folder path above."}
                </p>
                {query && (
                  <button onClick={() => setQuery("")}>Clear filter</button>
                )}
              </div>
            ) : (
              <EntryList
                entries={visible}
                view={view}
                selected={selected}
                cursor={cursor}
                onSelect={select}
                onOpen={open}
                base={base}
                listRef={listRef}
              />
            )}
          </div>
        </div>
        {previewOpen && current && location ? (
          <Preview
            key={`${location.hostId}:${current.path}`}
            entry={current}
            lineRange={current.path === initialTarget?.path ? lineRange : null}
            hostId={location.hostId}
            base={base}
            expanded={expanded}
            setExpanded={setExpanded}
            onClose={() => {
              setPreviewOpen(false);
              setExpanded(false);
              listRef.current?.focus();
            }}
            onPrevious={() => step(-1)}
            onNext={() => step(1)}
            hasPrevious={fileIndex > 0}
            hasNext={fileIndex >= 0 && fileIndex < files.length - 1}
            onCopy={() => void copy([current.path])}
            onUse={usePaths}
          />
        ) : (
          previewOpen && (
            <div className="ff-preview ff-preview-placeholder">
              <Glyph name="eye" size={26} />
              <span>Select a file to preview</span>
              <kbd>Space for quick look</kbd>
            </div>
          )
        )}
      </div>
      <footer className="ff-status">
        <span aria-live="polite">
          {notice ||
            (busy
              ? "Loading…"
              : `${visible.length.toLocaleString()} items${selected.size ? ` · ${selected.size} selected` : ""}`)}
        </span>
        {listing?.truncated && (
          <span title="Directory listing is limited to 20,000 entries">
            First 20,000 items
          </span>
        )}
        <div className="ff-tools">
          {selected.size > 0 && (
            <>
              <Tool
                icon="copy"
                label="Copy selected paths"
                onClick={() => void copy([...selected])}
              />
              <button
                className="ff-use"
                onClick={() => usePaths([...selected])}
              >
                <Glyph name="chat" size={14} />
                Use {selected.size > 1 ? selected.size : ""} in chat
              </button>
            </>
          )}
          <Tool
            icon="help"
            label="Keyboard shortcuts (?)"
            active={help}
            onClick={() => setHelp(!help)}
          />
        </div>
      </footer>
    </div>
  );
}
function ThreadFiles({ threadId }: { threadId: string }) {
  const composer = useComposer();
  return (
    <FilesBrowser
      threadId={threadId}
      onUse={(paths) => {
        composer.updateText((t) =>
          [t, ...paths.map((p) => JSON.stringify(p))]
            .filter(Boolean)
            .join("\n"),
        );
        composer.focus();
      }}
    />
  );
}
function PageFiles() {
  const context = useBbContext();
  const navigate = useBbNavigate();
  return (
    <FilesBrowser
      projectId={context.projectId}
      onUse={(paths) =>
        navigate.toCompose({
          initialPrompt: paths.map((p) => JSON.stringify(p)).join("\n"),
          focusPrompt: true,
        })
      }
    />
  );
}
function OpenedFile({
  path,
  source,
  experimental_lineRange,
  Original,
}: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [target, setTarget] = useState<{ hostId: string; path: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [original, setOriginal] = useState(false);
  const sourceKey = JSON.stringify(source);
  useEffect(() => {
    let alive = true;
    setTarget(null);
    setError("");
    setOriginal(false);
    rpc.call("resolveFile", { path, source }).then(
      (value) => {
        if (alive) setTarget(value);
      },
      (e) => {
        if (alive) setError(String(e.message || e));
      },
    );
    return () => {
      alive = false;
    };
  }, [path, sourceKey, rpc]);
  if (original) return <Original />;
  if (error)
    return (
      <div className="ff-opener-status" role="alert">
        <p>{error}</p>
        <button onClick={() => setOriginal(true)}>Open with BB preview</button>
      </div>
    );
  if (!target)
    return (
      <div className="ff-opener-status" role="status">
        Resolving file…
      </div>
    );
  return (
    <FilesBrowser
      key={`${target.hostId}:${target.path}`}
      threadId={source.threadId}
      projectId={source.projectId}
      initialTarget={target}
      lineRange={experimental_lineRange}
      onUse={(paths) =>
        navigate.toCompose({
          initialPrompt: paths.map((p) => JSON.stringify(p)).join("\n"),
          focusPrompt: true,
        })
      }
    />
  );
}
export default definePluginApp((app) => {
  app.slots.fileOpener({
    id: "viewer",
    title: "Files",
    extensions: [...SUPPORTED_EXTENSIONS],
    component: OpenedFile,
  });
  app.slots.navPanel({
    id: "files",
    title: "Files",
    icon: "Folder",
    path: "browse",
    component: PageFiles,
  });
  app.slots.threadPanelAction({
    id: "browse",
    title: "Files",
    icon: "Folder",
    layout: "flush",
    component: ThreadFiles,
  });
});
