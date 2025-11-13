import { create } from "zustand";
import type { Weapon } from "../game/types";

type UIState = {
  kills: number;
  health: number;
  ammo: number;
  weapon: string;
};

type Store = {
  running: boolean;
  muted: boolean;
  ui: UIState;
  setRunning: (v: boolean) => void;
  toggleMute: () => void;
  setUI: (next: Partial<UIState>) => void;
  forceRerenderTick: number;
  bumpFrame: () => void;
  requestEquip?: (w: Weapon | string) => void; // set by engine at runtime
  requestReset?: () => void;                    // set by engine at runtime
};

export const useGameStore = create<Store>((set) => ({
  running: false,
  muted: false,
  ui: { kills: 0, health: 100, ammo: 30, weapon: "AKM" },
  setRunning: (v) => set({ running: v }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setUI: (next) => set((s) => ({ ui: { ...s.ui, ...next } })),
  forceRerenderTick: 0,
  bumpFrame: () => set((s) => ({ forceRerenderTick: (s.forceRerenderTick + 1) % 1_000_000 })),
}));
