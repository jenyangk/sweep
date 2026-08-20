import { parseQrContent, type ParsedQr } from "./parse-qr";

// Scan engine: camera (continuous), image file, base64 image.
// jsqr is dynamically imported so it stays out of the initial bundle.

export type ScanStatus = "idle" | "starting" | "scanning" | "error";

export interface ScanHandle {
  stop: () => void;
}

let lastScanText = "";
let lastScanTime = 0;
const DEDUP_MS = 1500;

function resetDedup(): void {
  lastScanText = "";
  lastScanTime = 0;
}

async function decodeFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const result = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  return result?.data ?? null;
}

export async function startCamera(
  video: HTMLVideoElement,
  onScan: (text: string, parsed: ParsedQr) => void,
  onError: (msg: string) => void,
  onStatus: (s: ScanStatus) => void,
  deviceId?: string,
): Promise<ScanHandle> {
  onStatus("starting");
  resetDedup();
  let stream: MediaStream | null = null;
  let rafId = 0;
  let stopped = false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  try {
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    onStatus("scanning");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onError(msg);
    onStatus("error");
    return { stop: () => {} };
  }

  const tick = () => {
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h) {
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        decodeFrame(data, w, h).then((text) => {
          if (text) {
            const now = Date.now();
            if (text === lastScanText && now - lastScanTime < DEDUP_MS) return;
            lastScanText = text;
            lastScanTime = now;
            onScan(text, parseQrContent(text));
          }
        });
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      onStatus("idle");
    },
  };
}

async function decodeImageSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<ParsedQr | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const text = await decodeFrame(data, width, height);
  return text ? parseQrContent(text) : null;
}

export async function decodeImageFile(file: File): Promise<ParsedQr | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const result = await decodeImageSource(img, img.naturalWidth, img.naturalHeight);
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeBase64Image(input: string): Promise<ParsedQr | null> {
  const cleaned = input
    .replace(/^data:image\/[a-z]+;base64,/i, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(cleaned);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null;
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const result = await decodeImageSource(img, img.naturalWidth, img.naturalHeight);
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FETCH_ERROR = "Could not fetch that image. Some sites block cross-origin requests.";

export async function decodeImageUrl(url: string): Promise<ParsedQr | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(FETCH_ERROR);
  }
  if (!res.ok) throw new Error(FETCH_ERROR);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImage(objectUrl);
    return await decodeImageSource(img, img.naturalWidth, img.naturalHeight);
  } catch {
    // tainted canvas (CORS) or unreadable image
    throw new Error(FETCH_ERROR);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

export async function enumerateCameras(): Promise<MediaDeviceInfo[]> {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}