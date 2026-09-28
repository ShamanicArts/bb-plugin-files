import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract } from "./contract";
export const CHUNK_SIZE = 256 * 1024;
export function parseByteRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return "invalid";
  const a = match[1] ? Number(match[1]) : null,
    b = match[2] ? Number(match[2]) : null;
  if (
    (a !== null && !Number.isSafeInteger(a)) ||
    (b !== null && !Number.isSafeInteger(b))
  )
    return "invalid";
  if (a === null) {
    if (b === null || b <= 0) return "invalid";
    return { start: Math.max(0, size - b), end: size - 1 };
  }
  if (a >= size || (b !== null && b < a)) return "invalid";
  return { start: a, end: Math.min(b ?? size - 1, size - 1) };
}
export const mediaTypes: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
};
export function streamResponse(args: {
  request: Request;
  size: number;
  modified: number;
  identity: string;
  mime: string;
  read: (
    offset: number,
    length: number,
    signal: AbortSignal,
  ) => Promise<Uint8Array>;
  onStart?: (controller: AbortController) => void;
  onEnd?: (controller: AbortController) => void;
}) {
  const { request, size, modified, identity, mime } = args;
  const etag = `"${Buffer.from(identity).toString("base64url")}"`;
  const ifRange = request.headers.get("if-range");
  const range = parseByteRange(
    ifRange && ifRange !== etag ? null : request.headers.get("range"),
    size,
  );
  const headers = new Headers({
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    etag: etag,
    "last-modified": new Date(modified).toUTCString(),
    "content-security-policy": "default-src 'none'; sandbox",
  });
  if (range === "invalid") {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0,
    end = range?.end ?? size - 1;
  headers.set("content-length", String(Math.max(0, end - start + 1)));
  if (range) headers.set("content-range", `bytes ${start}-${end}/${size}`);
  const status = range ? 206 : 200;
  if (request.method === "HEAD" || size === 0)
    return new Response(null, { status, headers });
  const abort = new AbortController();
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    request.signal.removeEventListener("abort", cancel);
    abort.abort();
    args.onEnd?.(abort);
  };
  const cancel = () => finish();
  request.signal.addEventListener("abort", cancel, { once: true });
  args.onStart?.(abort);
  if (request.signal.aborted) finish();
  let offset = start;
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (abort.signal.aborted) {
          controller.error(new Error("Media request cancelled"));
          finish();
          return;
        }
        try {
          const length = Math.min(CHUNK_SIZE, end - offset + 1);
          const bytes = await args.read(offset, length, abort.signal);
          if (bytes.byteLength !== length)
            throw new Error("File ended unexpectedly. Refresh the preview.");
          controller.enqueue(bytes);
          offset += bytes.byteLength;
          if (offset > end) {
            controller.close();
            finish();
          }
        } catch (error) {
          controller.error(error);
          finish();
        }
      },
      cancel: finish,
    },
    { highWaterMark: 0 },
  );
  return new Response(body, { status, headers });
}
export function registerMedia(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const leases = new Map<
    string,
    { hostId: string; path: string; expiresAtMs: number; identity: string }
  >();
  const active = new Set<AbortController>();
  async function lease(hostId: string, path: string) {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (!mediaTypes[ext])
      throw new Error("This file type is not supported by the media player.");
    const info = await host.call("info", { path }, { hostId });
    const now = Date.now();
    for (const [id, item] of leases)
      if (item.expiresAtMs <= now) leases.delete(id);
    if (leases.size >= 256) leases.delete(leases.keys().next().value!);
    const id = randomUUID();
    const expiresAtMs = now + 3600000;
    leases.set(id, { hostId, path, expiresAtMs, identity: info.identity });
    return {
      url: `/api/v1/plugins/${bb.pluginId}/http/media?id=${id}`,
      expiresAtMs,
    };
  }
  for (const method of ["GET", "HEAD"])
    bb.http.route(method, "/media", async (c) => {
      const item = leases.get(c.req.query("id") || "");
      if (!item || item.expiresAtMs <= Date.now())
        return new Response("Preview expired. Select the file again.", {
          status: 404,
        });
      if (active.size >= 8)
        return new Response(
          "Too many media streams. Close a player and retry.",
          { status: 429, headers: { "retry-after": "2" } },
        );
      const controller = new AbortController();
      const abort = () => controller.abort();
      c.req.raw.signal.addEventListener("abort", abort, { once: true });
      try {
        const info = await host.call(
          "info",
          { path: item.path },
          { hostId: item.hostId, signal: controller.signal },
        );
        if (info.identity !== item.identity)
          return new Response(
            "The file changed. Retry playback to reload it.",
            { status: 409 },
          );
        if (active.size >= 8)
          return new Response(
            "Too many media streams. Close a player and retry.",
            { status: 429, headers: { "retry-after": "2" } },
          );
        item.expiresAtMs = Date.now() + 3600000;
        return streamResponse({
          request: c.req.raw,
          ...info,
          mime: mediaTypes[item.path.split(".").pop()!.toLowerCase()],
          read: async (offset, length, signal) => {
            const result = await host.call(
              "chunk",
              { path: item.path, offset, length, identity: info.identity },
              { hostId: item.hostId, signal, timeoutMs: 15000 },
            );
            item.expiresAtMs = Date.now() + 3600000;
            return Buffer.from(result.data, "base64");
          },
          onStart: (c) => active.add(c),
          onEnd: (c) => active.delete(c),
        });
      } catch {
        return new Response(
          "Media is unavailable. Check the machine connection and refresh.",
          { status: 503 },
        );
      } finally {
        c.req.raw.signal.removeEventListener("abort", abort);
      }
    });
  bb.onDispose(() => {
    for (const c of active) c.abort();
    active.clear();
    leases.clear();
  });
  return { lease };
}
