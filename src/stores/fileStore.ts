import { create } from "zustand";
import { api, ApiError, type UploadResult } from "../api/client";

interface FileInfo {
  path: string;
  size: number;
  contentType: string;
}

interface FileState {
  files: FileInfo[];
  loading: boolean;
  uploads: UploadResult[];
  /** Number of uploads currently in flight. */
  uploadingCount: number;
  uploadError: string | null;

  refresh: (sessionId: string) => Promise<void>;
  upload: (sessionId: string, file: File, path?: string) => Promise<void>;
  download: (sessionId: string, path: string) => Promise<void>;
  clearUploads: () => void;
  clearUploadError: () => void;
}

// SANDBOX_TERMINATED is NOT terminal — it's resumable via POST /sessions/{id}/resume.
// Only SESSION_CANCELLED is truly terminal (user explicitly ended).
const TERMINAL_STATUSES = new Set(["SESSION_CANCELLED"]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB client-side guard

function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "File too large";
    if (err.status === 409) return "Session is no longer active";
    if (err.status === 502 || err.status === 503)
      return "Upload service unavailable, please retry";
    if (err.status === 400) return "Invalid file path";
    if (err.status === 403) return "Not authorized to upload to this session";
  }
  return "Upload failed";
}

export { TERMINAL_STATUSES, MAX_FILE_SIZE, uploadErrorMessage };

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  loading: false,
  uploads: [],
  uploadingCount: 0,
  uploadError: null,

  refresh: async (sessionId: string) => {
    set({ loading: true });
    try {
      const data = await api.listFiles(sessionId);
      set({ files: data.files, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upload: async (sessionId: string, file: File, path?: string) => {
    if (file.size > MAX_FILE_SIZE) {
      set({ uploadError: "File too large (max 50 MB)" });
      return;
    }

    set((s) => ({ uploadingCount: s.uploadingCount + 1, uploadError: null }));
    try {
      const result: UploadResult = await api.uploadFile(
        sessionId,
        file,
        path ?? file.name,
      );
      set((state) => {
        const newCount = Math.max(0, state.uploadingCount - 1);
        return {
          uploads: [
            ...state.uploads.filter((u) => u.path !== result.path),
            result,
          ],
          uploadingCount: newCount,
        };
      });
      // Refresh file list only when all uploads are done
      if (get().uploadingCount === 0) get().refresh(sessionId);
    } catch (err) {
      set((s) => ({
        uploadError: uploadErrorMessage(err),
        uploadingCount: Math.max(0, s.uploadingCount - 1),
      }));
    }
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

  clearUploads: () =>
    set({ uploads: [], uploadingCount: 0, uploadError: null }),
  clearUploadError: () => set({ uploadError: null }),
}));
