import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract } from "./contract";
import { listDirectory, readText, mediaInfo, readChunk } from "./filesystem";
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    list: (input, context) => listDirectory(input, context.signal),
    info: ({ path }) => mediaInfo(path),
    chunk: (input, context) => readChunk(input, context.signal),
    text: ({ path }) => readText(path),
  },
});
