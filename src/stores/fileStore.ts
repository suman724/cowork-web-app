import { create } from "zustand";
import { api } from "../api/client";

interface FileInfo {
  path: string;
  size: number;
  contentType: string;
}

interface FileState {
  files: FileInfo[];
  loading: boolean;
  refresh: (sessionId: string) => Promise<void>;
  upload: (sessionId: string, file: File) => Promise<void>;
  download: (sessionId: string, path: string) => Promise<void>;
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  loading: false,

  refresh: async (sessionId: string) => {
    set({ loading: true });
    try {
      const data = await api.listFiles(sessionId);
      set({ files: data.files, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upload: async (sessionId: string, file: File) => {
    await api.uploadFile(sessionId, file);
  },

  download: async (sessionId: string, path: string) => {
    const blob = await api.downloadFile(sessionId, path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "download";
    a.click();
    URL.revokeObjectURL(url);
  },
}));
