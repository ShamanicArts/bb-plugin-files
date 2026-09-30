export type FileSource = {
  kind: "host" | "workspace" | "thread-storage";
  threadId: string | null;
  environmentId: string | null;
  projectId: string | null;
  experimental_hostId?: string;
};
export type TargetLookup = {
  primaryHost(): Promise<string | null>;
  thread(
    id: string,
  ): Promise<{ environmentId: string | null; projectId: string | null }>;
  environment(id: string): Promise<{ hostId: string; path: string }>;
  project(id: string): Promise<{
    sources: { hostId: string; path: string; isDefault?: boolean }[];
  }>;
  storage(id: string): Promise<{ hostId: string; storageRootPath: string }>;
  resolve(
    hostId: string,
    path: string,
    root?: string,
  ): Promise<{ path: string }>;
};
export async function resolveFileTarget(
  lookup: TargetLookup,
  path: string,
  source: FileSource,
) {
  let hostId: string | null = source.experimental_hostId || null;
  let root: string | undefined;
  if (source.kind === "thread-storage") {
    if (!source.threadId)
      throw new Error("A thread is required for a storage file.");
    const storage = await lookup.storage(source.threadId);
    hostId = storage.hostId;
    root = storage.storageRootPath;
  } else if (source.kind === "host" && hostId) {
    // An explicit host file may belong to a different machine than the thread.
  } else {
    const thread = source.threadId
      ? await lookup.thread(source.threadId)
      : null;
    const environmentId = source.environmentId || thread?.environmentId;
    if (environmentId) {
      const env = await lookup.environment(environmentId);
      if (hostId && hostId !== env.hostId)
        throw new Error("The requested machine does not own this environment.");
      hostId = env.hostId;
      if (source.kind === "workspace") root = env.path;
    } else if (source.kind === "workspace") {
      const projectId = source.projectId || thread?.projectId;
      if (!projectId)
        throw new Error(
          "A project or environment is required for a workspace file.",
        );
      const { sources } = await lookup.project(projectId);
      const selected = hostId
        ? sources.find((s) => s.hostId === hostId)
        : sources.find((s) => s.isDefault) || sources[0];
      if (!selected)
        throw new Error("This project has no source on the requested machine.");
      hostId = selected.hostId;
      root = selected.path;
    }
    if (!hostId) hostId = await lookup.primaryHost();
  }
  if (!hostId) throw new Error("No file machine is available.");
  if (source.kind !== "host" && !root)
    throw new Error("The file source has no directory.");
  const target = await lookup.resolve(hostId, path, root);
  return { hostId, path: target.path };
}
