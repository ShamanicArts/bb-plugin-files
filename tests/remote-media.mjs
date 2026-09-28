import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const origin = "http://127.0.0.1:38886";
async function api(path, input) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}
async function rpc(method, input) {
  const j = await api(`/api/v1/plugins/files/rpc/${method}`, input);
  if (!j.ok) throw new Error(JSON.stringify(j));
  return j.result;
}
const hostId = "host_wvp6ayipbf";
const path = `/tmp/bb-files-playback-test-${Date.now()}.mp4`;
const source = await readFile(
  "artifacts/fixtures/Studio/Exports/playback-check.mp4",
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  await api("/api/v1/files/write", {
    hostId,
    path,
    content: source.toString("base64"),
    contentEncoding: "base64",
    expectedSha256: null,
  });
  const lease = await rpc("media", { hostId, path });
  const r = await fetch(origin + lease.url, {
    headers: { Range: "bytes=700000-701023" },
  });
  assert.equal(r.status, 206);
  assert.deepEqual(
    Buffer.from(await r.arrayBuffer()),
    source.subarray(700000, 701024),
  );
  const page = await browser.newPage({
    viewport: { width: 1300, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/plugins/files/browse");
  await page
    .getByRole("textbox", { name: "File or folder path", exact: true })
    .waitFor();
  await page.waitForTimeout(800);
  await page.getByLabel("Machine", { exact: true }).selectOption(hostId);
  await page.waitForFunction(
    () => document.querySelector(".ff-address input")?.value === "/home/exedev",
  );
  await page
    .getByRole("textbox", { name: "File or folder path", exact: true })
    .fill(path);
  await page
    .getByRole("textbox", { name: "File or folder path", exact: true })
    .press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".ff-browser video")?.readyState >= 2,
  );
  const v = page.locator(".ff-browser video");
  await v.evaluate((v) => v.play());
  await page.waitForTimeout(600);
  assert(await v.evaluate((v) => v.currentTime > 0));
  await v.evaluate((v) => {
    v.currentTime = 8;
  });
  await page.waitForFunction(() => {
    const v = document.querySelector(".ff-browser video");
    return v.currentTime >= 8 && !v.seeking;
  });
  await v.evaluate((v) => v.pause());
  const result = {
    host: "chatgpt-dev",
    rangeStatus: r.status,
    rangeBytes: 1024,
    player: await v.evaluate((v) => ({
      duration: v.duration,
      time: v.currentTime,
      width: v.videoWidth,
      error: v.error,
    })),
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/remote-media-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(result);
  await page.screenshot({ path: "artifacts/remote-video.png" });
} finally {
  await browser.close();
  await api("/api/v1/files/remove", { hostId, path });
}
