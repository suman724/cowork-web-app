import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useFileStore,
  TERMINAL_STATUSES,
  MAX_FILE_SIZE,
  uploadErrorMessage,
} from "../fileStore";

vi.mock("../../api/client", () => {
  const uploadFile = vi.fn();
  const listFiles = vi.fn();
  const downloadFile = vi.fn();
  return {
    api: { uploadFile, listFiles, downloadFile },
    ApiError: class ApiError extends Error {
      status: number;
      body: string;
      constructor(status: number, body: string) {
        super(`API error ${status}: ${body}`);
        this.status = status;
        this.body = body;
      }
    },
  };
});

import { api, ApiError } from "../../api/client";

const mockApi = api as {
  uploadFile: ReturnType<typeof vi.fn>;
  listFiles: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  useFileStore.setState({
    files: [],
    loading: false,
    uploads: [],
    uploadingCount: 0,
    uploadError: null,
  });
});

describe("fileStore", () => {
  describe("upload", () => {
    it("uploads file and stores result with sandboxSynced=true", async () => {
      mockApi.uploadFile.mockResolvedValue({
        path: "test.txt",
        size: 11,
        persisted: true,
        sandboxSynced: true,
      });
      mockApi.listFiles.mockResolvedValue({ files: [] });

      await useFileStore
        .getState()
        .upload("s-1", new File(["hello world"], "test.txt"));

      expect(mockApi.uploadFile).toHaveBeenCalledWith(
        "s-1",
        expect.any(File),
        "test.txt",
      );
      const state = useFileStore.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0]).toEqual({
        path: "test.txt",
        size: 11,
        persisted: true,
        sandboxSynced: true,
      });
      expect(state.uploadingCount).toBe(0);
      expect(state.uploadError).toBeNull();
    });

    it("uploads file with sandboxSynced=false during provisioning", async () => {
      mockApi.uploadFile.mockResolvedValue({
        path: "data.csv",
        size: 100,
        persisted: true,
        sandboxSynced: false,
      });
      mockApi.listFiles.mockResolvedValue({ files: [] });

      await useFileStore
        .getState()
        .upload("s-1", new File(["x".repeat(100)], "data.csv"));

      const state = useFileStore.getState();
      expect(state.uploads[0].persisted).toBe(true);
      expect(state.uploads[0].sandboxSynced).toBe(false);
    });

    it("replaces existing upload entry for same path", async () => {
      useFileStore.setState({
        uploads: [
          { path: "test.txt", size: 5, persisted: true, sandboxSynced: false },
        ],
      });
      mockApi.uploadFile.mockResolvedValue({
        path: "test.txt",
        size: 11,
        persisted: true,
        sandboxSynced: true,
      });
      mockApi.listFiles.mockResolvedValue({ files: [] });

      await useFileStore
        .getState()
        .upload("s-1", new File(["hello world"], "test.txt"));

      const state = useFileStore.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0].sandboxSynced).toBe(true);
    });

    it("sets uploadError on 413", async () => {
      mockApi.uploadFile.mockRejectedValue(new ApiError(413, "File too large"));

      await useFileStore.getState().upload("s-1", new File(["x"], "big.bin"));

      const state = useFileStore.getState();
      expect(state.uploadError).toBe("File too large");
      expect(state.uploadingCount).toBe(0);
    });

    it("sets uploadError on 409 (terminal session)", async () => {
      mockApi.uploadFile.mockRejectedValue(
        new ApiError(409, "Session is not active"),
      );

      await useFileStore.getState().upload("s-1", new File(["x"], "test.txt"));

      expect(useFileStore.getState().uploadError).toBe(
        "Session is no longer active",
      );
    });

    it("sets uploadError on 502 (service down)", async () => {
      mockApi.uploadFile.mockRejectedValue(
        new ApiError(502, "Downstream error"),
      );

      await useFileStore.getState().upload("s-1", new File(["x"], "test.txt"));

      expect(useFileStore.getState().uploadError).toBe(
        "Upload service unavailable, please retry",
      );
    });

    it("rejects file exceeding client-side size limit", async () => {
      const bigFile = new File(["x"], "big.bin");
      Object.defineProperty(bigFile, "size", { value: MAX_FILE_SIZE + 1 });

      await useFileStore.getState().upload("s-1", bigFile);

      expect(mockApi.uploadFile).not.toHaveBeenCalled();
      expect(useFileStore.getState().uploadError).toBe(
        "File too large (max 50 MB)",
      );
    });

    it("sends custom path when provided", async () => {
      mockApi.uploadFile.mockResolvedValue({
        path: "src/main.py",
        size: 5,
        persisted: true,
        sandboxSynced: true,
      });
      mockApi.listFiles.mockResolvedValue({ files: [] });

      await useFileStore
        .getState()
        .upload("s-1", new File(["hello"], "main.py"), "src/main.py");

      expect(mockApi.uploadFile).toHaveBeenCalledWith(
        "s-1",
        expect.any(File),
        "src/main.py",
      );
    });
  });

  describe("refresh", () => {
    it("loads file list from API", async () => {
      mockApi.listFiles.mockResolvedValue({
        files: [{ path: "readme.md", size: 100, contentType: "text/markdown" }],
      });

      await useFileStore.getState().refresh("s-1");

      const state = useFileStore.getState();
      expect(state.files).toHaveLength(1);
      expect(state.files[0].path).toBe("readme.md");
      expect(state.loading).toBe(false);
    });

    it("handles refresh error gracefully", async () => {
      mockApi.listFiles.mockRejectedValue(new Error("Network error"));

      await useFileStore.getState().refresh("s-1");

      expect(useFileStore.getState().loading).toBe(false);
    });
  });

  describe("clearUploads", () => {
    it("clears uploads and error", () => {
      useFileStore.setState({
        uploads: [
          { path: "a.txt", size: 1, persisted: true, sandboxSynced: true },
        ],
        uploadError: "some error",
      });

      useFileStore.getState().clearUploads();

      const state = useFileStore.getState();
      expect(state.uploads).toHaveLength(0);
      expect(state.uploadError).toBeNull();
    });
  });

  describe("clearUploadError", () => {
    it("clears only the error", () => {
      useFileStore.setState({
        uploads: [
          { path: "a.txt", size: 1, persisted: true, sandboxSynced: true },
        ],
        uploadError: "some error",
      });

      useFileStore.getState().clearUploadError();

      const state = useFileStore.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploadError).toBeNull();
    });
  });
});

