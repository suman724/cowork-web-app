import { create } from "zustand";
import { api, type SessionResponse } from "../api/client";

// Module-level guard to prevent concurrent polls
let _polling = false;

// States where the session is ended but can be resumed
const RESUMABLE_STATUSES = new Set([
  "SANDBOX_TERMINATED",
  "SESSION_COMPLETED",
  "SESSION_FAILED",
  "SESSION_CANCELLED",
]);

// States where the sandbox is active and serving
const ACTIVE_STATUSES = new Set([
  "SANDBOX_READY",
  "SESSION_RUNNING",
  "WAITING_FOR_LLM",
  "WAITING_FOR_TOOL",
  "WAITING_FOR_APPROVAL",
  "SESSION_PAUSED",
]);

interface SessionState {
  sessions: SessionResponse[];
  activeSession: SessionResponse | null;
  loading: boolean;
  error: string | null;
  reconnecting: boolean;

  createSession: (tenantId: string, userId: string) => Promise<string>;
  pollUntilReady: (sessionId: string) => Promise<void>;
  cancelSession: (sessionId: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  setActiveSession: (session: SessionResponse | null) => void;
  refreshSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSession: null,
  loading: false,
  error: null,
  reconnecting: false,

  createSession: async (tenantId: string, userId: string) => {
    set({ loading: true, error: null });
    try {
      const session = await api.createSession({
        executionEnvironment: "cloud_sandbox",
        tenantId,
        userId,
      });
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSession: session,
        loading: false,
      }));
      return session.sessionId;
    } catch (err) {
      set({ error: String(err), loading: false });
      throw err;
    }
  },

  pollUntilReady: async (sessionId: string) => {
    if (_polling) return;
    _polling = true;
    try {
      const maxAttempts = 60;
      let lastStatus = "";
      for (let i = 0; i < maxAttempts; i++) {
        const session = await api.getSession(sessionId);
        if (session.status !== lastStatus) {
          lastStatus = session.status;
          set({ activeSession: session });
        }
        if (ACTIVE_STATUSES.has(session.status)) {
          return;
        }
        if (
          session.status === "SESSION_CANCELLED" ||
          session.status === "SESSION_FAILED"
        ) {
          throw new Error(`Session ${session.status}`);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Sandbox provisioning timed out");
    } finally {
      _polling = false;
    }
  },

  cancelSession: async (sessionId: string) => {
    await api.cancelSession(sessionId);
    set((state) => ({
      activeSession:
        state.activeSession?.sessionId === sessionId
          ? { ...state.activeSession, status: "SESSION_CANCELLED" }
          : state.activeSession,
    }));
  },

  resumeSession: async (sessionId: string) => {
    set({ reconnecting: true, error: null });
    try {
      const response = await api.resumeSession(sessionId);
      set({ activeSession: response });

      // Poll until the new sandbox is ready
      await get().pollUntilReady(sessionId);
    } catch (err) {
      console.error("Session resume failed:", err);
      set({ error: `Resume failed: ${String(err)}` });
    } finally {
      set({ reconnecting: false });
    }
  },

  refreshSession: async (sessionId: string) => {
    try {
      const session = await api.getSession(sessionId);
      set({ activeSession: session });
    } catch {
      // Best-effort — don't crash on refresh failure
    }
  },

  setActiveSession: (session) => set({ activeSession: session }),
  clearError: () => set({ error: null }),
}));

export { RESUMABLE_STATUSES, ACTIVE_STATUSES };
