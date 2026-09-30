import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const [pack] = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    encoding: "utf8",
  }),
);
const files = new Set(pack.files.map((f) => f.path));
for (const path of [
  "package.json",
  "LICENSE",
  "README.md",
  "skills/files/SKILL.md",
  ...["app", "server", "host"].flatMap((entry) => [
    `dist/${entry}.js`,
    `dist/${entry}.meta.json`,
  ]),
])
  assert(files.has(path), `Missing ${path}`);
assert(files.has("dist/app.css"));
for (const path of files)
  assert(
    !/(^|\/)(artifacts|tests|test-results|node_modules|\.env|\.jj|\.git)(\/|$)/.test(
      path,
    ),
    `Unexpected ${path}`,
  );
for (const entry of ["app", "server", "host"]) {
  const meta = JSON.parse(await readFile(`dist/${entry}.meta.json`, "utf8"));
  assert.equal(meta.pluginId, "files");
  assert.equal(meta.pluginVersion, manifest.version);
  assert.equal(meta.sdkVersion, manifest.devDependencies["@get-bb/plugin-sdk"]);
}
assert.equal(pack.version, manifest.version);
console.log(
  `${pack.name}@${pack.version}: ${files.size} files, ${pack.size} bytes packed; required builds present, local artifacts excluded.`,
);
