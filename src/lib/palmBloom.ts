import type { GestureRecognizerResult } from "@mediapipe/tasks-vision";

// Detects the "bloom" motion: a hand that closes into a fist and then opens.
// A single frame isn't a motion, so we keep a small per-hand state machine and
// only fire on the fist -> open-palm transition. Arming survives the noisy
// None/flicker frames MediaPipe drops in between.

export type BloomEvent = {
    key: string; // hand identity (handedness, or index fallback)
    xPct: number; // palm x as 0..100, mirror-corrected for the preview
    yPct: number; // palm y as 0..100
};

export type PalmBloomOptions = {
    armGesture?: string; // gesture that arms the bloom, default Closed_Fist
    fireGesture?: string; // gesture that fires it, default Open_Palm
    armFrames?: number; // frames the fist must hold before arming (debounce)
    palmLandmark?: number; // landmark used as the palm center, default 9
    mirror?: boolean; // flip x for a mirrored (-scale-x-100) preview
};

export function createPalmBloom(options: PalmBloomOptions = {}) {
    const {
        armGesture = "Closed_Fist",
        fireGesture = "Open_Palm",
        armFrames = 2,
        palmLandmark = 9,
        mirror = false,
    } = options;

    // Per hand: how many consecutive fist frames seen, and whether it's armed.
    const holdCount: Record<string, number> = {};
    const armed: Record<string, boolean> = {};

    function detect(result: GestureRecognizerResult): BloomEvent[] {
        const events: BloomEvent[] = [];
        const seen = new Set<string>();

        result.gestures.forEach((g, i) => {
            const name = g[0]?.categoryName ?? "None";
            const key = result.handedness[i]?.[0]?.categoryName ?? String(i);
            seen.add(key);

            if (name === armGesture) {
                holdCount[key] = (holdCount[key] ?? 0) + 1;
                if (holdCount[key] >= armFrames) armed[key] = true;
                return;
            }

            // Any non-fist frame stops the hold count, but the armed flag
            // persists so brief None frames don't cancel the motion.
            holdCount[key] = 0;

            if (name === fireGesture && armed[key]) {
                armed[key] = false;
                const p = result.landmarks[i]?.[palmLandmark];
                if (p) {
                    events.push({
                        key,
                        xPct: (mirror ? 1 - p.x : p.x) * 100,
                        yPct: p.y * 100,
                    });
                }
            }
        });

        // Drop state for hands that left the frame.
        for (const key of Object.keys(armed)) {
            if (!seen.has(key)) {
                delete armed[key];
                delete holdCount[key];
            }
        }

        return events;
    }

    function reset() {
        for (const key of Object.keys(armed)) delete armed[key];
        for (const key of Object.keys(holdCount)) delete holdCount[key];
    }

    return { detect, reset };
}
