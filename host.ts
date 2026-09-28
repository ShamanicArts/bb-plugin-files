import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract } from "./contract";
import { listDirectory, readText, mediaInfo, readChunk } from "./filesystem";
import {
  createVideoDecoder,
  inspectVideo,
  videoPoster,
} from "./software-video";
const video = createVideoDecoder();
export default experimental_defineHostEntry({
  contract: hostContract,
  dispose: () => video.dispose(),
  handlers: {
    videoInfo: ({ path }, ctx) => inspectVideo(path, ctx.signal),
    videoPoster: ({ path, time }, ctx) => videoPoster(path, time, ctx.signal),
    videoStart: ({ path, time }, ctx) =>
      video.start(path, time, ctx.signal, () =>
        ctx.experimental_retainWorker(),
      ),
    videoPoll: ({ id }) => video.poll(id),
    videoStop: ({ id }) => video.stop(id),
    list: (input, context) => listDirectory(input, context.signal),
    info: ({ path }) => mediaInfo(path),
    chunk: (input, context) => readChunk(input, context.signal),
    text: ({ path }) => readText(path),
  },
});
