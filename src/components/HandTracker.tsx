import { useEffect, useRef, useState } from "react";
import {
    DrawingUtils,
    FilesetResolver,
    GestureRecognizer,
} from "@mediapipe/tasks-vision";
import { Card, Switch } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { cnm } from "@/utils/style";
import { createPalmBloom } from "@/lib/palmBloom";

type HandGesture = {
    handedness: string; // "Left" / "Right" from MediaPipe
    gesture: string;
    score: number;
};

type Flower = { id: number; xPct: number; yPct: number };

export default function HandTracker() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const recognizerRef = useRef<GestureRecognizer | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef(0);
    const skeletonRef = useRef(true);
    const effectRef = useRef(true);
    const bloomRef = useRef<ReturnType<typeof createPalmBloom> | null>(null);
    const flowerIdRef = useRef(0);
    const mosaicRef = useRef<HTMLCanvasElement | null>(null);

    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cameraOn, setCameraOn] = useState(true);
    const [skeletonOn, setSkeletonOn] = useState(true);
    const [effectOn, setEffectOn] = useState(true);
    const [effectMode, setEffectMode] = useState<"blur" | "mosaic" | "flip" | null>(null);
    const [numHands, setNumHands] = useState(2);
    const [handsText, setHandsText] = useState("2");
    const [handsDetected, setHandsDetected] = useState(0);
    const [gestures, setGestures] = useState<HandGesture[]>([]);
    const [flowers, setFlowers] = useState<Flower[]>([]);

    // Mirror-corrected because the preview is flipped (-scale-x-100).
    if (!bloomRef.current) bloomRef.current = createPalmBloom({ mirror: true });

    // Let the draw loop read the latest toggle without restarting the effect.
    useEffect(() => {
        skeletonRef.current = skeletonOn;
    }, [skeletonOn]);

    useEffect(() => {
        effectRef.current = effectOn;
    }, [effectOn]);

    // Load the model once. GestureRecognizer also returns hand landmarks,
    // so we get the skeleton and the gesture from a single pass.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
                );
                const recognizer = await GestureRecognizer.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                        delegate: "GPU",
                    },
                    runningMode: "VIDEO",
                    numHands: 2,
                });

                if (cancelled) {
                    recognizer.close();
                    return;
                }
                recognizerRef.current = recognizer;
                setReady(true);
            } catch {
                setError("Failed to load the hand tracking model.");
            }
        })();

        return () => {
            cancelled = true;
            recognizerRef.current?.close();
            recognizerRef.current = null;
        };
    }, []);

    // Apply hand count changes live, no need to rebuild the model.
    useEffect(() => {
        if (ready) recognizerRef.current?.setOptions({ numHands });
    }, [ready, numHands]);

    // Camera stream + detection loop.
    useEffect(() => {
        if (!ready || !cameraOn) return;

        let active = true;
        let draw: DrawingUtils | null = null;
        const video = videoRef.current!;

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "user",
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                });
                if (!active) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                video.srcObject = stream;
                await video.play();
                loop();
            } catch {
                setError("Camera access was denied.");
            }
        })();

        function loop() {
            if (!active) return;

            const recognizer = recognizerRef.current;
            const canvas = canvasRef.current;

            if (recognizer && canvas && video.readyState >= 2) {
                const ctx = canvas.getContext("2d")!;
                if (!draw) draw = new DrawingUtils(ctx);

                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                const result = recognizer.recognizeForVideo(video, performance.now());
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                setHandsDetected(result.landmarks.length);

                // Pair up each hand's gesture with its handedness.
                setGestures(
                    result.gestures.map((g, i) => ({
                        handedness: result.handedness[i]?.[0]?.categoryName ?? "",
                        gesture: g[0]?.categoryName ?? "None",
                        score: g[0]?.score ?? 0,
                    }))
                );

                // Fist -> open palm pops a flower at the palm center.
                for (const bloom of bloomRef.current!.detect(result)) {
                    const id = flowerIdRef.current++;
                    setFlowers((f) => [
                        ...f,
                        { id, xPct: bloom.xPct, yPct: bloom.yPct },
                    ]);
                    setTimeout(() => {
                        setFlowers((f) => f.filter((x) => x.id !== id));
                    }, 3000);
                }

                // Thumb (4) + index (8) tips define the area we distort the video in.
                // Screen y grows downward, so thumb "above" index means a smaller y.
                if (effectRef.current && result.landmarks.length > 0) {
                    const hands = result.landmarks.slice(0, 2).map((lm) => ({
                        thumb: { x: lm[4].x * canvas.width, y: lm[4].y * canvas.height },
                        index: { x: lm[8].x * canvas.width, y: lm[8].y * canvas.height },
                        thumbAbove: lm[4].y < lm[8].y,
                    }));
                    // based on thumb orientation
                    const bothUpwards = (hands.length >= 2 && hands.every((h) => h.thumbAbove)) || (hands.length === 1 && hands[0].thumbAbove);
                    const bothDownwards =
                        (hands.length >= 2 && hands.every((h) => !h.thumbAbove)) || (hands.length === 1 && !hands[0].thumbAbove);
                    const mode = bothUpwards
                        ? "flip"
                        : bothDownwards
                            ? "blur"
                            : "mosaic";
                    const filter = mode === "blur" ? "blur(12px)" : "none";
                    setEffectMode(mode);

                    const fill = (pts: { x: number; y: number }[]) => {
                        const xs = pts.map((p) => p.x);
                        const ys = pts.map((p) => p.y);
                        const minX = Math.min(...xs);
                        const minY = Math.min(...ys);
                        const w = Math.max(...xs) - minX;
                        const h = Math.max(...ys) - minY;
                        if (w < 2 || h < 2) return;
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                        ctx.closePath();
                        ctx.clip();
                        ctx.filter = filter;
                        if (mode === "mosaic") {
                            const blockPx = 16;
                            const sw = Math.max(1, Math.round(w / blockPx));
                            const sh = Math.max(1, Math.round(h / blockPx));
                            const tmp = (mosaicRef.current ??= document.createElement("canvas"));
                            tmp.width = sw;
                            tmp.height = sh;
                            const tctx = tmp.getContext("2d")!;
                            tctx.drawImage(video, minX, minY, w, h, 0, 0, sw, sh);
                            ctx.imageSmoothingEnabled = false;
                            ctx.drawImage(tmp, 0, 0, sw, sh, minX, minY, w, h);
                            ctx.imageSmoothingEnabled = true;
                        } else {
                            if (mode === "flip") {
                                // Rotate the clipped region 180° about its center.
                                ctx.translate(minX + w / 2, minY + h / 2);
                                ctx.rotate(Math.PI);
                                ctx.translate(-(minX + w / 2), -(minY + h / 2));
                            }
                            ctx.drawImage(video, minX, minY, w, h, minX, minY, w, h);
                        }
                        ctx.restore();
                    };

                    const [a, b] = hands;
                    if (b) {
                        if (mode === "mosaic") fill([a.index, b.thumb, b.index, a.thumb]);
                        else fill([a.index, b.index, b.thumb, a.thumb]);
                    } else {
                        // Single hand: its own thumb<->index box.
                        fill([
                            a.thumb,
                            { x: a.index.x, y: a.thumb.y },
                            a.index,
                            { x: a.thumb.x, y: a.index.y },
                        ]);
                    }
                    ctx.filter = "none";
                } else {
                    setEffectMode(null);
                }

                if (skeletonRef.current) {
                    for (const landmarks of result.landmarks) {
                        draw.drawConnectors(
                            landmarks,
                            GestureRecognizer.HAND_CONNECTIONS,
                            {
                                color: "#d73ba0",
                                lineWidth: 8,
                            }
                        );
                        draw.drawLandmarks(landmarks, {
                            color: "#19c7e2",
                            lineWidth: 5,
                        });
                    }
                }
            }

            rafRef.current = requestAnimationFrame(loop);
        }

        return () => {
            active = false;
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            video.srcObject = null;

            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHandsDetected(0);
            setGestures([]);
            setFlowers([]);
            setEffectMode(null);
            bloomRef.current?.reset();
        };
    }, [ready, cameraOn]);

    return (
        <div
            className="dark relative min-h-screen overflow-hidden bg-gray text-white"
            data-theme="dark"
        >

            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-40 h-[26rem] w-[26rem] rounded-full bg-[#d73ba0]/40 blur-[130px]" />
                <div className="absolute right-[-6rem] top-1/4 h-[28rem] w-[28rem] rounded-full bg-[#19c7e2]/30 blur-[140px]" />
                <div className="absolute bottom-[-8rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-[#6d54e0]/35 blur-[130px]" />
            </div>

            <div className="relative mx-auto max-w-6xl px-6 py-10">
                <header className="mb-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-white drop-shadow-sm">Hand Tracker</h1>
                </header>

                <div className="flex flex-col gap-6 lg:flex-row">
                    <div className="relative aspect-video flex-1 overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-2xl shadow-black/40 backdrop-blur-2xl">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full -scale-x-100 object-cover"
                        />
                        <canvas
                            ref={canvasRef}
                            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
                        />

                        {/* Coords are already mirror-corrected, so this layer isn't flipped. */}
                        <AnimatePresence>
                            {flowers.map((flower) => (
                                <motion.img
                                    key={flower.id}
                                    src="/assets/images/flower.png"
                                    alt=""
                                    initial={{ scale: 0, opacity: 0, rotate: -30 }}
                                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                    exit={{ scale: 0.6, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                                    style={{
                                        left: `${flower.xPct}%`,
                                        top: `${flower.yPct}%`,
                                    }}
                                    className="pointer-events-none absolute size-24 -translate-x-1/2 -translate-y-1/2 select-none drop-shadow-md"
                                />
                            ))}
                        </AnimatePresence>

                        {!cameraOn && (
                            <div className="absolute inset-0 grid place-items-center bg-white/5 text-sm text-white/50 backdrop-blur-xl">
                                Camera is off
                            </div>
                        )}
                        {cameraOn && !ready && !error && (
                            <div className="absolute inset-0 grid place-items-center text-sm text-white/60">
                                Loading model…
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 grid place-items-center bg-red-500/10 px-6 text-center text-sm text-red-300 backdrop-blur-xl">
                                {error}
                            </div>
                        )}

                        {cameraOn && ready && !error && (
                            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90 shadow-lg shadow-black/20 backdrop-blur-md">
                                <span
                                    className={cnm(
                                        "size-2 rounded-full",
                                        handsDetected > 0
                                            ? "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.55)]"
                                            : "bg-white/40"
                                    )}
                                />
                                {handsDetected > 0
                                    ? `${handsDetected} hand${handsDetected > 1 ? "s" : ""} tracked`
                                    : "No hands"}
                            </div>
                        )}

                        {cameraOn && ready && !error && effectMode && (
                            <div className="absolute right-3 top-3 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium capitalize text-white/90 shadow-lg shadow-black/20 backdrop-blur-md">
                                {effectMode}
                            </div>
                        )}

                        {cameraOn && ready && !error && gestures.length > 0 && (
                            <div className="absolute left-3 top-12 flex flex-col gap-1.5">
                                {gestures.map((g, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/90 shadow-lg shadow-black/20 backdrop-blur-md"
                                    >
                                        <span className="font-medium">
                                            Hand {i + 1}
                                            {g.handedness && (
                                                <span className="text-white/50">
                                                    {" "}
                                                    ({g.handedness})
                                                </span>
                                            )}
                                            :
                                        </span>
                                        <span className="text-[#ff8fd6]">{g.gesture}</span>
                                        {g.score > 0 && (
                                            <span className="text-white/50">
                                                {Math.round(g.score * 100)}%
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <Card className="w-full shrink-0 border border-white/15 bg-white/10 shadow-2xl shadow-black/40 backdrop-blur-2xl lg:w-80">
                        <Card.Header>
                            <Card.Title className="text-white">Settings</Card.Title>
                            <Card.Description className="text-white/60">
                                Tune tracking and display.
                            </Card.Description>
                        </Card.Header>
                        <Card.Content className="flex flex-col gap-6">
                            {/* <label className="flex items-center justify-between gap-2">
                                <span className="text-sm text-white/80">Number of hands</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={4}
                                    value={handsText}
                                    onChange={(e) => {
                                        const t = e.target.value;
                                        // allow empty while typing, only commit valid values
                                        if (t === "" || /^[1-4]$/.test(t)) {
                                            setHandsText(t);
                                            if (t !== "") setNumHands(Number(t));
                                        }
                                    }}
                                    onBlur={() => setHandsText(String(numHands))}
                                    className="w-16 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-center text-sm text-white outline-none backdrop-blur-md transition-colors focus:border-white/40 focus:bg-white/15"
                                />
                            </label> */}

                            <div className="flex flex-col gap-4 border-t border-white/15 pt-6">
                                <Switch
                                    className="w-full"
                                    isSelected={cameraOn}
                                    onChange={setCameraOn}
                                >
                                    <Switch.Content className="w-full justify-between text-white/90">
                                        Camera
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch.Content>
                                </Switch>

                                <Switch
                                    className="w-full"
                                    isSelected={skeletonOn}
                                    onChange={setSkeletonOn}
                                >
                                    <Switch.Content className="w-full justify-between text-white/90">
                                        Skeleton overlay
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch.Content>
                                </Switch>

                                <Switch
                                    className="w-full"
                                    isSelected={effectOn}
                                    onChange={setEffectOn}
                                >
                                    <Switch.Content className="w-full justify-between text-white/90">
                                        Pinch effect
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch.Content>
                                </Switch>

                            </div>
                        </Card.Content>
                    </Card>
                </div>
            </div>
        </div>
    );
}