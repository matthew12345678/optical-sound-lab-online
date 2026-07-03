import { useCallback, useEffect, useRef, useState } from "react";

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function quantizeFreq(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const snapped = Math.round(midi);
  return 440 * 2 ** ((snapped - 69) / 12);
}

const MIN_LINE_SPAN = 0.04;
const HANDLE_HIT_PX = 16;
const LINE_HIT_PX = 10;

function clampLineSpan(start, end) {
  let a = Math.max(0, Math.min(1, start));
  let b = Math.max(0, Math.min(1, end));
  if (b - a < MIN_LINE_SPAN) {
    const mid = (a + b) / 2;
    a = Math.max(0, mid - MIN_LINE_SPAN / 2);
    b = Math.min(1, mid + MIN_LINE_SPAN / 2);
  }
  return [a, b];
}

function extractHorizontalScan(imageData, scanPos, lineStart, lineEnd, invert) {
  const { width, height, data } = imageData;
  const row = Math.min(height - 1, Math.floor(scanPos * (height - 1)));
  const [a, b] = clampLineSpan(lineStart, lineEnd);
  const x0 = Math.floor(a * (width - 1));
  const x1 = Math.floor(b * (width - 1));
  const len = Math.max(1, x1 - x0 + 1);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const x = x0 + i;
    const idx = (row * width + x) * 4;
    let v = luminance(data[idx], data[idx + 1], data[idx + 2]);
    if (invert) v = 255 - v;
    out[i] = v;
  }
  return out;
}

function extractVerticalScan(imageData, scanPos, lineStart, lineEnd, invert) {
  const { width, height, data } = imageData;
  const col = Math.min(width - 1, Math.floor(scanPos * (width - 1)));
  const [a, b] = clampLineSpan(lineStart, lineEnd);
  const y0 = Math.floor(a * (height - 1));
  const y1 = Math.floor(b * (height - 1));
  const len = Math.max(1, y1 - y0 + 1);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const y = y0 + i;
    const idx = (y * width + col) * 4;
    let v = luminance(data[idx], data[idx + 1], data[idx + 2]);
    if (invert) v = 255 - v;
    out[i] = v;
  }
  return out;
}

function drawScanLineSegment(ctx, w, h, p) {
  const vertical = p.mode === "vertical";
  const lineColor = "rgba(239, 68, 68, 0.95)";
  const handleFill = "#ef4444";
  const handleStroke = "#ffffff";

  let x0;
  let y0;
  let x1;
  let y1;
  let hx0;
  let hy0;
  let hx1;
  let hy1;

  if (vertical) {
    const x = p.scanPos * w;
    y0 = p.lineStart * h;
    y1 = p.lineEnd * h;
    x0 = x1 = x;
    hx0 = hx1 = x;
    hy0 = y0;
    hy1 = y1;
  } else {
    const y = p.scanPos * h;
    x0 = p.lineStart * w;
    x1 = p.lineEnd * w;
    y0 = y1 = y;
    hx0 = x0;
    hx1 = x1;
    hy0 = hy1 = y;
  }

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  const r = 7;
  for (const [hx, hy] of [
    [hx0, hy0],
    [hx1, hy1],
  ]) {
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fillStyle = handleFill;
    ctx.fill();
    ctx.strokeStyle = handleStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function hitTestScanLine(px, py, w, h, p) {
  const vertical = p.mode === "vertical";

  if (vertical) {
    const x = p.scanPos * w;
    const y0 = p.lineStart * h;
    const y1 = p.lineEnd * h;
    const ya = Math.min(y0, y1);
    const yb = Math.max(y0, y1);

    if (Math.hypot(px - x, py - y0) <= HANDLE_HIT_PX) return "start";
    if (Math.hypot(px - x, py - y1) <= HANDLE_HIT_PX) return "end";
    if (Math.abs(px - x) <= LINE_HIT_PX && py >= ya - LINE_HIT_PX && py <= yb + LINE_HIT_PX) {
      return "move";
    }
  } else {
    const y = p.scanPos * h;
    const x0 = p.lineStart * w;
    const x1 = p.lineEnd * w;
    const xa = Math.min(x0, x1);
    const xb = Math.max(x0, x1);

    if (Math.hypot(px - x0, py - y) <= HANDLE_HIT_PX) return "start";
    if (Math.hypot(px - x1, py - y) <= HANDLE_HIT_PX) return "end";
    if (Math.abs(py - y) <= LINE_HIT_PX && px >= xa - LINE_HIT_PX && px <= xb + LINE_HIT_PX) {
      return "move";
    }
  }

  return null;
}

function averageScan(scan) {
  let sum = 0;
  for (let i = 0; i < scan.length; i++) sum += scan[i];
  return scan.length ? sum / scan.length : 0;
}

function edgeStrength(imageData, threshold) {
  const { width, height, data } = imageData;
  let total = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const c = luminance(data[i], data[i + 1], data[i + 2]);
      const rx = luminance(
        data[((y * width + x + 1) * 4)],
        data[((y * width + x + 1) * 4) + 1],
        data[((y * width + x + 1) * 4) + 2],
      );
      const dy = luminance(
        data[(((y + 1) * width + x) * 4)],
        data[(((y + 1) * width + x) * 4) + 1],
        data[(((y + 1) * width + x) * 4) + 2],
      );
      const g = Math.abs(c - rx) + Math.abs(c - dy);
      if (g > threshold) {
        total += g;
        count++;
      }
    }
  }
  return count ? total / count : 0;
}

