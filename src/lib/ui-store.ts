"use client";

import { create } from "zustand";

/** UI-only state: the open machine panel, and machines waiting to have labels printed. */
export const useUI = create<{
  machineId: string | null;
  /** "return" opens the panel straight on the return form */
  machineMode: "view" | "return";
  openMachine: (id: string, mode?: "view" | "return") => void;
  closeMachine: () => void;
  labelIds: string[];
  setLabelIds: (ids: string[]) => void;
}>((set) => ({
  machineId: null,
  machineMode: "view",
  openMachine: (id, mode = "view") => set({ machineId: id, machineMode: mode }),
  closeMachine: () => set({ machineId: null }),
  labelIds: [],
  setLabelIds: (ids) => set({ labelIds: ids }),
}));
