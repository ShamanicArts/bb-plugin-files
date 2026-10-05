import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";

type Session = {
  key: string;
  hostId: string;
  path: string;
  name: string;
  signature: string;
  generation: number;
  anchor: HTMLDivElement | null;
  frame: HTMLIFrameElement | null;
  error: string;
};
const sessions = new Map<string, Session>();
const listeners = new Set<() => void>();
let snapshot: Session[] = [];
function publish() {
  snapshot = [...sessions.values()];
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getSnapshot = () => snapshot;
function trimInactiveSessions() {
  const inactive = [...sessions.values()].filter((session) => !session.anchor);
  for (const session of inactive.slice(0, Math.max(0, inactive.length - 16)))
    sessions.delete(session.key);
}

export function resetHtmlSession(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  session.generation++;
  session.error = "";
  publish();
}

export function HtmlPreview({
  sessionKey,
  hostId,
  path,
  name,
  signature,
  refreshRevision,
}: {
  sessionKey: string;
  hostId: string;
  path: string;
  name: string;
  signature: string;
  refreshRevision: number;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const lastRefresh = useRef(refreshRevision);
  const current = useSyncExternalStore(subscribe, getSnapshot).find(
    (s) => s.key === sessionKey,
  );
  useLayoutEffect(() => {
    let session = sessions.get(sessionKey);
    if (!session) {
      session = {
        key: sessionKey,
        hostId,
        path,
        name,
        signature,
        generation: 0,
        anchor: null,
        frame: null,
        error: "",
      };
      sessions.set(sessionKey, session);
    } else if (session.signature !== signature) {
      session.signature = signature;
      session.generation++;
      session.error = "";
    }
    const element = anchor.current;
    session.anchor = element;
    // Keep only a bounded number of inactive pages, never evict a visible page.
    sessions.delete(sessionKey);
    sessions.set(sessionKey, session);
    trimInactiveSessions();
    publish();
    return () => {
      if (session.anchor === element) {
        session.anchor = null;
        if (session.frame) {
          session.frame.hidden = true;
          session.frame.title = `Inactive HTML preview of ${session.name}`;
        }
        trimInactiveSessions();
        publish();
      }
    };
  }, [sessionKey, hostId, path, name, signature]);
  useEffect(() => {
    if (lastRefresh.current !== refreshRevision) {
      lastRefresh.current = refreshRevision;
      resetHtmlSession(sessionKey);
    }
  }, [refreshRevision, sessionKey]);
  return (
    <div
      ref={anchor}
      className="ff-html-placeholder"
      data-html-session={sessionKey}
    >
      {current?.error ? (
        <div className="ff-empty" role="alert">
          {current.error}
        </div>
      ) : (
        <div className="ff-loading">Loading HTML…</div>
      )}
    </div>
  );
}

function HtmlFrame({ session }: { session: Session }) {
  const rpc = useRpc<typeof rpcContract>();
  const ref = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    rpc.call("html", { hostId: session.hostId, path: session.path }).then(
      (value) => {
        if (alive) setUrl(value.url);
      },
      (error) => {
        if (alive) {
          session.error = String(error.message || error);
          publish();
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [session.hostId, session.path, session.generation, rpc]);
  useLayoutEffect(() => {
    const frame = ref.current;
    const anchor = session.anchor;
    session.frame = frame;
    if (!frame) return;
    const position = () => {
      const rect = anchor?.getBoundingClientRect();
      frame.hidden = true;
      frame.title = `Inactive HTML preview of ${session.name}`;
      if (
        !anchor?.isConnected ||
        !rect ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        anchor.closest('[hidden], [aria-hidden="true"]')
      )
        return;
      let left = Math.max(0, rect.left),
        top = Math.max(0, rect.top);
      let right = Math.min(window.innerWidth, rect.right),
        bottom = Math.min(window.innerHeight, rect.bottom);
      for (
        let element = anchor.parentElement;
        element;
        element = element.parentElement
      ) {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + element.clientLeft);
          right = Math.min(
            right,
            bounds.left + element.clientLeft + element.clientWidth,
          );
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + element.clientTop);
          bottom = Math.min(
            bottom,
            bounds.top + element.clientTop + element.clientHeight,
          );
        }
      }
      if (right <= left || bottom <= top) return;
      frame.hidden = false;
      frame.title = `HTML preview of ${session.name}`;
      Object.assign(frame.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        clipPath: `inset(${top - rect.top}px ${rect.right - right}px ${rect.bottom - bottom}px ${left - rect.left}px)`,
      });
    };
    position();
    if (!anchor) return;
    const resize = new ResizeObserver(position);
    const intersection = new IntersectionObserver(position);
    const mutations = new MutationObserver(position);
    for (
      let element: HTMLElement | null = anchor;
      element;
      element = element.parentElement
    ) {
      resize.observe(element);
      mutations.observe(element, {
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "aria-hidden"],
      });
    }
    intersection.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      resize.disconnect();
      intersection.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  });
  return url ? (
    <iframe
      ref={ref}
      data-html-session={session.key}
      className="ff-html-preview ff-html-session-frame"
      title={`Inactive HTML preview of ${session.name}`}
      hidden
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      src={url}
    />
  ) : null;
}

export function HtmlSessionLayer() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(
    () => () => {
      sessions.clear();
      publish();
    },
    [],
  );
  return (
    <div className="ff-html-sessions">
      {current.map((session) => (
        <HtmlFrame key={session.key} session={session} />
      ))}
    </div>
  );
}
