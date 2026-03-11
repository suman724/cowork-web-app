import { create } from "zustand";
import { api, type SessionResponse } from "../api/client";

// Module-level guard to prevent concurrent polls
let _polling = false;

interface SessionState {
  sessions: SessionResponse[];
  activeSession: SessionResponse | null;
  loading: boolean;
  error: string | null;

  createSession: (tenantId: string, userId: string) => Promise<string>;
  pollUntilReady: (sessionId: string) => Promise<void>;
  cancelSession: (sessionId: string) => Promise<void>;
  setActiveSession: (session: SessionResponse | null) => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSession: null,
  loading: false,
  error: null,

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
        if (
          session.status === "SANDBOX_READY" ||
          session.status === "SESSION_RUNNING"
        ) {
          return;
        }
        if (
          session.status === "SESSION_FAILED" ||
          session.status === "SESSION_CANCELLED"
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

  setActiveSession: (session) => set({ activeSession: session }),
  clearError: () => set({ error: null }),
}));
