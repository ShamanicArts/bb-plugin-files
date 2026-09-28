import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createVideoDecoder,
  inspectVideo,
  videoPoster,
} from "../software-video";
const exec = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture(fn: (path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "files-software-video-"));
  const path = join(root, "clip with spaces.webm");
  try {
    await exec("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x100:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "2",
      "-c:v",
      "libvpx-vp9",
      "-threads",
      "2",
      "-deadline",
      "realtime",
      "-c:a",
      "libopus",
      path,
    ]);
    await fn(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("software decoding produces JPEG and stereo PCM, seeks and reaches EOF", () =>
  fixture(async (path) => {
    const meta = await inspectVideo(path);
    assert(meta.audio);
    assert(meta.duration >= 2);
    const poster = Buffer.from((await videoPoster(path, 1)).jpeg, "base64");
    assert.deepEqual([...poster.subarray(0, 2)], [255, 216]);
    let released = 0;
    const d = createVideoDecoder();
    try {
      const s = await d.start(path, 1, undefined, () => ({
        async dispose() {
          released++;
        },
      }));
      let hasFrame = false,
        hasSound = false,
        done = false;
      let previousAudioTime = 1;
      for (let i = 0; i < 100 && !done; i++) {
        await sleep(50);
        const p = d.poll(s.id);
        if (p.jpeg) {
          hasFrame = true;
          assert(p.time >= 1 && p.time <= meta.duration);
        }
        assert(p.audioTime >= previousAudioTime);
        previousAudioTime = p.audioTime;
        const pcm = Buffer.from(p.pcm, "base64");
        assert.equal(pcm.length % 8, 0);
        for (let n = 0; n < pcm.length; n += 4) {
          const sample = pcm.readFloatLE(n);
          assert(Number.isFinite(sample));
          if (Math.abs(sample) > 0.001) hasSound = true;
        }
        done = p.done;
      }
      assert(hasFrame);
      assert(hasSound);
      assert(done);
      assert.equal(d.size, 0);
      assert.equal(released, 1);
    } finally {
      d.dispose();
    }
  }));
test("stop, abandonment, capacity and disposal bound decoder lifetime", () =>
  fixture(async (path) => {
    let released = 0;
    const retain = () => ({
      async dispose() {
        released++;
      },
    });
    const d = createVideoDecoder({ idleMs: 300, maxSessions: 1 });
    try {
      const first = await d.start(path, 0, undefined, retain);
      await assert.rejects(d.start(path, 0), /Close another video/);
      d.stop(first.id);
      d.stop(first.id);
      assert.equal(released, 1);
      const second = await d.start(path, 0, undefined, retain);
      await sleep(750);
      assert.equal(d.size, 0);
      assert.equal(released, 2);
      assert.throws(() => d.poll(second.id), /expired/);
      await d.start(path, 0, undefined, retain);
      d.dispose();
      assert.equal(d.size, 0);
      assert.equal(released, 3);
      await assert.rejects(d.start(path, 0), /closed/);
    } finally {
      d.dispose();
    }
  }));
test("invalid positions and cancellation never start a retained decoder", () =>
  fixture(async (path) => {
    const d = createVideoDecoder();
    try {
      await assert.rejects(d.start(path, -1), /position/);
      await assert.rejects(d.start(path, 100), /beyond/);
      const c = new AbortController();
      c.abort();
      await assert.rejects(d.start(path, 0, c.signal), /cancelled/);
      assert.equal(d.size, 0);
    } finally {
      d.dispose();
    }
  }));
