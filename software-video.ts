import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolvePath, mediaInfo } from "./filesystem";
import type { Readable } from "node:stream";

export const VIDEO_FPS = 24;
export const AUDIO_RATE = 48000;
const MAX_JPEG = 1024 * 1024;
const MAX_AUDIO = AUDIO_RATE * 2 * 4 * 2;
const scale =
  "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
const inputOptions = ["-protocol_whitelist", "file,pipe", "-threads", "2"];
const ffmpegOptions = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-filter_threads",
  "1",
];

// A subprocess owns the video decoder. BB only receives JPEGs and raw PCM.
let captures = 0;
function capture(
  command: string,
  args: string[],
  signal?: AbortSignal,
  limit = MAX_JPEG,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Preview cancelled"));
    if (captures >= 4)
      return reject(new Error("Video preparation is busy. Retry in a moment."));
    captures++;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0,
      stderr = "",
      failure: Error | undefined;
    const stop = (message: string) => {
      failure ||= new Error(message);
      child.kill("SIGKILL");
    };
    const abort = () => stop("Preview cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop("Video preparation timed out."), 15000);
    child.stdout.on("data", (b: Buffer) => {
      size += b.length;
      if (size > limit) stop("Video preview exceeded its output limit.");
      else chunks.push(b);
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr = (stderr + b.toString()).slice(-2000);
    });
    child.on("error", () => {
      failure = new Error(
        `Compatibility playback requires ${command} on this machine.`,
      );
    });
    child.on("close", (code) => {
      captures--;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure || code !== 0)
        reject(
          failure || new Error(`Could not decode this video. ${stderr.trim()}`),
        );
      else resolve(Buffer.concat(chunks));
    });
  });
}
export async function inspectVideo(path: string, signal?: AbortSignal) {
  path = resolvePath(path);
  const file = await mediaInfo(path);
  const raw = await capture(
    "ffprobe",
    [
      "-v",
      "error",
      ...inputOptions,
      "-show_entries",
      "stream=codec_type,width,height:format=duration",
      "-of",
      "json",
      path,
    ],
    signal,
    65536,
  );
  const info = JSON.parse(raw.toString());
  const video = info.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  const duration = Number(info.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0)
    throw new Error("This file has no seekable video stream.");
  return {
    duration,
    width: Number(video.width),
    height: Number(video.height),
    audio: info.streams.some(
      (s: { codec_type: string }) => s.codec_type === "audio",
    ),
    identity: file.identity,
  };
}
export async function videoPoster(
  path: string,
  time: number,
  signal?: AbortSignal,
) {
  path = resolvePath(path);
  await mediaInfo(path);
  const frame = await capture(
    "ffmpeg",
    [
      ...ffmpegOptions,
      ...inputOptions,
      "-ss",
      String(time),
      "-i",
      path,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-an",
      "-vf",
      scale,
      "-c:v",
      "mjpeg",
      "-threads",
      "2",
      "-q:v",
      "4",
      "-f",
      "image2pipe",
      "pipe:1",
    ],
    signal,
  );
  if (!frame.length) throw new Error("No frame at this position.");
  return { jpeg: frame.toString("base64") };
}

