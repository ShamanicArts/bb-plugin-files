import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveFileTarget,
  type TargetLookup,
  type FileSource,
} from "../file-target";
import { resolveFilePath } from "../filesystem";
const source = (
  kind: FileSource["kind"],
  more: Partial<FileSource> = {},
): FileSource => ({
  kind,
  threadId: null,
  environmentId: null,
  projectId: null,
  ...more,
});
const lookup: TargetLookup = {
  primaryHost: async () => "server",
  thread: async () => ({ environmentId: "env", projectId: "project" }),
  environment: async () => ({ hostId: "remote", path: "/remote/worktree" }),
  project: async () => ({
    sources: [
      { hostId: "default", path: "/default/source", isDefault: true },
      { hostId: "other", path: "/other/source" },
    ],
  }),
  storage: async () => ({
    hostId: "storage",
    storageRootPath: "/server/thread-storage",
  }),
  resolve: async (_, path, root) => resolveFilePath({ path, root }),
};
test("file source resolution distinguishes environment, project, host and server storage", async () => {
  assert.deepEqual(
    await resolveFileTarget(
      lookup,
      "src/main.ts",
      source("workspace", { threadId: "thread" }),
    ),
    { hostId: "remote", path: "/remote/worktree/src/main.ts" },
  );
  assert.deepEqual(
    await resolveFileTarget(
      lookup,
      "index.html",
      source("workspace", {
        projectId: "project",
        experimental_hostId: "other",
      }),
    ),
    { hostId: "other", path: "/other/source/index.html" },
  );
  assert.deepEqual(
    await resolveFileTarget(
      lookup,
      "index.html",
      source("workspace", { projectId: "project" }),
    ),
    { hostId: "default", path: "/default/source/index.html" },
  );
  assert.deepEqual(
    await resolveFileTarget(
      lookup,
      "/tmp/clip.webm",
      source("host", { threadId: "thread" }),
    ),
    { hostId: "remote", path: "/tmp/clip.webm" },
  );
  assert.deepEqual(
    await resolveFileTarget(lookup, "/tmp/page.html", source("host")),
    { hostId: "server", path: "/tmp/page.html" },
  );
  assert.deepEqual(
    await resolveFileTarget(
      lookup,
      "report.html",
      source("thread-storage", { threadId: "thread" }),
    ),
    { hostId: "storage", path: "/server/thread-storage/report.html" },
  );
});
test("missing or mismatched sources fail instead of opening another machine's file", async () => {
  assert.deepEqual(
    await resolveFileTarget(
      lookup,
      "/tmp/remote.html",
      source("host", {
        threadId: "thread",
        experimental_hostId: "other-machine",
      }),
    ),
    { hostId: "other-machine", path: "/tmp/remote.html" },
  );
  await assert.rejects(
    resolveFileTarget(lookup, "index.html", source("workspace")),
    /project or environment/,
  );
  await assert.rejects(
    resolveFileTarget(
      lookup,
      "index.html",
      source("workspace", {
        environmentId: "env",
        experimental_hostId: "wrong",
      }),
    ),
    /does not own/,
  );
  await assert.rejects(
    resolveFileTarget(
      lookup,
      "index.html",
      source("workspace", {
        projectId: "project",
        experimental_hostId: "wrong",
      }),
    ),
    /no source/,
  );
  await assert.rejects(
    resolveFileTarget(lookup, "report.html", source("thread-storage")),
    /thread is required/,
  );
  for (const path of [
    "../escape.html",
    "/etc/passwd",
    "file:///etc/passwd",
    "~/index.html",
  ]) {
    await assert.rejects(
      resolveFileTarget(
        lookup,
        path,
        source("workspace", { environmentId: "env" }),
      ),
    );
  }
});
