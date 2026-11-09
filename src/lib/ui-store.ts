"use client";

import { create } from "zustand";

/** UI-only state: which machine's detail panel is open, from anywhere in the app. */
export const useUI = create<{
  machineId: string | null;
  openMachine: (id: string) => void;
  closeMachine: () => void;
}>((set) => ({
  machineId: null,
  openMachine: (id) => set({ machineId: id }),
  closeMachine: () => set({ machineId: null }),
}));
