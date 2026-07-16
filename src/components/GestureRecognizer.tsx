import { useEffect, useRef, useState } from "react";
import {
    FilesetResolver,
    GestureRecognizer as GestureRecognizerTask,
    DrawingUtils,
} from "@mediapipe/tasks-vision";

type Hand = { label: string; gesture: string };

export default function GestureRecognizer() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const recognizerRef = useRef<GestureRecognizerTask | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef(0);

    const [hands, setHands] = useState<Hand[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const video = videoRef.current!;
        let draw: DrawingUtils | null = null;

        (async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
                );
                const recognizer = await GestureRecognizerTask.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                        delegate: "GPU",
                    },
                    runningMode: "VIDEO",
                    numHands: 2,
                });
                if (!active) {
                    recognizer.close();
                    return;
                }
                recognizerRef.current = recognizer;

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                if (!active) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                video.srcObject = stream;
                await video.play();
                detect();
            } catch {
                setError("Failed to start gesture recognition.");
            }
        })();

        function detect() {
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

                const detected: Hand[] = result.landmarks.map((landmarks, i) => {
                    // uncomment to see the landmarks (points) detected by the model
                    // console.log("landmarks:", landmarks);
                    draw!.drawConnectors(landmarks, GestureRecognizerTask.HAND_CONNECTIONS, {
                        color: "#ffffff",
                        lineWidth: 4,
                    });
                    draw!.drawLandmarks(landmarks, { color: "#999999", lineWidth: 2 });

                    const label = result.handedness[i]?.[0]?.categoryName ?? "";
                    const gesture = result.gestures[i]?.[0]?.categoryName;
                    return { label, gesture: gesture && gesture !== "None" ? gesture : "" };
                });

                setHands(detected);
            }

            rafRef.current = requestAnimationFrame(detect);
        }

        return () => {
            active = false;
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            recognizerRef.current?.close();
            recognizerRef.current = null;
        };
    }, []);

    return (
        <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-lg bg-black">
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
            <div className="absolute left-3 top-3 space-y-1">
                {error ? (
                    <p className="rounded bg-black/70 px-3 py-1 text-sm font-medium text-white">
                        {error}
                    </p>
                ) : hands.length === 0 ? (
                    <p className="rounded bg-black/70 px-3 py-1 text-sm font-medium text-white">
                        Show your hands
                    </p>
                ) : (
                    hands.map((hand, i) => (
                        <p
                            key={i}
                            className="rounded bg-black/70 px-3 py-1 text-sm font-medium text-white"
                        >
                            {hand.label || "Hand"}
                            {hand.gesture && `: ${hand.gesture}`}
                        </p>
                    ))
                )}
            </div>
        </div>
    );
}