function channelAverage(imageData, channel) {
  const { width, height, data } = imageData;
  let sum = 0;
  const step = Math.max(1, Math.floor((width * height) / 8000));
  let n = 0;
  for (let i = channel; i < data.length; i += 4 * step) {
    sum += data[i];
    n++;
  }
  return n ? sum / n : 0;
}

function filmGrainLevel(imageData) {
  const { width, height, data } = imageData;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const step = 4;
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = (y * width + x) * 4;
      const c = luminance(data[i], data[i + 1], data[i + 2]);
      const n1 = luminance(
        data[((y * width + x + 1) * 4)],
        data[((y * width + x + 1) * 4) + 1],
        data[((y * width + x + 1) * 4) + 2],
      );
      const diff = Math.abs(c - n1);
      sum += diff;
      sumSq += diff * diff;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return Math.sqrt(Math.max(0, variance));
}

function barcodeTransitions(scan, threshold) {
  let transitions = 0;
  let prev = scan[0] > threshold ? 1 : 0;
  for (let i = 1; i < scan.length; i++) {
    const bit = scan[i] > threshold ? 1 : 0;
    if (bit !== prev) transitions++;
    prev = bit;
  }
  return transitions;
}

function scanToPeriodicWave(audioCtx, scan, sensitivity) {
  const n = Math.min(2048, scan.length);
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * scan.length);
    real[i] = ((scan[idx] / 255) * 2 - 1) * Math.min(2, sensitivity);
  }
  return audioCtx.createPeriodicWave(real, imag, { disableNormalization: false });
}

