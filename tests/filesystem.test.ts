import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  listDirectory,
  readText,
  resolvePath,
  mediaInfo,
  readChunk,
  MAX_TEXT_BYTES,
} from "../filesystem";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "../host";
async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "bb-files-test-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("paths, file targeting, hidden files and symlink navigation", () =>
  fixture(async (root) => {
    await mkdir(join(root, "folder"));
    await writeFile(join(root, "a # ü.ts"), "hello");
    await writeFile(join(root, ".hidden"), "secret");
    await symlink(join(root, "folder"), join(root, "link"));
    await symlink(join(root, "missing"), join(root, "broken"));
    const listing = await listDirectory({ path: "a # ü.ts", base: root });
    assert.equal(listing.path, root);
    assert.equal(listing.selected?.name, "a # ü.ts");
    assert(listing.entries.some((e) => e.name === ".hidden"));
    assert.equal(
      listing.entries.find((e) => e.name === "link")?.kind,
      "directory",
    );
    assert.equal(
      listing.entries.find((e) => e.name === "broken")?.kind,
      "other",
    );
    assert.equal(
      resolvePath(pathToFileURL(join(root, "a # ü.ts")).href),
      join(root, "a # ü.ts"),
    );
    assert.equal(
      (await listDirectory({ path: join(root, "link") })).entries.length,
      0,
    );
    await assert.rejects(listDirectory({ path: join(root, "missing") }));
  }));
test("text reads are bounded and binary content is not rendered", () =>
  fixture(async (root) => {
    await writeFile(join(root, "large.txt"), "a".repeat(MAX_TEXT_BYTES + 100));
    const text = await readText(join(root, "large.txt"));
    assert.equal(text.content.length, MAX_TEXT_BYTES);
    assert(text.truncated);
    await writeFile(join(root, "binary"), Buffer.from([1, 0, 3]));
    assert.equal((await readText(join(root, "binary"))).binary, true);
    await assert.rejects(readText(root));
  }));
test("host boundary validates chunk size and rejects a changing file", () =>
  fixture(async (root) => {
    const path = join(root, "clip.mp4");
    await writeFile(path, "abcde");
    const info = await mediaInfo(path);
    assert.equal(
      Buffer.from(
        (
          await readChunk({
            path,
            offset: 1,
            length: 3,
            identity: info.identity,
          })
        ).data,
        "base64",
      ).toString(),
      "bcd",
    );
    await writeFile(path, "modified content");
    await assert.rejects(
      readChunk({ path, offset: 0, length: 3, identity: info.identity }),
      /changed/,
    );
    const h = experimental_createHostEntryHarness(hostEntry);
    try {
      await assert.rejects(
        h.experimental_call("chunk", {
          path,
          offset: 0,
          length: 262145,
          identity: info.identity,
        }),
      );
    } finally {
      await h.experimental_dispose();
    }
  }));
test("large sparse files only read the requested chunk", () =>
  fixture(async (root) => {
    const path = join(root, "large.mp4");
    const file = await open(path, "w");
    await file.truncate(2 * 1024 ** 3);
    await file.write(Buffer.from("tail"), 0, 4, 2 * 1024 ** 3 - 4);
    await file.close();
    const info = await mediaInfo(path);
    const r = await readChunk({
      path,
      offset: info.size - 4,
      length: 4,
      identity: info.identity,
    });
    assert.equal(Buffer.from(r.data, "base64").toString(), "tail");
  }));
