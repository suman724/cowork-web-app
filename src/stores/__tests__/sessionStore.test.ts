import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSessionStore } from "../sessionStore";

vi.mock("../../api/client", () => {
  const createSession = vi.fn();
  const getSession = vi.fn();
  const cancelSession = vi.fn();
  return {
    api: { createSession, getSession, cancelSession },
  };
});

import { api } from "../../api/client";

const mockApi = api as {
  createSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  cancelSession: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({
    sessions: [],
    activeSession: null,
    loading: false,
    error: null,
  });
});

describe("sessionStore", () => {
  describe("createSession", () => {
    it("creates session and updates state on success", async () => {
      const session = {
        sessionId: "s-123",
        status: "SESSION_CREATED",
        createdAt: "2026-01-01T00:00:00Z",
      };
      mockApi.createSession.mockResolvedValue(session);

      const sessionId = await useSessionStore
        .getState()
        .createSession("t-1", "u-1");

      expect(sessionId).toBe("s-123");
      expect(mockApi.createSession).toHaveBeenCalledWith({
        executionEnvironment: "cloud_sandbox",
        tenantId: "t-1",
        userId: "u-1",
      });

      const state = useSessionStore.getState();
      expect(state.activeSession).toEqual(session);
      expect(state.sessions).toHaveLength(1);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error state on failure", async () => {
      mockApi.createSession.mockRejectedValue(new Error("Network error"));

      await expect(
        useSessionStore.getState().createSession("t-1", "u-1"),
      ).rejects.toThrow("Network error");

      const state = useSessionStore.getState();
      expect(state.error).toBe("Error: Network error");
      expect(state.loading).toBe(false);
    });
  });

  describe("pollUntilReady", () => {
    it("transitions to ready when status is SANDBOX_READY", async () => {
      mockApi.getSession.mockResolvedValue({
        sessionId: "s-123",
        status: "SANDBOX_READY",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await useSessionStore.getState().pollUntilReady("s-123");

      const state = useSessionStore.getState();
      expect(state.activeSession?.status).toBe("SANDBOX_READY");
    });

    it("throws on failure status", async () => {
      mockApi.getSession.mockResolvedValue({
        sessionId: "s-123",
        status: "SESSION_FAILED",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await expect(
        useSessionStore.getState().pollUntilReady("s-123"),
      ).rejects.toThrow("Session SESSION_FAILED");
    });
  });

  describe("cancelSession", () => {
    it("updates active session status to cancelled", async () => {
      mockApi.cancelSession.mockResolvedValue(undefined);
      useSessionStore.setState({
        activeSession: {
          sessionId: "s-123",
          status: "SESSION_RUNNING",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      await useSessionStore.getState().cancelSession("s-123");

      expect(mockApi.cancelSession).toHaveBeenCalledWith("s-123");
      expect(useSessionStore.getState().activeSession?.status).toBe(
        "SESSION_CANCELLED",
      );
    });
  });
});