const RECORD_W = 160;
const RECORD_H = 120;
const RECORD_FPS = 24;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pickRecorderMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8,vorbis",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function drawScanWaveform(ctx, scan, width, height) {
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const idx = Math.floor((x / width) * scan.length);
    const y = height - (scan[idx] / 255) * (height - 8) - 4;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export default function OpticalFilmSoundLab() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const scanCanvasRef = useRef(null);
  const captureRef = useRef(null);
  const audioRef = useRef(null);
  const nodesRef = useRef(null);
  const rafRef = useRef(null);
  const frozenScanRef = useRef(null);
  const lastGranularRef = useRef(0);
  const imageRef = useRef(null);
  const playingRef = useRef(false);
  const hasMediaRef = useRef(false);
  const recordCanvasRef = useRef(null);
  const recordingRef = useRef({ active: false, recorder: null, chunks: [] });
  const scrubbingRef = useRef(false);
  const lineDragRef = useRef(null);
  const overlaySizeRef = useRef({ w: 1, h: 1 });

  const paramsRef = useRef({
    mode: "scanline",
    scanPos: 0.5,
    lineStart: 0,
    lineEnd: 1,
    freq: 440,
    sensitivity: 1,
    speed: 1,
    threshold: 100,
    volume: 0.5,
    invert: false,
    freeze: false,
    feedback: false,
    quantize: false,
  });

  const patchParams = (patch) => {
    paramsRef.current = { ...paramsRef.current, ...patch };
  };

  const [mode, setMode] = useState("scanline");
  const [scanPos, setScanPos] = useState(0.5);
  const [lineStart, setLineStart] = useState(0);
  const [lineEnd, setLineEnd] = useState(1);
  const [freq, setFreq] = useState(440);
  const [sensitivity, setSensitivity] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [threshold, setThreshold] = useState(100);
  const [volume, setVolume] = useState(0.5);
  const [invert, setInvert] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [quantize, setQuantize] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [stillUrl, setStillUrl] = useState(null);
  const [status, setStatus] = useState("Load a film file to begin.");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [filmPos, setFilmPos] = useState(0);
  const [filmDuration, setFilmDuration] = useState(0);

  useEffect(() => {
    paramsRef.current = {
      mode,
      scanPos,
      lineStart,
      lineEnd,
      freq,
      sensitivity,
      speed,
      threshold,
      volume,
      invert,
      freeze,
      feedback,
      quantize,
    };
  }, [
    mode,
    scanPos,
    lineStart,
    lineEnd,
    freq,
    sensitivity,
    speed,
    threshold,
    volume,
    invert,
    freeze,
    feedback,
    quantize,
  ]);

  playingRef.current = playing;
  hasMediaRef.current = hasVideo;

  const ensureAudio = useCallback(async () => {
    if (audioRef.current) return audioRef.current;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = paramsRef.current.volume;

    const mainOsc = ctx.createOscillator();
    mainOsc.type = "sine";
    mainOsc.frequency.value = paramsRef.current.freq;
    const mainGain = ctx.createGain();
    mainGain.gain.value = 0;

    const oscR = ctx.createOscillator();
    const oscG = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const rgbGain = ctx.createGain();
    rgbGain.gain.value = 0;

    const noise = ctx.createBufferSource();
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.25;
    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0;

    mainOsc.connect(mainGain);
    oscR.connect(rgbGain);
    oscG.connect(rgbGain);
    oscB.connect(rgbGain);
    noise.connect(noiseGain);

    mainGain.connect(master);
    rgbGain.connect(master);
    noiseGain.connect(master);

    mainGain.connect(delay);
    rgbGain.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(master);

    const recordDest = ctx.createMediaStreamDestination();
    master.connect(ctx.destination);
    master.connect(recordDest);

    mainOsc.start();
    oscR.start();
    oscG.start();
    oscB.start();
    noise.start();

    audioRef.current = ctx;
    nodesRef.current = {
      master,
      mainOsc,
      mainGain,
      oscR,
      oscG,
      oscB,
      rgbGain,
      noise,
      noiseGain,
      delay,
      feedbackGain,
      recordDest,
    };
    return ctx;
  }, []);

  const setModeGains = useCallback((active) => {
    const n = nodesRef.current;
    if (!n) return;
    const { mode: m } = paramsRef.current;
    const scanModes = ["scanline", "vertical", "spectral", "barcode", "contours"];
    const rgbModes = ["rgb"];
    const brightModes = ["brightness", "edges", "granular"];
    const noiseModes = ["noise"];

    n.mainGain.gain.value =
      active && (scanModes.includes(m) || brightModes.includes(m)) ? 0.35 : 0;
    n.rgbGain.gain.value = active && rgbModes.includes(m) ? 0.25 : 0;
    n.noiseGain.gain.value = active && noiseModes.includes(m) ? 0.2 : 0;
  }, []);

  const getFrameSource = () => {
    const video = videoRef.current;
    const still = imageRef.current;
    if (still?.complete && still.naturalWidth) return still;
    if (video && video.readyState >= 2 && video.videoWidth > 0) return video;
    return null;
  };

  const captureFrame = () => {
    const capture = captureRef.current;
    const source = getFrameSource();
    if (!capture || !source) return null;

    const w = source.videoWidth || source.naturalWidth;
    const h = source.videoHeight || source.naturalHeight;
    if (!w || !h) return null;

    try {
      capture.width = w;
      capture.height = h;
      const ctx = capture.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h);
    } catch (err) {
      console.warn("Frame capture failed:", err);
      return null;
    }
  };

  const updateAudio = useCallback((imageData, scan) => {
    const ctx = audioRef.current;
    const n = nodesRef.current;
    if (!ctx || !n) return;

    const p = paramsRef.current;
    n.master.gain.value = p.volume;
    n.feedbackGain.gain.value = p.feedback ? 0.45 : 0;

    let baseFreq = p.freq + (averageScan(scan) / 255) * p.freq * p.sensitivity;
    if (p.quantize) baseFreq = quantizeFreq(baseFreq);

    const setMainWave = () => {
      try {
        const wave = scanToPeriodicWave(ctx, scan, p.sensitivity);
        n.mainOsc.setPeriodicWave(wave);
      } catch {
        n.mainOsc.type = "sine";
      }
    };

    switch (p.mode) {
      case "scanline":
      case "vertical":
        setMainWave();
        n.mainOsc.frequency.value = Math.max(40, baseFreq);
        break;
      case "spectral":
        n.mainOsc.type = "sawtooth";
        n.mainOsc.frequency.value = Math.max(40, baseFreq);
        break;
      case "brightness":
        n.mainOsc.type = "triangle";
        n.mainOsc.frequency.value = Math.max(
          40,
          Math.min(4000, 40 + (averageScan(scan) / 255) * p.freq * 4 * p.sensitivity),
        );
        break;
      case "rgb": {
        const r = channelAverage(imageData, 0);
        const g = channelAverage(imageData, 1);
        const b = channelAverage(imageData, 2);
        n.oscR.frequency.value = Math.max(40, 40 + (r / 255) * p.freq * 2);
        n.oscG.frequency.value = Math.max(40, 40 + (g / 255) * p.freq * 2);
        n.oscB.frequency.value = Math.max(40, 40 + (b / 255) * p.freq * 2);
        break;
      }
      case "edges": {
        const edges = edgeStrength(imageData, p.threshold);
        n.mainOsc.type = "square";
        n.mainOsc.frequency.value = Math.max(40, 40 + edges * p.sensitivity * 8);
        break;
      }
      case "barcode": {
        const t = barcodeTransitions(scan, p.threshold);
        n.mainOsc.type = "square";
        n.mainOsc.frequency.value = Math.max(40, Math.min(4000, t * 3 * p.sensitivity));
        break;
      }
      case "noise": {
        const grain = filmGrainLevel(imageData);
        n.noiseGain.gain.value = Math.min(0.5, (grain / 40) * p.sensitivity * p.volume);
        break;
      }
      case "contours": {
        const edges = edgeStrength(imageData, p.threshold);
        setMainWave();
        n.mainOsc.frequency.value = Math.max(40, 60 + edges * 12 * p.sensitivity);
        break;
      }
      case "granular": {
        n.mainOsc.type = "sine";
        const now = performance.now();
        if (now - lastGranularRef.current > 40) {
          lastGranularRef.current = now;
          const idx = Math.floor(Math.random() * scan.length);
          const f = 40 + (scan[idx] / 255) * p.freq * 6;
          n.mainOsc.frequency.setValueAtTime(f, ctx.currentTime);
        }
        break;
      }
      default:
        break;
    }
  }, []);

  const drawRecordFrame = (source) => {
    const canvas = recordCanvasRef.current;
    if (!canvas || !source) return;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, RECORD_W, RECORD_H);

    drawScanLineSegment(ctx, RECORD_W, RECORD_H, paramsRef.current);
  };

  const getOverlayLayout = () => {
    const overlay = overlayRef.current;
    const visual = overlay?.parentElement?.querySelector("img, video");
    const rect = visual?.getBoundingClientRect();
    if (!overlay || !rect?.width) return null;
    return { overlay, rect };
  };

  const applyLineParams = (patch) => {
    const next = { ...paramsRef.current, ...patch };
    if (patch.lineStart !== undefined || patch.lineEnd !== undefined) {
      const [a, b] = clampLineSpan(next.lineStart, next.lineEnd);
      next.lineStart = a;
      next.lineEnd = b;
    }
    paramsRef.current = next;
    if (patch.scanPos !== undefined) setScanPos(next.scanPos);
    if (patch.lineStart !== undefined || patch.lineEnd !== undefined) {
      setLineStart(next.lineStart);
      setLineEnd(next.lineEnd);
    }
  };

  const drawOverlay = () => {
    const layout = getOverlayLayout();
    if (!layout) return;

    const { overlay, rect } = layout;
    overlaySizeRef.current = { w: rect.width, h: rect.height };

    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.floor(rect.width * dpr);
    overlay.height = Math.floor(rect.height * dpr);

    const ctx = overlay.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawScanLineSegment(ctx, rect.width, rect.height, paramsRef.current);
  };

  const processFrame = () => {
    const scanCanvas = scanCanvasRef.current;
    if (!scanCanvas) return;

    const imageData = captureFrame();
    if (!imageData) return;

    const p = paramsRef.current;
    let scan =
      p.mode === "vertical"
        ? extractVerticalScan(imageData, p.scanPos, p.lineStart, p.lineEnd, p.invert)
        : extractHorizontalScan(imageData, p.scanPos, p.lineStart, p.lineEnd, p.invert);

    if (p.freeze && frozenScanRef.current) {
      scan = frozenScanRef.current;
    } else {
      frozenScanRef.current = scan;
    }

    if (playingRef.current && audioRef.current?.state === "running") {
      setModeGains(true);
      updateAudio(imageData, scan);
    }

    drawOverlay();

    const sctx = scanCanvas.getContext("2d");
    if (sctx) {
      drawScanWaveform(sctx, scan, scanCanvas.width, scanCanvas.height);
    }

    if (recordingRef.current.active) {
      const source = getFrameSource();
      if (source) drawRecordFrame(source);
    }
  };

  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      processFrame();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [setModeGains, updateAudio]);

  const onFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const video = videoRef.current;
    if (!video) return;

    const url = URL.createObjectURL(file);
    imageRef.current = null;
    setStillUrl(null);

    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setStillUrl(url);
        setHasVideo(true);
        setStatus(`Ready (still): ${file.name} (${img.naturalWidth}×${img.naturalHeight})`);
      };
      img.onerror = () => setStatus(`Failed to load image: ${file.name}`);
      img.src = url;
      return;
    }

    imageRef.current = null;
    video.src = url;
    video.load();
    setStatus(`Loaded: ${file.name}`);
    setHasVideo(true);

    video.onloadeddata = () => {
      video.pause();
      video.currentTime = 0;
      setFilmPos(0);
      setFilmDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setStatus(`Ready: ${file.name} (${video.videoWidth}×${video.videoHeight})`);
    };
  }, []);

  const seekFilm = useCallback((pos) => {
    const video = videoRef.current;
    if (!video?.duration || imageRef.current) return;
    const clamped = Math.max(0, Math.min(1, pos));
    setFilmPos(clamped);
    video.currentTime = clamped * video.duration;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || stillUrl) return;

    const syncDuration = () => {
      if (Number.isFinite(video.duration)) setFilmDuration(video.duration);
    };

    const onTimeUpdate = () => {
      if (scrubbingRef.current || !Number.isFinite(video.duration)) return;
      setFilmPos(video.currentTime / video.duration);
    };

    video.addEventListener("loadedmetadata", syncDuration);
    video.addEventListener("durationchange", syncDuration);
    video.addEventListener("timeupdate", onTimeUpdate);

    syncDuration();

    return () => {
      video.removeEventListener("loadedmetadata", syncDuration);
      video.removeEventListener("durationchange", syncDuration);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [stillUrl, hasVideo]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const pointerPos = (e) => {
      const layout = getOverlayLayout();
      if (!layout) return null;
      const { rect } = layout;
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
    };

    const onPointerDown = (e) => {
      if (!hasMediaRef.current) return;
      const pos = pointerPos(e);
      if (!pos) return;

      const hit = hitTestScanLine(pos.x, pos.y, pos.rect.width, pos.rect.height, paramsRef.current);
      if (!hit) return;

      e.preventDefault();
      overlay.setPointerCapture(e.pointerId);

      const p = paramsRef.current;
      lineDragRef.current = {
        mode: hit,
        pointerId: e.pointerId,
        startX: pos.x,
        startY: pos.y,
        startScanPos: p.scanPos,
        startLineStart: p.lineStart,
        startLineEnd: p.lineEnd,
        isVertical: p.mode === "vertical",
        rectW: pos.rect.width,
        rectH: pos.rect.height,
      };
    };

    const onPointerMove = (e) => {
      const drag = lineDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      const pos = pointerPos(e);
      if (!pos) return;

      const dx = (pos.x - drag.startX) / drag.rectW;
      const dy = (pos.y - drag.startY) / drag.rectH;

      if (drag.mode === "move") {
        if (drag.isVertical) {
          applyLineParams({
            scanPos: Math.max(0, Math.min(1, drag.startScanPos + dx)),
            lineStart: Math.max(0, Math.min(1, drag.startLineStart + dy)),
            lineEnd: Math.max(0, Math.min(1, drag.startLineEnd + dy)),
          });
        } else {
          applyLineParams({
            scanPos: Math.max(0, Math.min(1, drag.startScanPos + dy)),
            lineStart: Math.max(0, Math.min(1, drag.startLineStart + dx)),
            lineEnd: Math.max(0, Math.min(1, drag.startLineEnd + dx)),
          });
        }
        return;
      }

      if (drag.isVertical) {
        const next = pos.y / drag.rectH;
        if (drag.mode === "start") applyLineParams({ lineStart: next });
        else applyLineParams({ lineEnd: next });
      } else {
        const next = pos.x / drag.rectW;
        if (drag.mode === "start") applyLineParams({ lineStart: next });
        else applyLineParams({ lineEnd: next });
      }
    };

    const endDrag = (e) => {
      const drag = lineDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      lineDragRef.current = null;
      try {
        overlay.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", endDrag);
    overlay.addEventListener("pointercancel", endDrag);

    return () => {
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", endDrag);
      overlay.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  const play = useCallback(async () => {
    const video = videoRef.current;
    const still = imageRef.current;
    if (!hasMediaRef.current) {
      setStatus("Load a video or image file first.");
      return;
    }
    await ensureAudio();
    if (audioRef.current.state === "suspended") {
      await audioRef.current.resume();
    }
    setModeGains(true);
    if (still) {
      setPlaying(true);
      setStatus("Reading still image — optical reader active.");
      return;
    }
    video.playbackRate = paramsRef.current.speed;
    await video.play();
    setPlaying(true);
    setStatus("Playing — optical reader active.");
  }, [ensureAudio, setModeGains]);

  const pause = useCallback(() => {
    if (recordingRef.current.active) return;
    videoRef.current?.pause();
    setPlaying(false);
    setModeGains(false);
    setStatus("Paused.");
  }, [setModeGains]);

  const stopRecordingInternal = useCallback(() => {
    const rec = recordingRef.current;
    if (rec.timer) {
      clearInterval(rec.timer);
      rec.timer = null;
    }
    recordingRef.current = { active: false, recorder: null, chunks: [] };
    setIsRecording(false);
    setRecordSeconds(0);
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recordingRef.current;
    if (!rec.recorder || rec.recorder.state === "inactive") {
      stopRecordingInternal();
      return;
    }
    rec.recorder.stop();
  }, [stopRecordingInternal]);

  const stopAll = useCallback(() => {
    if (recordingRef.current.active) {
      stopRecording();
      return;
    }
    const video = videoRef.current;
    video?.pause();
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = 0;
      setFilmPos(0);
    }
    playingRef.current = false;
    setPlaying(false);
    setModeGains(false);
    setStatus("Stopped.");
  }, [setModeGains, stopRecording]);

  const startRecording = useCallback(async () => {
    if (!hasMediaRef.current) {
      setStatus("Load a video or image before recording.");
      return;
    }
    if (recordingRef.current.active) return;

    await ensureAudio();
    const ctx = audioRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    if (!playingRef.current) {
      const video = videoRef.current;
      const still = imageRef.current;
      setModeGains(true);
      playingRef.current = true;
      if (still) {
        setPlaying(true);
      } else if (video) {
        video.playbackRate = paramsRef.current.speed;
        await video.play();
        setPlaying(true);
      }
    }

    const canvas = recordCanvasRef.current;
    if (!canvas) return;
    canvas.width = RECORD_W;
    canvas.height = RECORD_H;

    const source = getFrameSource();
    if (source) drawRecordFrame(source);

    const videoStream = canvas.captureStream(RECORD_FPS);
    const recordDest = nodesRef.current?.recordDest;
    const audioTracks = recordDest?.stream.getAudioTracks() ?? [];
    if (!audioTracks.length) {
      setStatus("Recording failed: no audio track available.");
      return;
    }

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioTracks,
    ]);

    const mimeType = pickRecorderMimeType();
    const chunks = [];
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(combined, { mimeType })
        : new MediaRecorder(combined);
    } catch (err) {
      console.error(err);
      setStatus("Recording not supported in this browser.");
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `optical-film-${stamp}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      stopRecordingInternal();
      setStatus(`Recording saved (${RECORD_W}×${RECORD_H} video + synced audio).`);
    };

    recorder.onerror = () => {
      stopRecordingInternal();
      setStatus("Recording error — try again.");
    };

    recordingRef.current = {
      active: true,
      recorder,
      chunks,
      timer: setInterval(() => setRecordSeconds((s) => s + 1), 1000),
    };

    recorder.start(250);
    setIsRecording(true);
    setRecordSeconds(0);
    setStatus(`Recording ${RECORD_W}×${RECORD_H} @ ${RECORD_FPS}fps with synced audio…`);
  }, [ensureAudio, setModeGains, stopRecordingInternal]);

  useEffect(() => {
    const video = videoRef.current;
    if (video?.src) video.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (playing) setModeGains(true);
  }, [mode, playing, setModeGains]);

  useEffect(() => {
    const n = nodesRef.current;
    if (n && playing) n.master.gain.value = volume;
  }, [volume, playing]);

  useEffect(() => {
    return () => {
      if (recordingRef.current.recorder?.state === "recording") {
        recordingRef.current.recorder.stop();
      }
      if (recordingRef.current.timer) clearInterval(recordingRef.current.timer);
      nodesRef.current?.mainOsc?.stop();
      nodesRef.current?.oscR?.stop();
      nodesRef.current?.oscG?.stop();
      nodesRef.current?.oscB?.stop();
      nodesRef.current?.noise?.stop();
      audioRef.current?.close();
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-black text-white p-6 font-sans">
      <h1 className="text-4xl font-bold mb-4">Optical Film Sound Lab</h1>
      <p className="text-zinc-300 mb-2 max-w-3xl">
        Load a film/video file and convert the moving image into sound using multiple
        optical soundtrack techniques inspired by experimental cinema, scan synthesis,
        and vintage optical film readers.
      </p>
      <p className="text-sm text-zinc-500 mb-6">{status}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-zinc-800">
          <div className="flex flex-wrap gap-3 mb-4">
            <label className="bg-white text-black px-4 py-2 rounded-xl cursor-pointer hover:bg-zinc-200 transition">
              Load Film
              <input
                type="file"
                accept="video/*,image/*"
                className="hidden"
                onChange={onFile}
              />
            </label>

            <button
              type="button"
              onClick={play}
              className="bg-green-500 px-4 py-2 rounded-xl hover:bg-green-400 transition"
            >
              Play
            </button>

            <button
              type="button"
              onClick={pause}
              disabled={isRecording}
              className="bg-yellow-500 text-black px-4 py-2 rounded-xl hover:bg-yellow-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Pause
            </button>

            <button
              type="button"
              onClick={stopAll}
              className="bg-red-600 px-4 py-2 rounded-xl hover:bg-red-500 transition"
            >
              Stop
            </button>

            <button
              type="button"
              onClick={startRecording}
              disabled={!hasVideo || isRecording}
              className="bg-violet-600 px-4 py-2 rounded-xl hover:bg-violet-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Record
            </button>
          </div>

          {isRecording ? (
            <p className="text-xs text-amber-400 mb-3">
              Recording {recordSeconds}s — {RECORD_W}×{RECORD_H} preview + synced audio (press Stop)
            </p>
          ) : null}

          <div className="mb-3">
            <label className="block mb-1 text-sm text-zinc-400">
              Film Position ({formatTime(filmPos * filmDuration)} / {formatTime(filmDuration)})
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.0001}
              value={filmPos}
              disabled={!hasVideo || !!stillUrl || isRecording}
              onPointerDown={() => {
                scrubbingRef.current = true;
              }}
              onPointerUp={() => {
                scrubbingRef.current = false;
              }}
              onPointerCancel={() => {
                scrubbingRef.current = false;
              }}
              onChange={(e) => seekFilm(Number(e.target.value))}
              className="w-full disabled:opacity-40"
            />
          </div>

          <div className="relative bg-black rounded-2xl overflow-hidden border border-zinc-700">
            <video
              ref={videoRef}
              className={stillUrl ? "hidden" : "w-full block"}
              muted
              playsInline
              preload="auto"
            />
            {stillUrl ? (
              <img
                src={stillUrl}
                alt="Loaded still frame"
                className="w-full block"
              />
            ) : null}
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            />
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Drag the red line to move it; drag the end handles to shorten or lengthen it.
          </p>
          <div className="mt-4">
            <canvas
              ref={scanCanvasRef}
              width={1024}
              height={180}
              className="w-full h-44 bg-zinc-950 rounded-2xl border border-zinc-700"
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-zinc-800 overflow-y-auto max-h-[85vh]">
          <h2 className="text-2xl font-semibold mb-4">Optical Reader Modes</h2>

          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm text-zinc-400">Reading Mode</label>
              <select
                value={mode}
                onChange={(e) => {
                  const value = e.target.value;
                  patchParams({ mode: value });
                  setMode(value);
                }}
                className="w-full bg-zinc-800 rounded-xl p-3 border border-zinc-700"
              >
                <option value="scanline">Horizontal Scanline</option>
                <option value="vertical">Vertical Scanline</option>
                <option value="brightness">Brightness Oscillator</option>
                <option value="rgb">RGB Triple Oscillator</option>
                <option value="edges">Edge Detector</option>
                <option value="granular">Granular Film Scrub</option>
                <option value="spectral">Spectral Frame Synth</option>
                <option value="barcode">Barcode Reader</option>
                <option value="noise">Film Grain Noise</option>
                <option value="contours">Contour Sonification</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Scan Position ({scanPos.toFixed(3)})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={scanPos}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchParams({ scanPos: value });
                }}
                className="w-full"
                disabled={!hasVideo}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Line Start ({lineStart.toFixed(3)})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={lineStart}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  applyLineParams({ lineStart: value });
                }}
                className="w-full"
                disabled={!hasVideo}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Line End ({lineEnd.toFixed(3)})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={lineEnd}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  applyLineParams({ lineEnd: value });
                }}
                className="w-full"
                disabled={!hasVideo}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Frequency Range ({freq} Hz)
              </label>
              <input
                type="range"
                min={40}
                max={4000}
                step={1}
                value={freq}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchParams({ freq: value });
                  setFreq(value);
                }}
                className="w-full"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Sensitivity ({sensitivity.toFixed(2)})
              </label>
              <input
                type="range"
                min={0}
                max={5}
                step={0.01}
                value={sensitivity}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchParams({ sensitivity: value });
                  setSensitivity(value);
                }}
                className="w-full"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Playback Speed ({speed.toFixed(2)}×)
              </label>
              <input
                type="range"
                min={0.1}
                max={4}
                step={0.01}
                value={speed}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchParams({ speed: value });
                  setSpeed(value);
                }}
                className="w-full"
                disabled={!hasVideo}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Threshold ({threshold})
              </label>
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={threshold}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchParams({ threshold: value });
                  setThreshold(value);
                }}
                className="w-full"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm text-zinc-400">
                Audio Volume ({volume.toFixed(2)})
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={volume}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchParams({ volume: value });
                  setVolume(value);
                }}
                className="w-full"
              />
            </div>

            <div className="border-t border-zinc-700 pt-4">
              <h3 className="text-lg font-semibold mb-2">Experimental Options</h3>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={invert}
                    onChange={(e) => {
                      const value = e.target.checked;
                      patchParams({ invert: value });
                      setInvert(value);
                    }}
                  />
                  Invert Brightness
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={freeze}
                    onChange={(e) => {
                      const value = e.target.checked;
                      patchParams({ freeze: value });
                      setFreeze(value);
                    }}
                  />
                  Freeze Frame Sound
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={feedback}
                    onChange={(e) => {
                      const value = e.target.checked;
                      patchParams({ feedback: value });
                      setFeedback(value);
                    }}
                  />
                  Audio Feedback
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={quantize}
                    onChange={(e) => {
                      const value = e.target.checked;
                      patchParams({ quantize: value });
                      setQuantize(value);
                    }}
                  />
                  Quantize Frequencies
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 text-sm text-zinc-400 leading-relaxed">
            <p>
              This app turns moving film images into sound using optical scanning
              techniques inspired by optical film soundtracks, scan synthesis,
              photoelectric readers, and image sonification.
            </p>
          </div>
        </div>
      </div>

      <canvas ref={captureRef} className="hidden" aria-hidden />
      <canvas
        ref={recordCanvasRef}
        width={RECORD_W}
        height={RECORD_H}
        className="hidden"
        aria-hidden
      />
    </div>
  );
}
