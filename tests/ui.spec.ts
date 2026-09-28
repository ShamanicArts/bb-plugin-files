import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const fixture = join(process.cwd(), "artifacts", "fixtures", "Studio");
test.beforeAll(async () => {
  await mkdir(join(fixture, "Many"), { recursive: true });
  await Promise.all(
    Array.from({ length: 400 }, (_, i) =>
      writeFile(
        join(fixture, "Many", `file-${String(i).padStart(3, "0")}.txt`),
        `File ${i}`,
      ),
    ),
  );
});
test.beforeEach(async ({ page }) => {
  await page.goto("/plugins/files/browse");
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).not.toHaveValue("");
});
async function go(page: import("@playwright/test").Page, path: string) {
  await page.getByLabel("File or folder path", { exact: true }).fill(path);
  await page.getByLabel("File or folder path", { exact: true }).press("Enter");
  await expect(page.locator(".ff-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
test("path navigation, filters, history, hidden files and selection", async ({
  page,
}) => {
  await go(page, fixture);
  await page
    .getByRole("button", { name: "List view (Ctrl+1)", exact: true })
    .click();
  await expect(page.getByRole("option", { name: /README.md/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /.hidden-test/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Show hidden files (Ctrl+.)", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: /.hidden-test/ }),
  ).toBeVisible();
  await page.getByLabel("Filter this folder", { exact: true }).fill("readme");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await page.getByRole("option", { name: /Sources/ }).dblclick();
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toHaveValue(join(fixture, "Sources"));
  await page
    .getByRole("button", { name: "Back (Alt+Left)", exact: true })
    .click();
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toHaveValue(fixture);
  await page
    .getByRole("button", { name: "Forward (Alt+Right)", exact: true })
    .click();
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toHaveValue(join(fixture, "Sources"));
  await page.getByRole("option", { name: /browser.tsx/ }).click();
  await page
    .getByRole("option", { name: /icons.tsx/ })
    .click({ modifiers: ["Shift"] });
  await expect(page.locator(".ff-status")).toContainText("3 selected");
  await go(page, "../README.md");
  await expect(
    page.getByRole("region", { name: "Preview of README.md", exact: true }),
  ).toBeVisible();
  await page.getByRole("listbox").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".ff-preview")).toHaveClass(/ff-expanded/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ff-preview")).not.toHaveClass(/ff-expanded/);
  await page.getByRole("listbox").focus();
  await page.keyboard.press("Control+l");
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toBeFocused();
  await go(page, "/this-folder-does-not-exist-bb-files");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("option", { name: /README.md/ })).toBeVisible();
});
test("column navigation and grid virtualization stay keyboard accessible", async ({
  page,
}) => {
  await go(page, join(fixture, "Sources"));
  await page
    .getByRole("button", { name: "Column view (Ctrl+3)", exact: true })
    .click();
  await expect(
    page.getByLabel("Parent directory", { exact: true }),
  ).toContainText("References");
  await page
    .getByLabel("Parent directory", { exact: true })
    .getByRole("button", { name: "References", exact: true })
    .click();
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toHaveValue(join(fixture, "References"));
  await go(page, join(fixture, "Many"));
  await page
    .getByRole("button", { name: "Grid view (Ctrl+2)", exact: true })
    .click();
  await expect(page.locator(".ff-status")).toContainText("400 items");
  expect(await page.getByRole("option").count()).toBeLessThan(100);
  await page.getByRole("listbox").focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "file-399.txt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "file-399.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+a");
  await expect(page.locator(".ff-status")).toContainText("400 selected");
});
test("opt-in native player releases the old element on repeated close", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page, join(fixture, "Exports"));
  await page
    .getByRole("button", { name: "List view (Ctrl+1)", exact: true })
    .click();
  for (let i = 0; i < 12; i++) {
    await page.getByRole("option", { name: /playback-check.mp4/ }).click();
    await page
      .getByRole("button", { name: "Use native player", exact: true })
      .click();
    const v = page.locator(".ff-browser video");
    await expect(v).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return v && v.readyState >= 2;
    });
    await v.evaluate((v) => v.play());
    await page.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0,
    );
    await v.evaluate((v) => {
      v.currentTime = 9;
    });
    await page.waitForFunction(() => {
      const v = document.querySelector("video")!;
      return v.currentTime >= 9 && !v.seeking;
    });
    const old = await v.elementHandle();
    await page
      .getByRole("button", { name: "Close preview (Escape)", exact: true })
      .click();
    await expect(v).toHaveCount(0);
    expect(
      await old!.evaluate((v) => ({
        paused: v.paused,
        src: v.getAttribute("src"),
      })),
    ).toEqual({ paused: true, src: null });
    await old!.dispose();
  }
  expect(errors).toEqual([]);
});
test("narrow view remains usable without horizontal overflow", async ({
  page,
}) => {
  await go(page, join(fixture, "References"));
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(500);
  await expect(page.locator(".ff-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).toHaveValue(join(fixture, "References"));
  await page
    .getByRole("button", { name: "Grid view (Ctrl+2)", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Aether-light.jpg", exact: true })
    .click();
  await expect(page.locator(".ff-preview")).toBeVisible();
  expect(
    await page
      .locator(".ff-browser")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page
    .locator(".ff-browser")
    .screenshot({ path: "artifacts/narrow-images.png" });
});

test("compatibility video renders moving frames, seeks, pauses and releases audio", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const w = window as typeof window & {
      audioChecks: { contexts: AudioContext[]; samples: number };
    };
    w.audioChecks = { contexts: [], samples: 0 };
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.audioChecks.contexts.push(this);
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when = 0, offset = 0, duration?: number) => {
          if (source.buffer?.getChannelData(0).some((v) => Math.abs(v) > 0.001))
            w.audioChecks.samples++;
          start(when, offset, duration);
        };
        return source;
      }
    };
  });
  await page.reload();
  await expect(page.locator(".ff-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.getByLabel("File or folder path", { exact: true }),
  ).not.toHaveValue("");
  const file =
    process.env.FILES_VIDEO_TEST_PATH ||
    join(fixture, "Exports", "playback-check.mp4");
  await go(page, file);
  const player = page.locator(".ff-safe-video");
  const canvas = player.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(player.locator('[role="status"]')).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  const frame = () => canvas.evaluate((c) => c.toDataURL());
  const poster = await frame();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Play video", exact: true })
      .first()
      .click();
    await expect(player).toHaveAttribute("data-playing", "true");
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".ff-safe-video")?.getAttribute("data-time"),
        ) > 0.5,
    );
    await page
      .getByLabel("Video position", { exact: true })
      .fill(String(5 + i));
    await page.waitForFunction(
      (t) =>
        Number(
          document.querySelector(".ff-safe-video")?.getAttribute("data-time"),
        ) >
        t + 0.3,
      5 + i,
    );
    await page
      .getByRole("button", { name: "Pause video", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-playing", "false");
    const paused = await frame();
    expect(paused).not.toEqual(poster);
    await page.waitForTimeout(200);
    expect(await frame()).toEqual(paused);
    await expect(page.locator("video")).toHaveCount(0);
  }
  await page.screenshot({ path: "artifacts/compatibility-player.png" });
  if (!process.env.FILES_VIDEO_TEST_PATH) {
    expect(
      await page.evaluate(() => (window as any).audioChecks.samples),
    ).toBeGreaterThan(0);
  }
  await page
    .getByRole("button", { name: "Close preview (Escape)", exact: true })
    .click();
  await expect(player).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).audioChecks.contexts.every(
        (c: AudioContext) => c.state === "closed",
      ),
    ),
  ).toBe(true);
});
