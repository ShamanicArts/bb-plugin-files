import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const origin = process.env.BB_SERVER_URL;
if (!origin) throw new Error("Set BB_SERVER_URL to a running BB server.");
async function api(path, input) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}
async function rpc(method, input) {
  const j = await api(`/api/v1/plugins/files/rpc/${method}`, input);
  if (!j.ok) throw new Error(JSON.stringify(j));
  return j.result;
}
const hostId = process.env.FILES_REMOTE_HOST_ID;
if (!hostId)
  throw new Error(
    "Set FILES_REMOTE_HOST_ID to a connected Unix host with FFmpeg.",
  );
const path = `/tmp/bb-files-playback-test-${Date.now()}.mp4`;
const source = await readFile(
  "artifacts/fixtures/Studio/Exports/playback-check.mp4",
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
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
  const remoteListing = page.waitForResponse(
    (response) =>
      response.url().endsWith("/rpc/list") &&
      response.request().postDataJSON()?.hostId === hostId,
  );
  await page.getByLabel("Machine", { exact: true }).selectOption(hostId);
  const home = (await (await remoteListing).json()).result.path;
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toHaveValue(home);
  await page.waitForFunction(
    () =>
      document.querySelector(".ff-content")?.getAttribute("aria-busy") ===
      "false",
  );
  await page
    .getByRole("textbox", { name: "File or folder path", exact: true })
    .fill(path);
  await page
    .getByRole("textbox", { name: "File or folder path", exact: true })
    .press("Enter");
  await page.locator(".ff-safe-video canvas").waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".ff-video-progress"),
  );
  await page
    .getByRole("button", { name: "Play video", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(".ff-safe-video")?.getAttribute("data-time"),
      ) > 0.5,
  );
  await page.getByLabel("Video position", { exact: true }).fill("8");
  try {
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".ff-safe-video")?.getAttribute("data-time"),
        ) > 8.5,
    );
  } catch (error) {
    console.error(
      "Remote player state:",
      await page.locator(".ff-safe-video").innerText(),
    );
    throw error;
  }
  await page.getByRole("button", { name: "Pause video", exact: true }).click();
  assert.equal(await page.locator("video").count(), 0);
  const result = {
    host: hostId,
    rangeStatus: r.status,
    rangeBytes: 1024,
    player: {
      mode: "compatibility",
      time: await page.locator(".ff-safe-video").getAttribute("data-time"),
    },
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