type Session = {
  child: ChildProcess;
  jpeg: Buffer | null;
  frameTime: number;
  pending: Buffer;
  audio: Buffer;
  audioSamples: number;
  start: number;
  frames: number;
  done: boolean;
  error: string;
  touched: number;
  release: () => void;
};
export function createVideoDecoder(
  options: { idleMs?: number; maxSessions?: number } = {},
) {
  const sessions = new Map<string, Session>();
  const idleMs = options.idleMs ?? 10000;
  const maxSessions = options.maxSessions ?? 4;
  let starting = 0,
    disposed = false;
  const pendingStarts = new Set<AbortController>();
  function stop(id: string) {
    const s = sessions.get(id);
    if (s) {
      sessions.delete(id);
      s.child.kill("SIGKILL");
      s.release();
    }
    return { stopped: true };
  }
  const reaper = setInterval(
    () => {
      for (const [id, s] of sessions)
        if (Date.now() - s.touched > idleMs) stop(id);
    },
    Math.min(1000, idleMs),
  );
  reaper.unref();
  async function start(
    path: string,
    time: number,
    signal?: AbortSignal,
    retain?: () => { dispose(): Promise<void> },
  ) {
    if (disposed) throw new Error("Video decoder is closed.");
    if (sessions.size + starting >= maxSessions)
      throw new Error("Close another video before starting playback.");
    if (!Number.isFinite(time) || time < 0)
      throw new Error("Invalid video position.");
    starting++;
    const controller = new AbortController();
    pendingStarts.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      path = resolvePath(path);
      const info = await inspectVideo(path, controller.signal);
      if (time >= info.duration)
        throw new Error("Position is beyond the end of the video.");
      if (controller.signal.aborted || disposed)
        throw new Error("Video start cancelled.");
      const args = [
        ...ffmpegOptions,
        "-readrate",
        "1",
        ...inputOptions,
        "-ss",
        String(time),
        "-i",
        path,
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `${scale},fps=${VIDEO_FPS}`,
        "-c:v",
        "mjpeg",
        "-threads",
        "2",
        "-q:v",
        "4",
        "-f",
        "image2pipe",
        "pipe:3",
      ];
      if (info.audio)
        args.push(
          "-map",
          "0:a:0",
          "-vn",
          "-ac",
          "2",
          "-ar",
          String(AUDIO_RATE),
          "-c:a",
          "pcm_f32le",
          "-f",
          "f32le",
          "pipe:4",
        );
      const lease = retain?.();
      const child = spawn("ffmpeg", args, {
        stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const id = randomUUID();
      const s: Session = {
        child,
        jpeg: null,
        frameTime: time,
        pending: Buffer.alloc(0),
        audio: Buffer.alloc(0),
        audioSamples: 0,
        start: time,
        frames: 0,
        done: false,
        error: "",
        touched: Date.now(),
        release: () => {
          void lease?.dispose().catch(() => {});
        },
      };
      sessions.set(id, s);
      const fail = (message: string) => {
        s.error = message;
        child.kill("SIGKILL");
      };
      (child.stdio[3] as Readable).on("data", (b: Buffer) => {
        s.pending = Buffer.concat([s.pending, b]);
        let end: number;
        while ((end = s.pending.indexOf(Buffer.from([0xff, 0xd9]))) !== -1) {
          const frame = s.pending.subarray(0, end + 2);
          s.pending = s.pending.subarray(end + 2);
          if (frame.length > MAX_JPEG) {
            fail("Video frame exceeded the preview limit.");
            break;
          }
          s.jpeg = frame;
          s.frameTime = s.start + s.frames++ / VIDEO_FPS;
        }
        if (s.pending.length > MAX_JPEG)
          fail("Video frame exceeded the preview limit.");
      });
      (child.stdio[4] as Readable).on("data", (b: Buffer) => {
        if (s.audio.length + b.length > MAX_AUDIO)
          fail("The connection cannot keep up with audio. Retry playback.");
        else s.audio = Buffer.concat([s.audio, b]);
      });
      let stderr = "";
      child.stderr!.on("data", (b: Buffer) => {
        stderr = (stderr + b.toString()).slice(-1000);
      });
      child.on("error", () => {
        s.error = "Compatibility playback requires ffmpeg on this machine.";
      });
      child.on("close", (code) => {
        s.done = true;
        if (code && !s.error)
          s.error = `Video decoding stopped. ${stderr.trim()}`;
      });
      return { id, ...info };
    } finally {
      starting--;
      pendingStarts.delete(controller);
      signal?.removeEventListener("abort", abort);
    }
  }
  function poll(id: string) {
    const s = sessions.get(id);
    if (!s) throw new Error("Playback expired. Press Play to restart.");
    s.touched = Date.now();
    if (s.error) {
      stop(id);
      throw new Error(s.error);
    }
    // Every reply stays below ~2 MiB, independent of video size or duration.
    const length = Math.min(s.audio.length - (s.audio.length % 8), 262144);
    const audio = s.audio.subarray(0, length);
    s.audio = s.audio.subarray(length);
    const result = {
      jpeg: s.jpeg?.toString("base64") ?? null,
      time: s.frameTime,
      pcm: audio.toString("base64"),
      audioTime: s.start + s.audioSamples / AUDIO_RATE,
      done: s.done && s.audio.length === 0,
    };
    s.jpeg = null;
    s.audioSamples += length / 8;
    if (result.done) stop(id);
    return result;
  }
  function dispose() {
    disposed = true;
    clearInterval(reaper);
    for (const c of pendingStarts) c.abort();
    for (const id of sessions.keys()) stop(id);
  }
  return {
    start,
    poll,
    stop,
    dispose,
    get size() {
      return sessions.size;
    },
  };
}
