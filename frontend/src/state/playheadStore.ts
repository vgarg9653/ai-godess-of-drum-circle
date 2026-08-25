/**
 * High-frequency playback state, kept apart from the session store.
 *
 * The playhead moves several times a second. Keeping it in its own store means
 * a moving cursor re-renders the loop view and the presence dots, not the
 * entire screen tree.
 */

import { create } from "zustand";

interface PlayheadState {
  step: number;
  /** Monotonic counter per participant, bumped each time one of their onsets sounds. */
  pulses: Record<string, number>;
  setStep: (step: number) => void;
  pulse: (participantId: string) => void;
  reset: () => void;
}

export const usePlayheadStore = create<PlayheadState>((set) => ({
  step: 0,
  pulses: {},
  setStep: (step) => set({ step }),
  pulse: (participantId) =>
    set((s) => ({
      pulses: { ...s.pulses, [participantId]: (s.pulses[participantId] ?? 0) + 1 },
    })),
  reset: () => set({ step: 0, pulses: {} }),
}));
