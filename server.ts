import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveFileTarget } from "./file-target";
import { registerMedia } from "./media";
import { hostContract, rpcContract } from "./contract";
export { rpcContract } from "./contract";
export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const media = registerMedia(bb);
  const previews = new Map<string, { baseUrl: string; expiresAtMs: number }>();
  bb.rpc.register(
    rpcContract,
    {
      resolveFile: ({ path, source }) =>
        resolveFileTarget(
          {
            primaryHost: async () =>
              (await bb.sdk.system.config()).primaryHostId || null,
            thread: (id) => bb.sdk.threads.get({ threadId: id }),
            environment: async (id) => {
              const env = await bb.sdk.environments.get({ environmentId: id });
              if (!env.path)
                throw new Error("Environment has no working directory.");
              return { hostId: env.hostId, path: env.path };
            },
            project: (id) => bb.sdk.projects.get({ projectId: id }),
            storage: (id) => bb.sdk.threads.storageLocation({ threadId: id }),
            resolve: (hostId, path, root) =>
              host.call("resolve", { path, root }, { hostId }),
          },
          path,
          source,
        ),
      html: ({ hostId, ...input }) => host.call("html", input, { hostId }),
      videoInfo: ({ hostId, ...input }) =>
        host.call("videoInfo", input, { hostId, timeoutMs: 20000 }),
      videoPoster: ({ hostId, ...input }) =>
        host.call("videoPoster", input, { hostId, timeoutMs: 20000 }),
      videoStart: ({ hostId, ...input }) =>
        host.call("videoStart", input, { hostId, timeoutMs: 20000 }),
      videoPoll: ({ hostId, ...input }) =>
        host.call("videoPoll", input, { hostId }),
      videoStop: ({ hostId, ...input }) =>
        host.call("videoStop", input, { hostId }),
      context: async ({ threadId, projectId }) => {
        const [hosts, config] = await Promise.all([
          bb.sdk.hosts.list(),
          bb.sdk.system.config(),
        ]);
        let hostId =
          config.primaryHostId ||
          hosts.find((h) => h.status === "connected")?.id;
        let path = "~";
        let projectPath: string | null = null;
        let projectHostId: string | null = null;
        if (threadId) {
          const thread = await bb.sdk.threads.get({ threadId });
          projectId = thread.projectId;
          if (thread.environmentId) {
            const env = await bb.sdk.environments.get({
              environmentId: thread.environmentId,
            });
            hostId = env.hostId;
            path = env.path || "~";
          }
        }
        if (projectId) {
          const { sources } = await bb.sdk.projects.get({ projectId });
          const source = sources.find((s) => s.isDefault) || sources[0];
          if (source) {
            projectPath = source.path;
            projectHostId = source.hostId;
            if (!threadId) {
              path = source.path;
              hostId = source.hostId;
            }
          }
        }
        if (!hostId)
          throw new Error("Connect a machine in BB to browse its files.");
        return {
          hostId,
          path,
          projectPath,
          projectHostId,
          hosts: hosts.map((h) => ({
            id: h.id,
            name: h.name,
            connected: h.status === "connected",
          })),
        };
      },
      list: ({ hostId, ...input }) => host.call("list", input, { hostId }),
      text: ({ hostId, ...input }) => host.call("text", input, { hostId }),
      media: ({ hostId, path }) => media.lease(hostId, path),
      preview: async ({ hostId, path }) => {
        const key = JSON.stringify([hostId, path]);
        const cached = previews.get(key);
        if (cached && cached.expiresAtMs > Date.now() + 60000) return cached;
        const result = await bb.sdk.files.createPreview({
          hostId,
          rootPath: path,
          ttlMs: 3600000,
        });
        if (previews.size >= 64) previews.delete(previews.keys().next().value!);
        previews.set(key, result);
        return result;
      },
    },
    {
      experimental_discoverable: true,
      experimental_description:
        "Browse files on connected machines, preview source and stream media.",
    },
  );
  bb.onDispose(() => previews.clear());
}
