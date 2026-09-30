import { test } from "node:test";
import assert from "node:assert/strict";
import { parseByteRange, streamResponse, CHUNK_SIZE } from "../media";
test("range parsing handles open, suffix, clamped and invalid ranges", () => {
  assert.deepEqual(parseByteRange("bytes=20-", 100), { start: 20, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-20", 100), { start: 80, end: 99 });
  assert.deepEqual(parseByteRange("bytes=0-999", 100), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-999", 100), { start: 0, end: 99 });
  for (const s of [
    "bytes=100-",
    "bytes=4-3",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,3-5",
    "bytes=1.5-2",
    "bytes=999999999999999999-",
  ])
    assert.equal(parseByteRange(s, 100), "invalid");
  assert.equal(parseByteRange("bytes=0-", 0), "invalid");
});
test("partial response has exact bytes and headers; HEAD performs no reads", async () => {
  let reads = 0;
  const read = async (offset: number, length: number) => {
    reads++;
    return new Uint8Array(length).fill(offset);
  };
  const args = {
    size: 1000,
    modified: 0,
    identity: "one",
    mime: "video/mp4",
    read,
  };
  const response = streamResponse({
    ...args,
    request: new Request("http://localhost", {
      headers: { range: "bytes=25-30" },
    }),
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 25-30/1000");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array(6).fill(25),
  );
  assert.equal(reads, 1);
  const head = streamResponse({
    ...args,
    request: new Request("http://localhost", { method: "HEAD" }),
  });
  assert.equal(head.headers.get("content-length"), "1000");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(reads, 1);
});
test("stream is backpressured, bounded and cancels pending host calls", async () => {
  let reads = 0,
    cleaned = 0;
  let signal: AbortSignal | undefined;
  const response = streamResponse({
    request: new Request("http://localhost"),
    size: 2 * 1024 ** 3,
    modified: 0,
    identity: "huge",
    mime: "video/mp4",
    read: async (_offset, length, s) => {
      reads++;
      signal = s;
      assert(length <= CHUNK_SIZE);
      return new Uint8Array(length);
    },
    onEnd: () => cleaned++,
  });
  assert.equal(reads, 0);
  const reader = response.body!.getReader();
  await reader.read();
  assert.equal(reads, 1);
  await reader.cancel();
  assert(signal?.aborted);
  assert.equal(cleaned, 1);
  assert.equal(reads, 1);
});
test("request abort and truncated host data fail promptly and clean up", async () => {
  const ac = new AbortController();
  let cleaned = 0;
  const response = streamResponse({
    request: new Request("http://localhost", { signal: ac.signal }),
    size: 100,
    modified: 0,
    identity: "one",
    mime: "video/mp4",
    read: async () => new Uint8Array(0),
    onEnd: () => cleaned++,
  });
  await assert.rejects(response.arrayBuffer(), /ended unexpectedly/);
  assert.equal(cleaned, 1);
  const aborted = streamResponse({
    request: new Request("http://localhost", { signal: ac.signal }),
    size: 100,
    modified: 0,
    identity: "one",
    mime: "video/mp4",
    read: async () => new Uint8Array(100),
    onEnd: () => cleaned++,
  });
  ac.abort();
  await assert.rejects(aborted.arrayBuffer(), /cancelled/);
  assert.equal(cleaned, 2);
});
test("stale If-Range falls back to complete representation", async () => {
  const response = streamResponse({
    request: new Request("http://localhost", {
      headers: { range: "bytes=5-9", "if-range": '"stale"' },
    }),
    size: 10,
    modified: 0,
    identity: "new",
    mime: "video/mp4",
    read: async (_o, n) => new Uint8Array(n),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 10);
});
