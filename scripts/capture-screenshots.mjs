import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
const base = await mkdtemp(join(tmpdir(), "files-demo-"));
const root = join(base, "Studio");
for (const name of ["Sources", "References", "Exports", "Reports"])
  await mkdir(join(root, name), { recursive: true });
await writeFile(
  join(root, "README.md"),
  "# Studio\n\nA small workspace for source, images, media and interactive reports.\n",
);
await writeFile(
  join(root, "Sources", "browser.tsx"),
  `import { useState } from "react";\n\ntype View = "list" | "grid" | "columns";\ntype File = { name: string; path: string; size: number };\n\nexport function FileBrowser({ files }: { files: File[] }) {\n  const [view, setView] = useState<View>("columns");\n  const [filter, setFilter] = useState("");\n  const visible = files.filter(file =>\n    file.name.toLowerCase().includes(filter.toLowerCase())\n  );\n\n  return (\n    <section aria-label="Project files">\n      <input value={filter} onChange={e => setFilter(e.target.value)} />\n      <nav>\n        {(["list", "grid", "columns"] as const).map(mode => (\n          <button key={mode} onClick={() => setView(mode)}>\n            {mode}\n          </button>\n        ))}\n      </nav>\n      <ul data-view={view}>\n        {visible.map(file => <li key={file.path}>{file.name}</li>)}\n      </ul>\n    </section>\n  );\n}\n`,
);
await writeFile(
  join(root, "Sources", "model.ts"),
  'export type Entry = {name: string; path: string; kind: "file" | "directory"};\n',
);
await copyFile(
  "artifacts/fixtures/Studio/Exports/playback-check.mp4",
  join(root, "Exports", "playback-check.mp4"),
);
for (const [name, a, b] of [
  ["Afterglow", "#df775d", "#543254"],
  ["Tidal", "#5599b2", "#182d52"],
  ["Aurora", "#71afa0", "#213c42"],
  ["Dune", "#d8b270", "#635449"],
])
  await writeFile(
    join(root, "References", name + ".svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="960" height="600" fill="url(#g)"/><circle cx="630" cy="210" r="140" fill="#f5e3c8" opacity=".8"/><path d="M0 460 Q180 220 410 420 T960 380 V600 H0Z" fill="${b}"/><path d="M0 520 Q250 360 510 480 T960 400 V600 H0Z" fill="#131e2c" opacity=".6"/></svg>`,
  );
await writeFile(
  join(root, "Reports", "index.html"),
  `<!doctype html><html><head><title>Studio overview</title><style>*{box-sizing:border-box}body{margin:0;padding:38px;background:#f4f2ed;color:#25342f;font:15px system-ui}small{letter-spacing:2px;font-size:10px;color:#64766b}h1{font-size:34px;letter-spacing:-1px;margin:12px 0}p{color:#64766b;line-height:1.7}.stats{display:flex;gap:15px;margin:28px 0}.stats article{flex:1;background:white;padding:21px;border-radius:10px}.stats b{display:block;font-size:26px;margin:12px 0}.chart{background:white;padding:24px;border-radius:12px}.bars{height:180px;display:flex;align-items:end;gap:12px;margin-top:20px}.bars i{flex:1;display:block;background:#78a18a;border-radius:5px 5px 0 0}button{background:#2d5341;color:white;border:0;border-radius:7px;padding:10px 15px;margin-top:24px}footer{font-size:12px;color:#64766b;margin-top:26px}</style></head><body><small>STUDIO / WEEKLY REPORT</small><h1>Room to create.</h1><p>A local HTML report, open directly from your workspace.</p><div class="stats"><article>Source files<b>48</b><small>PROJECT</small></article><article>Media assets<b>124</b><small>LIBRARY</small></article><article>Build time<b>1.8s</b><small>LAST RUN</small></article></div><div class="chart"><strong>Activity this week</strong><div class="bars">${[35, 65, 49, 87, 58, 95, 72].map((n) => '<i style="height:' + n + '%"></i>').join("")}</div></div><button onclick="this.textContent='Report refreshed'">Refresh report</button><footer>Interactive HTML · relative assets · sandboxed scripts</footer></body></html>`,
);
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1050 },
    colorScheme: "dark",
  });
  await page.goto(process.env.BB_SERVER_URL + "/plugins/files/browse");
  const path = page.getByLabel("File or folder path", { exact: true });
  await expect(path).not.toHaveValue("");
  await expect(page.locator(".ff-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  async function go(target) {
    await path.fill(join(root, target));
    await path.press("Enter");
    await expect(path).toHaveValue(
      extname(target) ? dirname(join(root, target)) : join(root, target),
    );
    await expect(page.locator(".ff-content")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  }
  await go("Sources");
  await page
    .getByRole("button", { name: "Column view (Ctrl+3)", exact: true })
    .click();
  await page.getByRole("option", { name: /browser.tsx/ }).click();
  await expect(page.locator(".ff-source")).toContainText("FileBrowser");
  await page
    .locator(".ff-browser")
    .screenshot({ path: "docs/screenshots/source.png" });
  await go("References");
  await page
    .getByRole("button", { name: "Grid view (Ctrl+2)", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Afterglow.svg", exact: true })
    .click();
  await expect(page.locator(".ff-image-stage img")).toBeVisible();
  await page.waitForTimeout(300);
  await page
    .locator(".ff-browser")
    .screenshot({ path: "docs/screenshots/images.png" });
  await go("Reports/index.html");
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Room to create." }),
  ).toBeVisible();
  await page
    .locator(".ff-browser")
    .screenshot({ path: "docs/screenshots/html.png" });
  await go("Exports/playback-check.mp4");
  await expect(page.locator(".ff-safe-video canvas")).toBeVisible();
  await expect(page.locator(".ff-safe-video [role=status]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Play video", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(".ff-safe-video")?.getAttribute("data-time"),
      ) > 1,
  );
  await page.getByRole("button", { name: "Pause video", exact: true }).click();
  await expect(page.locator("video")).toHaveCount(0);
  await page
    .locator(".ff-browser")
    .screenshot({ path: "docs/screenshots/video.png" });
  console.log(
    "Captured source, images, HTML and software video from generated demo files.",
  );
} finally {
  await browser.close();
}
