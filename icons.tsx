import type { FileKind } from "./model";
const paths: Record<string, string> = {
  play: "m7 4 14 8-14 8Z",
  pause: "M7 4v16M17 4v16",
  back: "m14 5-7 7 7 7",
  forward: "m10 5 7 7-7 7",
  up: "m5 14 7-7 7 7",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  list: "M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1",
  columns: "M3 4h18v16H3zM9 4v16M15 4v16",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM16 16l5 5",
  close: "m6 6 12 12M6 18 18 6",
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  folder: "M3 7V4h6l3 3h9v13H3z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
  copy: "M9 9h12v12H9zM15 6V3H3v12h3",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
  shrink: "M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3",
  chat: "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 10h8M8 14h5",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  external: "M14 3h7v7m0-7L11 13M10 3H3v18h18v-7",
  device: "M3 3h18v13H3zM8 21h8m-4-5v5",
  help: "M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3M12 18h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  check: "m4 12 5 5L20 6",
  filter: "M4 7h16M7 12h10M10 17h4",
  panel: "M3 4h18v16H3zM14 4v16",
  wrap: "M3 5h18M3 10h14a4 4 0 0 1 0 8h-5m3-3-3 3 3 3M3 15h4",
  zoom: "M10 6v8M6 10h8M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  hidden:
    "M4 4l16 16M3 10l-1 2s4 7 10 7c2 0 4-1 5-2M8 5c1 0 3-1 4-1 6 0 10 8 10 8l-2 3",
};
export function Glyph({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.folder} />
    </svg>
  );
}
export function FileGlyph({
  kind,
  large = false,
}: {
  kind: FileKind;
  large?: boolean;
}) {
  return (
    <svg
      className={`ff-file-glyph ff-kind-${kind} ${large ? "ff-large" : ""}`}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      {kind === "folder" ? (
        <>
          <path
            d="M5 13a4 4 0 0 1 4-4h11l5 5h14a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"
            fill="currentColor"
            opacity=".2"
          />
          <path
            d="M5 19h38v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"
            fill="currentColor"
            opacity=".55"
          />
          <path
            d="M5 19v-6a4 4 0 0 1 4-4h11l5 5h14a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </>
      ) : (
        <>
          <path
            d="M12 5h16l10 10v26a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            fill="currentColor"
            opacity=".12"
          />
          <path
            d="M28 5v10h10M12 5h16l10 10v26a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          {kind === "code" || kind === "html" ? (
            <path
              d="m20 23-5 5 5 5m8-10 5 5-5 5m-3-12-3 14"
              stroke="currentColor"
              strokeWidth="2"
            />
          ) : kind === "video" ? (
            <path d="m20 22 11 7-11 7Z" fill="currentColor" />
          ) : kind === "image" ? (
            <>
              <circle cx="19" cy="23" r="3" fill="currentColor" />
              <path
                d="m14 36 9-8 5 4 5-5v9Z"
                fill="currentColor"
                opacity=".7"
              />
            </>
          ) : kind === "audio" ? (
            <path
              d="M23 33V22l10-2v11m-10-6 10-2m-10 10a3 3 0 1 0 0 .1m10-2a3 3 0 1 0 0 .1"
              stroke="currentColor"
              strokeWidth="2"
            />
          ) : kind === "archive" ? (
            <path
              d="M22 18h5v5h-5v5h5v5h-5v5"
              stroke="currentColor"
              strokeWidth="2"
            />
          ) : (
            <path
              d="M17 23h14M17 29h14M17 35h9"
              stroke="currentColor"
              strokeWidth="2"
            />
          )}
        </>
      )}
    </svg>
  );
}
