import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Icon } from "./icons";
import { Btn, Modal, Badge } from "./ui";

type DetectedBarcode = { rawValue?: string; format?: string };
type NativeDetector = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};
type NativeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string, format?: string) => void;
};

const REQUESTED_FORMATS = [
  "qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8",
  "upc_a", "upc_e", "itf", "codabar", "data_matrix", "pdf417", "aztec",
];

function cameraError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "اجازه دوربین داده نشد. مجوز Camera را در تنظیمات مرورگر فعال کنید و مطمئن شوید آدرس با HTTPS باز شده است.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "دوربینی روی این دستگاه پیدا نشد.";
  if (name === "NotReadableError" || name === "TrackStartError") return "دوربین در دسترس نیست؛ ممکن است برنامه دیگری از آن استفاده کند.";
  if (name === "OverconstrainedError") return "تنظیمات دوربین پشتیبانی نمی‌شود. صفحه را دوباره باز کنید.";
  return "راه‌اندازی دوربین انجام نشد. مجوزها، اتصال HTTPS و تنظیمات مرورگر را بررسی کنید.";
}

export default function CameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState("در حال آماده‌سازی دوربین…");
  const [error, setError] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let delivered = false;
    let busy = false;
    let lastScanAt = 0;
    let frame = 0;
    let stream: MediaStream | null = null;
    let detector: NativeDetector | null = null;
    let animationVideo: HTMLVideoElement | null = null;
    let context: CanvasRenderingContext2D | null = null;
    const canvas = document.createElement("canvas");
    setError("");
    setFormats([]);
    setStatus("در حال درخواست دسترسی دوربین…");
    setStarting(true);

    const stop = () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (animationVideo) animationVideo.srcObject = null;
    };

    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("SECURE_CONTEXT_REQUIRED");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        const video = videoRef.current;
        if (!video) throw new Error("VIDEO_ELEMENT_MISSING");
        animationVideo = video;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        if (cancelled) return;

        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined;
        setTorchAvailable(!!capabilities?.torch);
        setTorchOn(false);

        const Detector = (window as Window & { BarcodeDetector?: NativeDetectorConstructor }).BarcodeDetector;
        if (Detector) {
          try {
            const supported = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : REQUESTED_FORMATS;
            const selected = REQUESTED_FORMATS.filter(format => supported.includes(format));
            if (selected.length) {
              detector = new Detector({ formats: selected });
              setFormats(selected);
            }
          } catch {
            detector = null;
          }
        }
        if (!detector) setFormats(["qr_code"]);
        setStatus(detector
          ? "دوربین فعال است؛ QR یا بارکد را داخل کادر قرار دهید."
          : "دوربین فعال است؛ در این مرورگر اسکن دوربینی QR پشتیبانی می‌شود. برای بارکد خطی از بارکدخوان سخت‌افزاری استفاده کنید.");
        context = canvas.getContext("2d", { willReadFrequently: true });

        const scanFrame = async () => {
          if (cancelled || delivered || !video.isConnected) return;
          const now = performance.now();
          if (!busy && now - lastScanAt >= 150 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
            lastScanAt = now;
            busy = true;
            try {
              let value = "";
              let format = "";
              if (detector) {
                try {
                  const results = await detector.detect(video);
                  const first = results.find(item => typeof item.rawValue === "string" && item.rawValue.trim());
                  if (first?.rawValue) { value = first.rawValue; format = first.format || "بارکد"; }
                } catch {
                  // Some browsers expose BarcodeDetector but fail for a particular camera/frame.
                  // Disable the native path and continue with the local QR decoder instead of
                  // skipping every frame forever.
                  detector = null;
                  setFormats(["qr_code"]);
                  setStatus("تشخیص بومی بارکد در این مرورگر خطا داد؛ اسکن QR با موتور جایگزین ادامه دارد.");
                }
              }
              // QR fallback works on browsers without BarcodeDetector, including browsers
              // where the native detector does not expose QR support or fails at runtime.
              if (!value && context) {
                const maxWidth = 960;
                const scale = Math.min(1, maxWidth / video.videoWidth);
                const width = Math.max(1, Math.round(video.videoWidth * scale));
                const height = Math.max(1, Math.round(video.videoHeight * scale));
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                context.drawImage(video, 0, 0, width, height);
                const pixels = context.getImageData(0, 0, width, height);
                const qr = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
                if (qr?.data?.trim()) { value = qr.data; format = "QR"; }
              }
              if (value && !delivered) {
                delivered = true;
                setStatus("کد شناسایی شد؛ در حال باز کردن تجهیز…");
                stop();
                onDetectedRef.current(value.trim(), format);
                return;
              }
            } catch {
              // A frame can fail to decode while the camera is moving; continue scanning.
            } finally {
              busy = false;
            }
          }
          if (!cancelled && !delivered) frame = requestAnimationFrame(() => { void scanFrame(); });
        };
        setStarting(false);
        frame = requestAnimationFrame(() => { void scanFrame(); });
      } catch (err) {
        if (!cancelled) {
          setStarting(false);
          setError(err instanceof Error && err.message === "SECURE_CONTEXT_REQUIRED"
            ? "برای دسترسی دوربین گوشی، برنامه باید از طریق HTTPS و با گواهی معتبر/مورد اعتماد روی گوشی باز شود. آدرس HTTP یا IP بدون گواهی امن اجازه دوربین نمی‌دهد."
            : cameraError(err));
          setStatus("دوربین راه‌اندازی نشد");
        }
      }
    };

    void start();
    return stop;
  }, [open]);

  const toggleTorch = async () => {
    const video = videoRef.current;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0] as (MediaStreamTrack & { applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void> }) | undefined;
    if (!track?.applyConstraints) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { setError("چراغ فلش در این دوربین یا مرورگر پشتیبانی نمی‌شود."); }
  };

  return (
    <Modal open={open} onClose={onClose} title="اسکن واقعی با دوربین گوشی" wide footer={
      <>
        {torchAvailable && <Btn kind="soft" onClick={() => void toggleTorch()}><Icon name="camera" size={15} />{torchOn ? "خاموش کردن فلش" : "روشن کردن فلش"}</Btn>}
        <Btn kind="ghost" onClick={onClose}>بستن اسکنر</Btn>
      </>
    }>
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-black border border-line min-h-56">
          <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-[55vh] min-h-56 object-contain" />
          <div className="absolute inset-7 border-2 border-acc/80 rounded-xl pointer-events-none">
            <span className="absolute top-1/2 inset-x-0 h-px bg-acc/75 shadow-[0_0_12px_var(--acc)]" />
          </div>
          {starting && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm"><Icon name="sync" className="animate-spin" /> در حال اتصال به دوربین…</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={error ? "nok" : starting ? "warn" : "ok"}>{error ? "خطای دوربین" : starting ? "در حال اتصال" : "دوربین فعال"}</Badge>
          <span className="text-xs text-mut">{status}</span>
        </div>
        {error && <div role="alert" className="rounded-lg border border-nok/30 bg-nok/10 px-3 py-2.5 text-xs leading-6 text-nok">{error}</div>}
        <div className="text-[11px] text-mut leading-6">
          کد فقط برای شناسایی تجهیز خوانده می‌شود و تصویر دوربین در سامانه ذخیره یا ارسال نمی‌شود. فرمت‌های قابل پشتیبانی این مرورگر: {formats.length ? formats.join("، ") : "در حال تشخیص"}.
        </div>
      </div>
    </Modal>
  );
}
