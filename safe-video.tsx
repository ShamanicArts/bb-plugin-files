import { useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";
import { Glyph } from "./icons";

type Info = { duration: number; audio: boolean; width: number; height: number };
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function bytes(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function SafeVideo({
  hostId,
  path,
  name,
  onNative,
}: {
  hostId: string;
  path: string;
  name: string;
  onNative: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [position, setPosition] = useState(0);
  const positionRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const displayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frames = useRef<{ bitmap: ImageBitmap; time: number }[]>([]);

  function stop() {
    generation.current++;
    if (displayTimer.current) clearTimeout(displayTimer.current);
    displayTimer.current = null;
    for (const frame of frames.current) frame.bitmap.close();
    frames.current = [];
    if (timer.current) clearTimeout(timer.current);
    if (seekTimer.current) clearTimeout(seekTimer.current);
    timer.current = null;
    const id = session.current;
    session.current = null;
    if (id) void rpc.call("videoStop", { hostId, id }).catch(() => {});
    const oldAudio = audio.current;
    audio.current = null;
    gain.current = null;
    if (oldAudio && oldAudio.state !== "closed")
      void oldAudio.close().catch(() => {});
  }
  async function draw(jpeg: string, token: number) {
    const bitmap = await createImageBitmap(
      new Blob([bytes(jpeg)], { type: "image/jpeg" }),
    );
    try {
      if (generation.current !== token || !canvas.current) return;
      const c = canvas.current;
      if (c.width !== bitmap.width || c.height !== bitmap.height) {
        c.width = bitmap.width;
        c.height = bitmap.height;
      }
      c.getContext("2d", { alpha: false })?.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }
  }
  useEffect(() => {
    stop();
    const token = generation.current;
    setLoading(true);
    setError("");
    setInfo(null);
    setPlaying(false);
    playingRef.current = false;
    positionRef.current = 0;
    setPosition(0);
    Promise.all([
      rpc.call("videoInfo", { hostId, path }),
      rpc.call("videoPoster", { hostId, path, time: 0 }),
    ])
      .then(async ([meta, poster]) => {
        if (generation.current !== token) return;
        setInfo(meta);
        await draw(poster.jpeg, token);
        if (generation.current === token) setLoading(false);
      })
      .catch((e) => {
        if (generation.current === token) {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
    return stop;
  }, [hostId, path, rpc, revision]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden && playingRef.current) {
        stop();
        playingRef.current = false;
        setPlaying(false);
        setLoading(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [hostId, rpc]);

  async function play(time = positionRef.current) {
    if (!info) return;
    stop();
    const token = generation.current;
    playingRef.current = true;
    setPlaying(true);
    setLoading(true);
    setError("");
    if (time >= info.duration - 0.03) time = 0;
    positionRef.current = time;
    setPosition(time);
    let audioAnchor: number | null = null;
    let wallAnchor: number | null = null;
    const mediaTime = () =>
      audio.current && audioAnchor !== null
        ? audio.current.currentTime - audioAnchor
        : wallAnchor !== null
          ? performance.now() / 1000 - wallAnchor
          : time;
    const display = () => {
      if (generation.current !== token) return;
      let due: { bitmap: ImageBitmap; time: number } | undefined;
      while (
        frames.current.length &&
        frames.current[0].time <= mediaTime() + 0.01
      ) {
        due?.bitmap.close();
        due = frames.current.shift();
      }
      if (due) {
        const c = canvas.current;
        if (c) {
          if (c.width !== due.bitmap.width || c.height !== due.bitmap.height) {
            c.width = due.bitmap.width;
            c.height = due.bitmap.height;
          }
          c.getContext("2d", { alpha: false })?.drawImage(due.bitmap, 0, 0);
          positionRef.current = Math.min(info.duration, due.time);
          setPosition(positionRef.current);
          setLoading(false);
        }
        due.bitmap.close();
      }
      displayTimer.current = setTimeout(display, 16);
    };
    let lastFrame = performance.now();
    try {
      if (info.audio) {
        const context = new AudioContext({ sampleRate: 48000 });
        audio.current = context;
        const node = context.createGain();
        gain.current = node;
        node.gain.value = volumeRef.current;
        node.connect(context.destination);
        await context.resume();
        if (generation.current !== token) return;
      }
      const started = await rpc.call("videoStart", { hostId, path, time });
      if (generation.current !== token) {
        void rpc.call("videoStop", { hostId, id: started.id }).catch(() => {});
        return;
      }
      session.current = started.id;
      const poll = async () => {
        if (generation.current !== token) return;
        const batch = await rpc.call("videoPoll", { hostId, id: started.id });
        if (generation.current !== token) return;
        if (batch.jpeg) {
          const bitmap = await createImageBitmap(
            new Blob([bytes(batch.jpeg)], { type: "image/jpeg" }),
          );
          if (generation.current !== token) {
            bitmap.close();
            return;
          }
          lastFrame = performance.now();
          if (wallAnchor === null)
            wallAnchor = performance.now() / 1000 + 0.08 - batch.time;
          frames.current.push({ bitmap, time: batch.time });
          while (frames.current.length > 10)
            frames.current.shift()!.bitmap.close();
        }
        const context = audio.current,
          node = gain.current;
        if (batch.pcm && context && node) {
          const raw = bytes(batch.pcm);
          const view = new DataView(raw.buffer);
          const count = raw.byteLength / 8;
          const buffer = context.createBuffer(2, count, 48000);
          for (let ch = 0; ch < 2; ch++) {
            const channel = buffer.getChannelData(ch);
            for (let i = 0; i < count; i++)
              channel[i] = view.getFloat32(i * 8 + ch * 4, true);
          }
          // Maintain one media clock across packets; don't accumulate gaps per poll.
          if (audioAnchor === null)
            audioAnchor = context.currentTime + 0.08 - batch.audioTime;
          let when = audioAnchor + batch.audioTime;
          if (when < context.currentTime - 0.15) {
            audioAnchor = context.currentTime + 0.08 - batch.audioTime;
            when = audioAnchor + batch.audioTime;
          }
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(node);
          source.onended = () => source.disconnect();
          source.start(Math.max(context.currentTime, when));
        }
        if (displayTimer.current === null) display();
        if (batch.done) {
          session.current = null;
          const delay = Math.max(0, (info.duration - mediaTime()) * 1000);
          timer.current = setTimeout(
            () => {
              if (generation.current !== token) return;
              stop();
              positionRef.current = info.duration;
              setPosition(info.duration);
              playingRef.current = false;
              setPlaying(false);
              setLoading(false);
            },
            Math.min(delay, 2000),
          );
          return;
        }
        if (performance.now() - lastFrame > 15000)
          throw new Error(
            "Playback stalled. Retry to reconnect to this machine.",
          );
        timer.current = setTimeout(() => {
          void poll().catch(failed);
        }, 45);
      };
      function failed(e: unknown) {
        if (generation.current !== token) return;
        stop();
        playingRef.current = false;
        setPlaying(false);
        setLoading(false);
        setError(e instanceof Error ? e.message : String(e));
      }
      await poll().catch(failed);
    } catch (e) {
      if (generation.current !== token) return;
      stop();
      playingRef.current = false;
      setPlaying(false);
      setLoading(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function pause() {
    stop();
    playingRef.current = false;
    setPlaying(false);
    setLoading(false);
  }
  function seek(time: number) {
    const resume = playingRef.current;
    stop();
    const token = generation.current;
    positionRef.current = time;
    setPosition(time);
    setLoading(true);
    setError("");
    seekTimer.current = setTimeout(() => {
      if (resume) void play(time);
      else
        rpc
          .call("videoPoster", {
            hostId,
            path,
            time: Math.max(0, Math.min(time, (info?.duration ?? time) - 0.05)),
          })
          .then(async (poster) => {
            if (generation.current !== token) return;
            await draw(poster.jpeg, token);
            if (generation.current === token) setLoading(false);
          })
          .catch((e) => {
            if (generation.current === token) {
              setError(String(e.message || e));
              setLoading(false);
            }
          });
    }, 180);
  }
  return (
    <div
      className="ff-safe-video"
      data-playing={playing}
      data-time={position}
      aria-label={`Video player for ${name}`}
    >
      <div className="ff-video-stage">
        <canvas ref={canvas} aria-label={name} role="img" />
        {loading && (
          <div className="ff-video-progress" role="status">
            {info ? "Buffering…" : "Preparing video…"}
          </div>
        )}
        {!playing && !loading && info && !error && (
          <button
            className="ff-video-play-overlay"
            aria-label="Play video"
            onClick={() => void play()}
          >
            <Glyph name="play" size={30} />
          </button>
        )}
      </div>
      <div className="ff-video-controls">
        <button
          className="ff-tool"
          aria-label={playing ? "Pause video" : "Play video"}
          disabled={!info}
          onClick={() => (playing ? pause() : void play())}
        >
          <Glyph name={playing ? "pause" : "play"} />
        </button>
        <span className="ff-video-clock">
          {clock(position)} / {clock(info?.duration ?? 0)}
        </span>
        <input
          type="range"
          aria-label="Video position"
          min="0"
          max={info?.duration ?? 1}
          step="0.05"
          value={position}
          disabled={!info}
          onChange={(e) => seek(Number(e.target.value))}
        />
        {info?.audio && (
          <input
            className="ff-video-volume"
            type="range"
            aria-label="Video volume"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              volumeRef.current = v;
              if (gain.current) gain.current.gain.value = v;
            }}
          />
        )}
      </div>
      <div className="ff-video-mode">
        <span>
          Compatibility playback{info && !info.audio ? " · No audio track" : ""}
        </span>
        <button onClick={onNative} title="Uses BB’s browser video decoder">
          Use native player
        </button>
      </div>
      {error && (
        <div className="ff-media-error" role="alert">
          <p>{error}</p>
          <button
            onClick={() => (info ? void play() : setRevision((r) => r + 1))}
          >
            Retry playback
          </button>
        </div>
      )}
    </div>
  );
}
