import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
export const pathSchema = z
  .string()
  .min(1)
  .max(32768)
  .refine((p) => !p.includes("\0"), "Invalid path");
export const entrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(["directory", "file", "other"]),
  size: z.number(),
  modified: z.number(),
  symlink: z.boolean(),
});
export type Entry = z.infer<typeof entrySchema>;
export const listingSchema = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  home: z.string(),
  entries: z.array(entrySchema),
  truncated: z.boolean(),
  selected: entrySchema.nullable(),
});
export type Listing = z.infer<typeof listingSchema>;
export const mediaInfoSchema = z.object({
  size: z.number().int().nonnegative(),
  modified: z.number(),
  identity: z.string(),
});
export const hostContract = defineRpcContract({
  list: {
    input: z.object({ path: pathSchema, base: z.string().optional() }),
    output: listingSchema,
  },
  info: { input: z.object({ path: pathSchema }), output: mediaInfoSchema },
  chunk: {
    input: z.object({
      path: pathSchema,
      offset: z.number().int().nonnegative(),
      length: z.number().int().min(1).max(262144),
      identity: z.string(),
    }),
    output: z.object({ data: z.string() }),
  },
  text: {
    input: z.object({ path: pathSchema }),
    output: z.object({
      content: z.string(),
      truncated: z.boolean(),
      binary: z.boolean(),
      size: z.number(),
    }),
  },
});
export const rpcContract = defineRpcContract({
  context: {
    input: z.object({
      threadId: z.string().nullable(),
      projectId: z.string().nullable(),
    }),
    output: z.object({
      hostId: z.string(),
      path: z.string(),
      projectPath: z.string().nullable(),
      projectHostId: z.string().nullable(),
      hosts: z.array(
        z.object({ id: z.string(), name: z.string(), connected: z.boolean() }),
      ),
    }),
  },
  list: {
    input: hostContract.list.input.extend({ hostId: z.string().min(1) }),
    output: listingSchema,
  },
  text: {
    input: hostContract.text.input.extend({ hostId: z.string().min(1) }),
    output: hostContract.text.output,
  },
  media: {
    input: z.object({ hostId: z.string().min(1), path: pathSchema }),
    output: z.object({ url: z.string(), expiresAtMs: z.number() }),
  },
  preview: {
    input: z.object({ hostId: z.string().min(1), path: pathSchema }),
    output: z.object({ baseUrl: z.string(), expiresAtMs: z.number() }),
  },
});
