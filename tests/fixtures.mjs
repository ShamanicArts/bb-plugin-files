import { mkdir, writeFile, copyFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const root = join(process.cwd(), "artifacts", "fixtures", "Studio");
for (const dir of ["Sources", "References", "Exports", "Many"])
  await mkdir(join(root, dir), { recursive: true });
for (const [source, target] of [
  ["app.tsx", "browser.tsx"],
  ["model.ts", "files.ts"],
  ["icons.tsx", "icons.tsx"],
])
  await copyFile(source, join(root, "Sources", target));
await copyFile("package.json", join(root, "package.json"));
await writeFile(
  join(root, "README.md"),
  "# Studio\n\nSource files, image references, and playback checks.\n",
);
await writeFile(
  join(root, ".hidden-test"),
  "Hidden-file navigation fixture.\n",
);
for (const [name, color] of [
  ["Aether-light.jpg", "lightblue"],
  ["Aether-dark.jpg", "slategray"],
]) {
  const path = join(root, "References", name);
  try {
    await access(path);
  } catch {
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=960x600`,
      "-frames:v",
      "1",
      "-y",
      path,
    ]);
  }
}
const video = join(root, "Exports", "playback-check.mp4");
try {
  await access(video);
} catch {
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=960x540:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220",
    "-t",
    "12",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-y",
    video,
  ]);
}
console.log(root);
