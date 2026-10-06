import { test, expect } from "@playwright/test";
import {
  mkdir,
  writeFile,
  mkdtemp,
  copyFile,
  rm,
  utimes,
} from "node:fs/promises";
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
for (const format of ["png", "jpg", "svg"] as const) {
  test(`image copy writes full-resolution ${format} pixels and can be pasted`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const root = await mkdtemp(join(fixture, "image-copy-"));
    const file = join(root, `image.${format}`);
    try {
      if (format === "jpg") {
        await copyFile(join(fixture, "References", "Aether-light.jpg"), file);
      } else if (format === "svg") {
        await writeFile(
          file,
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="12"><rect width="10" height="12" fill="red"/></svg>',
        );
      } else {
        const data = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 20;
          canvas.height = 12;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#ff0000";
          ctx.fillRect(0, 0, 10, 12);
          return canvas.toDataURL("image/png").split(",")[1];
        });
        await writeFile(file, Buffer.from(data, "base64"));
      }
      await go(page, file);
      const image = page.locator(".ff-image-stage img");
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const expected = await image.evaluate(async (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              ),
            ),
          ),
        };
      });
      for (const action of ["button", "keyboard"]) {
        await page.evaluate(() =>
          navigator.clipboard.writeText("clipboard sentinel"),
        );
        if (action === "button")
          await page
            .getByRole("button", { name: "Copy image", exact: true })
            .click();
        else {
          await page.locator(".ff-preview-body").focus();
          await page.keyboard.press("Control+c");
        }
        await expect
          .poll(() =>
            page.evaluate(
              async () => (await navigator.clipboard.read())[0].types,
            ),
          )
          .toContain("image/png");
        const actual = await page.evaluate(async () => {
          const item = (await navigator.clipboard.read())[0];
          const bitmap = await createImageBitmap(
            await item.getType("image/png"),
          );
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return {
            width: canvas.width,
            height: canvas.height,
            pixels: Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                ),
              ),
            ),
            types: item.types,
          };
        });
        expect(actual.types).not.toContain("text/plain");
        expect({
          width: actual.width,
          height: actual.height,
          pixels: actual.pixels,
        }).toEqual(expected);
        await page.evaluate(() => {
          const target = document.createElement("div");
          target.id = "image-paste-target";
          target.contentEditable = "true";
          target.addEventListener("paste", (event) => {
            event.preventDefault();
            const image = event.clipboardData?.files[0];
            target.dataset.pastedType = image?.type ?? "no image";
          });
          document.body.append(target);
          target.focus();
        });
        await page.keyboard.press("Control+v");
        await expect(page.locator("#image-paste-target")).toHaveAttribute(
          "data-pasted-type",
          "image/png",
        );
        await page
          .locator("#image-paste-target")
          .evaluate((target) => target.remove());
      }
      await page
        .getByRole("button", { name: "Copy file path", exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(file);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("failed image copying reports the failure without replacing the clipboard with a path", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await go(page, join(fixture, "References", "Aether-light.jpg"));
  const image = page.locator(".ff-image-stage img");
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const url = await image.getAttribute("src");
  await page.route(url!, (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.evaluate(() =>
    navigator.clipboard.writeText("clipboard sentinel"),
  );
  await page.getByRole("button", { name: "Copy image", exact: true }).click();
  await expect(page.locator(".ff-error")).toContainText(
    "Image request failed (404)",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "clipboard sentinel",
  );
});

test("BB built-in image preview and full-screen viewer copy pasteable images", async ({
  page,
  context,
}) => {
  const threadId = process.env.BB_THREAD_ID;
  test.skip(
    !threadId,
    "Set BB_THREAD_ID to exercise the built-in image viewers.",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const response = await page.request.post(
    "/api/v1/plugins/files/rpc/context",
    { data: { threadId, projectId: null } },
  );
  const workspace = (await response.json()).result;
  const root = await mkdtemp(join(workspace.path, "image-clipboard-test-"));
  const file = join(root, "clipboard-image.jpg");
  await copyFile(join(fixture, "References", "Aether-light.jpg"), file);
  let opened = false;
  try {
    await page.evaluate(() =>
      localStorage.setItem(
        "bb.fileOpenerByExtension",
        JSON.stringify({ jpg: "__builtin__" }),
      ),
    );
    await page.goto(`/threads/${threadId}`);
    const show = page.getByRole("button", {
      name: "Show right panel (Ctrl + J)",
      exact: true,
    });
    await expect(
      page.getByRole("button", {
        name: /(?:Show|Hide) right panel \(Ctrl \+ J\)/,
      }),
    ).toBeVisible();
    if (await show.isVisible()) await show.click();
    await page
      .getByRole("button", { name: "Open new tab (Ctrl + T)", exact: true })
      .click();
    const search = page.getByRole("combobox", { name: /Search files/ });
    await search.fill(root.split("/").at(-1)! + "/clipboard-image.jpg");
    await expect(
      page
        .getByRole("option")
        .filter({ hasText: "clipboard-image.jpg" })
        .first(),
    ).toBeVisible();
    await search.press("Enter");
    opened = true;
    await expect(page.locator(".ff-browser")).toHaveCount(0);
    const preview = page.getByRole("button", {
      name: /Open .*clipboard-image.jpg in full screen preview/,
    });
    await expect(preview).toBeVisible();
    const original = await preview
      .locator("img")
      .evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              ),
            ),
          ),
        };
      });
    for (const action of ["preview", "lightbox", "keyboard"]) {
      await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
      if (action === "preview")
        await page
          .getByRole("button", { name: "Copy image", exact: true })
          .click();
      else if (action === "lightbox") {
        await preview.click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Copy image", exact: true })
          .click();
      } else {
        await page.getByRole("dialog").focus();
        await page.keyboard.press("Control+c");
      }
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await navigator.clipboard.read())[0].types,
          ),
        )
        .toContain("image/png");
      const copied = await page.evaluate(async () => {
        const item = (await navigator.clipboard.read())[0];
        const bitmap = await createImageBitmap(await item.getType("image/png"));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              ),
            ),
          ),
        };
      });
      expect(copied).toEqual(original);
    }
    await page.getByRole("button", { name: "Close image preview" }).click();
  } finally {
    if (opened) {
      await page
        .getByRole("button", { name: "clipboard-image.jpg", exact: true })
        .last()
        .hover();
      await page
        .getByRole("button", { name: "Close clipboard-image.jpg", exact: true })
        .last()
        .click();
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("copying preview text preserves the selection and file-list copy still copies paths", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const root = await mkdtemp(join(fixture, "copy-test-"));
  const file = join(root, "selection.txt");
  const content = "Copy this selected sentence.\n";
  await writeFile(file, content);
  try {
    await go(page, file);
    const source = page.locator(".ff-source");
    await expect(source).toContainText(content.trim());
    await page.locator(".ff-browser").focus();
    await source.locator("code").evaluate((element) => {
      const selected = "selected sentence";
      const start = element.textContent!.indexOf(selected);
      if (start < 0) throw new Error("Selection fixture was not rendered");
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let offset = 0;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const end = offset + node.textContent!.length;
        if (offset <= start && start < end)
          range.setStart(node, start - offset);
        if (
          offset < start + selected.length &&
          start + selected.length <= end
        ) {
          range.setEnd(node, start + selected.length - offset);
          document.getSelection()!.removeAllRanges();
          document.getSelection()!.addRange(range);
          return;
        }
        offset = end;
      }
      throw new Error("Selection fixture was not rendered");
    });
    // A background change check must not replace unchanged preview DOM.
    await page.waitForTimeout(2300);
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(
      "selected sentence",
    );
    await page.keyboard.press("Control+c");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("selected sentence");
    await page.evaluate(() => document.getSelection()!.removeAllRanges());
    await page.getByRole("listbox").focus();
    await page.keyboard.press("Control+c");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(file);
    await page
      .getByRole("button", { name: "Copy file path", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(file);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Markdown renders and updates after edits with unchanged size and modification time", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const root = await mkdtemp(join(fixture, "markdown-test-"));
  const file = join(root, "document.md");
  const timestamp = new Date("2026-01-01T00:00:00Z");
  await writeFile(file, "# Prior heading\n\nA **bold** paragraph.\n");
  await utimes(file, timestamp, timestamp);
  try {
    await go(page, file);
    await expect(
      page.getByRole("heading", { name: "Prior heading", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".ff-markdown strong")).toHaveText("bold");
    await page.locator(".ff-preview-body").focus();
    await page.locator(".ff-markdown p").evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    });
    await page.keyboard.press("Control+c");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("A bold paragraph.");
    await writeFile(file, "# After heading\n\nA **bold** paragraph.\n");
    await utimes(file, timestamp, timestamp);
    await expect(
      page.getByRole("heading", { name: "After heading", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Prior heading", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "View source", exact: true })
      .click();
    await expect(page.locator(".ff-source")).toContainText("# After heading");
    await page
      .getByRole("button", { name: "Render Markdown", exact: true })
      .click();
    await writeFile(file, "# Later heading\n\nA **bold** paragraph.\n");
    await utimes(file, timestamp, timestamp);
    await expect(
      page.getByRole("heading", { name: "Later heading", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    // A transient missing file recovers when the file becomes readable again.
    await rm(file);
    await expect(page.locator(".ff-preview [role=alert]")).toBeVisible({
      timeout: 10000,
    });
    await writeFile(file, "# Saved again\n");
    await expect(
      page.getByRole("heading", { name: "Saved again", exact: true }),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source preview displays edited Markdown at the same path", async ({
  page,
}) => {
  const root = await mkdtemp(join(fixture, "source-update-test-"));
  const file = join(root, "document.md");
  await writeFile(file, "# Before save\n");
  try {
    await go(page, file);
    await expect(
      page.getByRole("heading", { name: "Before save", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View source", exact: true })
      .click();
    await expect(page.locator(".ff-source")).toContainText("# Before save");
    await writeFile(file, "# After save\n");
    await expect(page.locator(".ff-source")).toContainText("# After save", {
      timeout: 10000,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("switching and closing previews discard late reads and stop change checks", async ({
  page,
}) => {
  const root = await mkdtemp(join(fixture, "lifecycle-test-"));
  const first = join(root, "first.md");
  const second = join(root, "second.md");
  await writeFile(first, "# First document\n");
  await writeFile(second, "# Second document\n");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstReadPending = false;
  let firstReadReleased = false;
  let checks = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/plugins/files/rpc/info")) checks++;
  });
  await page.route("**/plugins/files/rpc/text", async (route) => {
    if (route.request().postDataJSON().path !== first) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    firstReadPending = true;
    await held;
    await route.fulfill({ response });
    firstReadReleased = true;
  });
  try {
    await go(page, first);
    await expect.poll(() => firstReadPending).toBe(true);
    await go(page, second);
    await expect(
      page.getByRole("heading", { name: "Second document", exact: true }),
    ).toBeVisible();
    release();
    await expect.poll(() => firstReadReleased).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Second document", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "First document", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Close preview (Escape)", exact: true })
      .click();
    const checksAtClose = checks;
    await page.waitForTimeout(2500);
    expect(checks).toBe(checksAtClose);
  } finally {
    release();
    await page.unroute("**/plugins/files/rpc/text");
    await rm(root, { recursive: true, force: true });
  }
});

test("manual refresh rereads text when listing metadata has not changed", async ({
  page,
}) => {
  const root = await mkdtemp(join(fixture, "refresh-test-"));
  const file = join(root, "document.txt");
  const timestamp = new Date("2026-01-01T00:00:00Z");
  await writeFile(file, "Before refresh");
  await utimes(file, timestamp, timestamp);
  try {
    await go(page, file);
    await expect(page.locator(".ff-source")).toContainText("Before refresh");
    await writeFile(file, "After! refresh");
    await utimes(file, timestamp, timestamp);
    await page
      .getByRole("button", { name: "Refresh folder (F5)", exact: true })
      .click();
    await expect(page.locator(".ff-source")).toContainText("After! refresh", {
      timeout: 1500,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
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
    await v.evaluate((v) => {
      if (!(v instanceof HTMLVideoElement))
        throw new Error("Expected a video element");
      return v.play();
    });
    await page.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0,
    );
    await v.evaluate((v) => {
      if (!(v instanceof HTMLVideoElement))
        throw new Error("Expected a video element");
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
      await old!.evaluate((v) => {
        if (!(v instanceof HTMLVideoElement))
          throw new Error("Expected a video element");
        return { paused: v.paused, src: v.getAttribute("src") };
      }),
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
  const frame = () =>
    canvas.evaluate((c) => {
      if (!(c instanceof HTMLCanvasElement))
        throw new Error("Expected a canvas element");
      return c.toDataURL();
    });
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

test("wheel scrolling folder lists keeps the application responsive in every view", async ({
  page,
}) => {
  const root = join(fixture, "Scrollable folders");
  await mkdir(root, { recursive: true });
  await Promise.all(
    Array.from({ length: 240 }, (_, i) =>
      mkdir(join(root, `folder-${String(i).padStart(3, "0")}`), {
        recursive: true,
      }),
    ),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await go(page, root);
  for (const [view, shortcut] of [
    ["List", 1],
    ["Grid", 2],
    ["Column", 3],
  ] as const) {
    await page
      .getByRole("button", {
        name: `${view} view (Ctrl+${shortcut})`,
        exact: true,
      })
      .click();
    const list = page.getByRole("listbox", {
      name: "Files and folders",
      exact: true,
    });
    await expect(
      list.getByRole("option", { name: /^folder-000/ }),
    ).toBeVisible();
    await list.hover();
    await page.mouse.wheel(0, 1200);
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 500);
    await expect(list).toBeVisible();
    await expect(
      page.getByLabel("File or folder path", { exact: true }),
    ).toHaveValue(root);
    await page.mouse.wheel(0, -100000);
    await expect(
      list.getByRole("option", { name: /^folder-000/ }),
    ).toBeVisible();
    await list.getByRole("option", { name: /^folder-000/ }).dblclick();
    await expect(
      page.getByLabel("File or folder path", { exact: true }),
    ).toHaveValue(join(root, "folder-000"));
    await go(page, root);
  }
  expect(errors).toEqual([]);
});

test("HTML renders interactive local assets in a sandbox and can switch to source", async ({
  page,
}) => {
  const root = join(fixture, "HTML");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(
    join(root, "assets", "app.js"),
    `document.querySelector('button').onclick=()=>document.querySelector('output').textContent='Clicked';try{parent.document.body;document.body.dataset.isolation='unsafe'}catch{document.body.dataset.isolation='blocked'}`,
  );
  await writeFile(
    join(root, "index.html"),
    `<!doctype html><html><head><title>Local report</title></head><body><h1>Interactive report</h1><button>Run demo</button><output>Ready</output><script src="assets/app.js"></script><video src="blocked.webm" autoplay muted></video></body></html>`,
  );
  const mediaRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("blocked.webm"))
      mediaRequests.push(request.url());
  });
  await go(page, join(root, "index.html"));
  const frame = page.frameLocator('iframe[title="HTML preview of index.html"]');
  await expect(
    frame.getByRole("heading", { name: "Interactive report" }),
  ).toBeVisible();
  await expect(frame.locator("body")).toHaveAttribute(
    "data-isolation",
    "blocked",
  );
  await frame.getByRole("button", { name: "Run demo" }).click();
  await expect(frame.locator("output")).toHaveText("Clicked");
  expect(mediaRequests).toEqual([]);
  await page.getByRole("button", { name: "View source", exact: true }).click();
  await expect(page.locator("iframe:visible")).toHaveCount(0);
  await expect(page.locator(".ff-source")).toContainText("Interactive report");
  await page.getByRole("button", { name: "Render HTML", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Interactive report" }),
  ).toBeVisible();
});

test("HTML keeps its page, dark mode and form state after switching to a BB thread and back", async ({
  page,
}) => {
  const root = await mkdtemp(join(fixture, "html-session-test-"));
  const file = join(root, "index.html");
  await writeFile(
    file,
    '<!doctype html><h1>Home page</h1><a href="details.html">Open details</a>',
  );
  await writeFile(
    join(root, "details.html"),
    `<!doctype html><html><head><style>
    body { background: white; color: black; } body.dark { color-scheme: dark; background: #171717; color: white; }
    </style></head><body><h1>Details page</h1><button onclick="document.body.classList.toggle('dark')">Toggle dark mode</button>
    <label>Notes <input aria-label="Notes"></label><output id="runtime"></output>
    <script>document.getElementById('runtime').textContent=String(Math.random());</script></body></html>`,
  );
  let htmlCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/plugins/files/rpc/html")) htmlCalls++;
  });
  try {
    await go(page, file);
    const frame = page.frameLocator(
      'iframe[title="HTML preview of index.html"]',
    );
    await expect(
      frame.getByRole("heading", { name: "Home page", exact: true }),
    ).toBeVisible();
    await frame
      .getByRole("link", { name: "Open details", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", { name: "Details page", exact: true }),
    ).toBeVisible();
    await frame
      .getByRole("button", { name: "Toggle dark mode", exact: true })
      .click();
    await frame
      .getByRole("textbox", { name: "Notes", exact: true })
      .fill("Keep this unsaved text");
    const runtime = await frame.locator("#runtime").textContent();
    const original = await page
      .locator('iframe[title="HTML preview of index.html"]')
      .elementHandle();
    const callsBefore = htmlCalls;
    const thread = page.locator('a[href*="/threads/"]').first();
    await thread.click();
    await page.waitForURL(/\/threads\//);
    await expect(
      page.locator('iframe[title="HTML preview of index.html"]'),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Sidebar navigation" })
      .getByRole("button", { name: "Files", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Preview of index.html", exact: true }),
    ).toBeVisible();
    await expect(
      frame.getByRole("heading", { name: "Details page", exact: true }),
    ).toBeVisible();
    await expect(frame.locator("body")).toHaveClass("dark");
    await expect(
      frame.getByRole("textbox", { name: "Notes", exact: true }),
    ).toHaveValue("Keep this unsaved text");
    await expect(frame.locator("#runtime")).toHaveText(runtime!);
    expect(htmlCalls).toBe(callsBefore);
    expect(
      await original!.evaluate(
        (element) =>
          element ===
          document.querySelector('iframe[title="HTML preview of index.html"]'),
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(
      frame.getByRole("button", { name: "Toggle dark mode", exact: true }),
    ).toBeVisible();
    const bounds = await page
      .locator('iframe[title="HTML preview of index.html"]')
      .boundingBox();
    const anchor = await page.locator(".ff-html-placeholder").boundingBox();
    expect(bounds!.width).toBeCloseTo(anchor!.width, 0);
    // The retained iframe must stay clipped inside a short preview, leaving its toolbar clickable.
    await page.setViewportSize({ width: 1000, height: 450 });
    await page
      .getByRole("button", { name: "View source", exact: true })
      .click();
    await expect(page.locator(".ff-source")).toBeVisible();
    await expect(
      page.locator('iframe[title="HTML preview of index.html"]'),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Render HTML", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", { name: "Details page", exact: true }),
    ).toBeVisible();
    await expect(frame.locator("body")).toHaveClass("dark");
    await page
      .getByRole("button", { name: "Refresh folder (F5)", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", { name: "Home page", exact: true }),
    ).toBeVisible();
    expect(htmlCalls).toBeGreaterThan(callsBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HTML larger than the RPC message limit renders its complete tail and interactive assets", async ({
  page,
}) => {
  test.setTimeout(60000);
  const root = join(fixture, "Large HTML");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "app.js"),
    `document.querySelector('button').onclick=()=>document.querySelector('output').textContent='Full report works';try{parent.document.body;document.body.dataset.isolation='unsafe'}catch{document.body.dataset.isolation='blocked'}`,
  );
  await writeFile(
    join(root, "report.html"),
    "<!doctype html><title>Large report</title><!--" +
      "x".repeat(12 * 1024 * 1024) +
      '--><h1>Complete large report</h1><button>Run full report</button><output>Ready</output><script src="app.js"></script><video src="blocked.webm" autoplay muted></video>',
  );
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("blocked.webm")) requests.push(request.url());
  });
  await go(page, join(root, "report.html"));
  const frame = page.frameLocator(
    'iframe[title="HTML preview of report.html"]',
  );
  await expect(
    frame.getByRole("heading", { name: "Complete large report" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(frame.locator("body")).toHaveAttribute(
    "data-isolation",
    "blocked",
  );
  await frame.getByRole("button", { name: "Run full report" }).click();
  await expect(frame.locator("output")).toHaveText("Full report works");
  expect(requests).toEqual([]);
  await page
    .locator(".ff-browser")
    .screenshot({ path: "artifacts/large-html-full.png" });
});

test("an HTML file tab preserves dark mode and runtime state across BB threads", async ({
  page,
}) => {
  const threadId = process.env.BB_THREAD_ID;
  const otherThreadId = process.env.BB_OTHER_THREAD_ID;
  test.skip(
    !threadId || !otherThreadId,
    "Set BB_THREAD_ID and BB_OTHER_THREAD_ID for the live thread round trip.",
  );
  const response = await page.request.post(
    "/api/v1/plugins/files/rpc/context",
    { data: { threadId, projectId: null } },
  );
  const context = (await response.json()).result;
  const root = await mkdtemp(join(context.path, "html-session-tab-test-"));
  const filename = "session.html";
  await writeFile(
    join(root, filename),
    `<!doctype html><html><body><h1>Retained thread page</h1>
    <button onclick="document.body.dataset.theme='dark';document.body.style.background='#171717';document.body.style.color='white'">Choose dark mode</button>
    <input aria-label="Unsaved note"><output id="runtime"></output><script>document.getElementById('runtime').textContent=String(Math.random());</script></body></html>`,
  );
  let htmlCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/plugins/files/rpc/html")) htmlCalls++;
  });
  let opened = false;
  try {
    await page.goto(`/threads/${threadId}`);
    await expect(
      page.getByRole("button", {
        name: /(?:Show|Hide) right panel \(Ctrl \+ J\)/,
      }),
    ).toBeVisible();
    const show = page.getByRole("button", {
      name: "Show right panel (Ctrl + J)",
      exact: true,
    });
    if (await show.isVisible()) await show.click();
    await page
      .getByRole("button", { name: "Open new tab (Ctrl + T)", exact: true })
      .click();
    const search = page.getByRole("combobox", { name: /Search files/ });
    await search.fill(root.split("/").at(-1)! + "/" + filename);
    await expect(
      page.getByRole("option").filter({ hasText: filename }).first(),
    ).toBeVisible();
    await search.press("Enter");
    opened = true;
    const frame = page.frameLocator(
      `iframe[title="HTML preview of ${filename}"]`,
    );
    await expect(
      frame.getByRole("heading", { name: "Retained thread page", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".ff-preview")).toHaveClass(/ff-expanded/);
    await frame
      .getByRole("button", { name: "Choose dark mode", exact: true })
      .click();
    await frame
      .getByRole("textbox", { name: "Unsaved note", exact: true })
      .fill("Keep my thread page");
    const runtime = await frame.locator("#runtime").textContent();
    const callsBefore = htmlCalls;
    await page.locator(`a[href$="/threads/${otherThreadId}"]`).first().click();
    await page.waitForURL(new RegExp(`/threads/${otherThreadId}$`));
    await expect(
      page.locator(`iframe[title="HTML preview of ${filename}"]`),
    ).toHaveCount(0);
    await page.locator(`a[href$="/threads/${threadId}"]`).first().click();
    await page.waitForURL(new RegExp(`/threads/${threadId}$`));
    await expect(
      frame.getByRole("heading", { name: "Retained thread page", exact: true }),
    ).toBeVisible();
    await expect(frame.locator("body")).toHaveAttribute("data-theme", "dark");
    await expect(
      frame.getByRole("textbox", { name: "Unsaved note", exact: true }),
    ).toHaveValue("Keep my thread page");
    await expect(frame.locator("#runtime")).toHaveText(runtime!);
    await expect(page.locator(".ff-preview")).toHaveClass(/ff-expanded/);
    expect(htmlCalls).toBe(callsBefore);
    await page
      .getByRole("button", { name: filename, exact: true })
      .last()
      .hover();
    await page
      .getByRole("button", { name: `Close ${filename}`, exact: true })
      .last()
      .click();
    opened = false;
  } finally {
    if (opened && page.url().endsWith(`/threads/${threadId}`)) {
      const tab = page
        .getByRole("button", { name: filename, exact: true })
        .last();
      if (await tab.isVisible()) {
        await tab.hover();
        await page
          .getByRole("button", { name: `Close ${filename}`, exact: true })
          .last()
          .click();
      }
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("BB file tabs use Files by default for HTML, source and compatibility video", async ({
  page,
}) => {
  test.setTimeout(60000);
  const threadId = process.env.BB_THREAD_ID;
  test.skip(
    !threadId,
    "Set BB_THREAD_ID to exercise BB's live file-opener routing.",
  );
  const response = await page.request.post(
    "/api/v1/plugins/files/rpc/context",
    { data: { threadId, projectId: null } },
  );
  const context = (await response.json()).result;
  const openerRoot = await mkdtemp(join(context.path, "files-opener-test-"));
  await writeFile(
    join(openerRoot, "index.html"),
    "<h1>Interactive report</h1>",
  );
  await copyFile(
    join(fixture, "Sources/browser.tsx"),
    join(openerRoot, "browser.tsx"),
  );
  await copyFile(
    join(fixture, "Exports/playback-check.mp4"),
    join(openerRoot, "playback-check.mp4"),
  );
  try {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const file of [
      "index.html",
      "browser.tsx",
      "playback-check.mp4",
      "builtin:index.html",
    ]) {
      const builtin = file.startsWith("builtin:");
      const filename = file.replace("builtin:", "");
      const path = openerRoot.split("/").at(-1)! + "/" + filename;
      await page.evaluate(
        (builtin) =>
          localStorage.setItem(
            "bb.fileOpenerByExtension",
            JSON.stringify(builtin ? { html: "__builtin__" } : {}),
          ),
        builtin,
      );
      await page.goto(`/threads/${threadId}`);
      await expect(
        page
          .getByRole("navigation", { name: "Sidebar navigation" })
          .getByRole("button", { name: "Files", exact: true }),
      ).toBeVisible();
      const show = page.getByRole("button", {
        name: "Show right panel (Ctrl + J)",
        exact: true,
      });
      await expect(
        page.getByRole("button", {
          name: /(?:Show|Hide) right panel \(Ctrl \+ J\)/,
        }),
      ).toBeVisible();
      if (await show.isVisible()) await show.click();
      await page
        .getByRole("button", { name: "Open new tab (Ctrl + T)", exact: true })
        .click();
      const search = page.getByRole("combobox", { name: /Search files/ });
      await search.fill(path);
      await expect(
        page.getByRole("option").filter({ hasText: filename }).first(),
      ).toBeVisible();
      await search.press("Enter");
      if (builtin) {
        await expect(
          page.getByRole("button", { name: filename, exact: true }).last(),
        ).toBeVisible();
        await expect(page.locator(".ff-browser")).toHaveCount(0);
      } else {
        await expect(page.locator(".ff-browser")).toBeVisible();
        await expect(page.locator(".ff-preview")).toHaveClass(/ff-expanded/);
        if (file.endsWith(".html")) {
          await expect(
            page
              .frameLocator('iframe[title="HTML preview of index.html"]')
              .getByRole("heading", { name: "Interactive report" }),
          ).toBeVisible();
        } else if (file.endsWith(".tsx")) {
          await expect(page.locator(".ff-source")).toContainText(
            "definePluginApp",
          );
        } else {
          await expect(page.locator(".ff-safe-video canvas")).toBeVisible();
          await expect(page.locator("video")).toHaveCount(0);
        }
      }
      await page
        .getByRole("button", { name: filename, exact: true })
        .last()
        .hover();
      await page
        .getByRole("button", {
          name: `Close ${filename}`,
          exact: true,
        })
        .last()
        .click();
    }
    expect(errors).toEqual([]);
  } finally {
    await rm(openerRoot, { recursive: true, force: true });
  }
});
