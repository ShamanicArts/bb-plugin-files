import { opendir, stat, lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  resolve,
  dirname,
  basename,
  isAbsolute,
  join,
  relative,
  sep,
} from "node:path";
import type { Entry, Listing } from "./contract";
export const MAX_ENTRIES = 20000;
export const MAX_TEXT_BYTES = 512 * 1024;
export function resolvePath(input: string, base?: string): string {
  if (!input || input.includes("\0"))
    throw new Error("Enter a valid file or folder path.");
  if (input.startsWith("file://")) input = fileURLToPath(input);
  if (input === "~") return homedir();
  if (input.startsWith("~/") || input.startsWith("~\\"))
    input = join(homedir(), input.slice(2));
  return isAbsolute(input) ? resolve(input) : resolve(base || homedir(), input);
}
async function entry(path: string): Promise<Entry> {
  const link = await lstat(path);
  const info = link.isSymbolicLink()
    ? await stat(path).catch(() => link)
    : link;
  return {
    path,
    name: basename(path),
    kind: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other",
    size: info.size,
    modified: info.mtimeMs,
    symlink: link.isSymbolicLink(),
  };
}
export async function listDirectory(
  input: { path: string; base?: string },
  signal?: AbortSignal,
): Promise<Listing> {
  let path = resolvePath(input.path, input.base);
  const target = await entry(path);
  const selected = target.kind === "directory" ? null : target;
  if (selected) path = dirname(path);
  const paths: string[] = [];
  let truncated = false;
  const dir = await opendir(path);
  for await (const item of dir) {
    signal?.throwIfAborted();
    if (paths.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    paths.push(join(path, item.name));
  }
  const entries: Entry[] = [];
  // Bound filesystem pressure on local disks and network mounts.
  let next = 0;
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (next < paths.length) {
        signal?.throwIfAborted();
        const p = paths[next++];
        try {
          entries.push(await entry(p));
        } catch {
          /* A disappearing or unreadable entry does not hide its siblings. */
        }
      }
    }),
  );
  entries.sort(
    (a, b) =>
      Number(b.kind === "directory") - Number(a.kind === "directory") ||
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
  );
  return {
    path,
    parent: dirname(path) === path ? null : dirname(path),
    home: homedir(),
    entries,
    truncated,
    selected,
  };
}
export function resolveFilePath(input: { path: string; root?: string }) {
  if (!input.root) return { path: resolvePath(input.path) };
  const root = resolvePath(input.root);
  if (
    isAbsolute(input.path) ||
    input.path.startsWith("file://") ||
    input.path.startsWith("~")
  )
    throw new Error("Source-relative files must use a relative path.");
  const path = resolvePath(input.path, root);
  const suffix = relative(root, path);
  if (suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix))
    throw new Error("File path escapes its source directory.");
  return { path };
}
export async function readText(path: string, limit = MAX_TEXT_BYTES) {
  const file = await open(
    resolvePath(path),
    constants.O_RDONLY | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Only regular files can be previewed.");
    const buffer = Buffer.alloc(Math.min(info.size, limit));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const binary = bytes.includes(0);
    return {
      content: binary ? "" : new TextDecoder().decode(bytes),
      binary,
      truncated: info.size > bytesRead,
      size: info.size,
    };
  } finally {
    await file.close();
  }
}

function fileIdentity(info: Awaited<ReturnType<typeof stat>>) {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
}
export async function mediaInfo(path: string) {
  const info = await stat(resolvePath(path));
  if (!info.isFile()) throw new Error("Only regular files can be streamed.");
  return {
    size: info.size,
    modified: info.mtimeMs,
    identity: fileIdentity(info),
  };
}
export async function readChunk(
  input: { path: string; offset: number; length: number; identity: string },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const file = await open(
    resolvePath(input.path),
    constants.O_RDONLY | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || fileIdentity(info) !== input.identity)
      throw new Error("The file changed. Refresh the preview.");
    const data = Buffer.alloc(Math.min(input.length, 262144));
    const { bytesRead } = await file.read(data, 0, data.length, input.offset);
    signal?.throwIfAborted();
    return { data: data.subarray(0, bytesRead).toString("base64") };
  } finally {
    await file.close();
  }
}
