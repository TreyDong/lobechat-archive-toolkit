import { nanoid } from 'nanoid';
import { create } from 'zustand';
import type { ParsedData } from '../lib/parser';

export type LogLevel = 'info' | 'success' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
}

interface AppState {
  sourceFile?: File;
  parsed?: ParsedData;
  isParsing: boolean;
  isExporting: boolean;
  shouldStopExport: boolean;
  logs: LogEntry[];
  setSourceFile: (file: File | undefined) => void;
  setParsedData: (data: ParsedData | undefined) => void;
  setParsing: (value: boolean) => void;
  setExporting: (value: boolean) => void;
  requestExportStop: () => void;
  resetExportStop: () => void;
  appendLog: (message: string, level?: LogLevel) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sourceFile: undefined,
  parsed: undefined,
  isParsing: false,
  isExporting: false,
  shouldStopExport: false,
  logs: [],
  setSourceFile: (file) => set({ sourceFile: file }),
  setParsedData: (data) => set({ parsed: data }),
  setParsing: (value) => set({ isParsing: value }),
  setExporting: (value) => set({ isExporting: value }),
  requestExportStop: () => set({ shouldStopExport: true }),
  resetExportStop: () => set({ shouldStopExport: false }),
  appendLog: (message, level = 'info') =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: nanoid(),
          message,
          level,
          timestamp: Date.now(),
        },
      ],
    })),
  reset: () =>
    set({
      sourceFile: undefined,
      parsed: undefined,
      logs: [],
      isParsing: false,
      isExporting: false,
      shouldStopExport: false,
    }),
}));
