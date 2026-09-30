import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const origin = process.env.BB_SERVER_URL;
if (!origin) throw new Error("Set BB_SERVER_URL to a running BB server.");
const rpc = async (method, input) => {
  const r = await fetch(`${origin}/api/v1/plugins/files/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(JSON.stringify(j));
  return j.result;
};
const path =
  process.cwd() + "/artifacts/fixtures/Studio/Exports/playback-check.mp4";
const original = await readFile(path);
const context = await rpc("context", {
  threadId: process.env.BB_THREAD_ID || null,
  projectId: null,
});
const lease = await rpc("media", {
  hostId: process.env.FILES_LOCAL_HOST_ID || context.hostId,
  path,
});
const result = [];
for (const [range, expected, start, length] of [
  ["bytes=0-1023", 206, 0, 1024],
  ["bytes=500000-501023", 206, 500000, 1024],
  ["bytes=-1024", 206, original.length - 1024, 1024],
  ["bytes=99999999999-", 416, 0, 0],
]) {
  const res = await fetch(origin + lease.url, { headers: { Range: range } });
  assert.equal(res.status, expected);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (length) assert.deepEqual(bytes, original.subarray(start, start + length));
  result.push({
    range,
    status: res.status,
    bytes: bytes.length,
    contentRange: res.headers.get("content-range"),
  });
}
const head = await fetch(origin + lease.url, { method: "HEAD" });
result.push({
  method: "HEAD",
  status: head.status,
  length: head.headers.get("content-length"),
});
assert.equal(head.status, 200);
assert.equal(Number(head.headers.get("content-length")), original.length);
const all = await fetch(origin + lease.url);
assert.deepEqual(Buffer.from(await all.arrayBuffer()), original);

assert(context.hostId && context.path);
for (const host of context.hosts.filter((h) => h.connected)) {
  const list = await rpc("list", { hostId: host.id, path: "~" });
  result.push({
    host: host.name,
    listing: list.entries.length,
    path: list.path,
  });
}
console.log(result);
await writeFile(
  "artifacts/transport-results.json",
  JSON.stringify(result, null, 2),
);