describe("uploadErrorMessage", () => {
  it("maps 413 to 'File too large'", () => {
    expect(uploadErrorMessage(new ApiError(413, ""))).toBe("File too large");
  });

  it("maps 409 to session inactive message", () => {
    expect(uploadErrorMessage(new ApiError(409, ""))).toBe(
      "Session is no longer active",
    );
  });

  it("maps 502/503 to service unavailable", () => {
    expect(uploadErrorMessage(new ApiError(502, ""))).toBe(
      "Upload service unavailable, please retry",
    );
    expect(uploadErrorMessage(new ApiError(503, ""))).toBe(
      "Upload service unavailable, please retry",
    );
  });

  it("maps 400 to invalid path", () => {
    expect(uploadErrorMessage(new ApiError(400, ""))).toBe("Invalid file path");
  });

  it("maps unknown errors to generic message", () => {
    expect(uploadErrorMessage(new Error("boom"))).toBe("Upload failed");
  });
});

describe("TERMINAL_STATUSES", () => {
  it("includes SESSION_CANCELLED only", () => {
    expect(TERMINAL_STATUSES.has("SESSION_CANCELLED")).toBe(true);
    // SANDBOX_TERMINATED is resumable, not terminal
    expect(TERMINAL_STATUSES.has("SANDBOX_TERMINATED")).toBe(false);
  });

  it("does not include active statuses", () => {
    expect(TERMINAL_STATUSES.has("SESSION_RUNNING")).toBe(false);
    expect(TERMINAL_STATUSES.has("SANDBOX_READY")).toBe(false);
  });
});
