import type { Entry } from "./contract";
export type FileKind =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "document"
  | "archive"
  | "file";
export function fileKind(entry: Pick<Entry, "kind" | "name">): FileKind {
  if (entry.kind === "directory") return "folder";
  const ext = entry.name.split(".").pop()?.toLowerCase() || "";
  if (
    ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"].includes(
      ext,
    )
  )
    return "image";
  if (["mp4", "webm", "mov", "m4v", "mkv", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus"].includes(ext))
    return "audio";
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "rs",
      "py",
      "go",
      "c",
      "cpp",
      "h",
      "css",
      "scss",
      "json",
      "toml",
      "yaml",
      "yml",
      "sh",
      "bash",
      "sql",
      "html",
      "xml",
      "svelte",
      "vue",
      "swift",
      "kt",
      "java",
      "rb",
      "lua",
    ].includes(ext)
  )
    return "code";
  if (["zip", "gz", "xz", "7z", "rar", "tar", "zst", "bz2"].includes(ext))
    return "archive";
  if (["md", "txt", "pdf", "rst", "csv", "log"].includes(ext))
    return "document";
  return "file";
}
export function sizeLabel(n: number) {
  if (n < 1024) return `${n} B`;
  const unit = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** unit).toFixed(unit === 1 ? 0 : 1)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}
export function filterEntries(
  entries: Entry[],
  query: string,
  hidden: boolean,
  sort: string,
): Entry[] {
  const q = query.toLocaleLowerCase();
  return entries
    .filter(
      (e) =>
        (hidden || !e.name.startsWith(".")) &&
        e.name.toLocaleLowerCase().includes(q),
    )
    .sort((a, b) => {
      const folders =
        Number(b.kind === "directory") - Number(a.kind === "directory");
      if (folders) return folders;
      if (sort === "modified")
        return b.modified - a.modified || a.name.localeCompare(b.name);
      if (sort === "size")
        return b.size - a.size || a.name.localeCompare(b.name);
      return (
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }) * (sort === "descending" ? -1 : 1)
      );
    });
}
export function assetUrl(base: string, name: string, modified: number) {
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(name)}?v=${modified}`;
}
export function pathTail(path: string) {
  return (
    path
      .replace(/[\\/]$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}
export function readPreference<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`bb-files:${key}`) || "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function savePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(`bb-files:${key}`, JSON.stringify(value));
  } catch {
    /* Storage may be unavailable in embedded clients. */
  }
}
