import { create } from "zustand";
import { api, type TaskResponse } from "../api/client";
import type { SessionEvent } from "../sse/client";

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
  toolName?: string;
  toolCallId?: string;
  status?: "pending" | "streaming" | "complete" | "error";
}

interface ConversationState {
  messages: Message[];
  currentTask: TaskResponse | null;
  isStreaming: boolean;
  processedEventIds: Set<number>;

  sendMessage: (sessionId: string, prompt: string) => Promise<void>;
  handleEvent: (event: SessionEvent) => void;
  clear: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  messages: [],
  currentTask: null,
  isStreaming: false,
  processedEventIds: new Set<number>(),

  sendMessage: async (sessionId: string, prompt: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
    }));

    try {
      const task = await api.createTask(sessionId, prompt);
      set({ currentTask: task });
    } catch (err) {
      set({ isStreaming: false });
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${String(err)}`,
        timestamp: new Date().toISOString(),
        status: "error",
      };
      set((state) => ({ messages: [...state.messages, errMsg] }));
    }
  },

  handleEvent: (event: SessionEvent) => {
    // Deduplicate events by ID
    const { processedEventIds } = get();
    if (processedEventIds.has(event.id)) return;
    processedEventIds.add(event.id);

    const { type } = event.data as { type: string };

    switch (type) {
      case "llm_response_chunk": {
        const chunk = event.data as { type: string; content?: string };
        if (!chunk.content) break;
        set((state) => {
          const msgs = [...state.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === "assistant" && last.status === "streaming") {
            msgs[msgs.length - 1] = {
              ...last,
              content: last.content + chunk.content,
            };
          } else {
            msgs.push({
              id: crypto.randomUUID(),
              role: "assistant",
              content: chunk.content,
              timestamp: new Date().toISOString(),
              status: "streaming",
            });
          }
          return { messages: msgs };
        });
        break;
      }

      case "llm_response_complete": {
        set((state) => {
          const msgs = [...state.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === "assistant" && last.status === "streaming") {
            msgs[msgs.length - 1] = { ...last, status: "complete" };
          }
          return { messages: msgs };
        });
        break;
      }

      case "tool_call_started": {
        const data = event.data as {
          type: string;
          toolName?: string;
          toolCallId?: string;
        };
        const msg: Message = {
          id: crypto.randomUUID(),
          role: "tool",
          content: `Calling ${data.toolName || "tool"}...`,
          timestamp: new Date().toISOString(),
          toolName: data.toolName,
          toolCallId: data.toolCallId,
          status: "pending",
        };
        set((state) => ({ messages: [...state.messages, msg] }));
        break;
      }

      case "tool_call_completed": {
        const data = event.data as {
          type: string;
          toolCallId?: string;
          output?: string;
        };
        set((state) => {
          const msgs = state.messages.map((m) =>
            m.toolCallId === data.toolCallId
              ? {
                  ...m,
                  content: data.output || "Done",
                  status: "complete" as const,
                }
              : m,
          );
          return { messages: msgs };
        });
        break;
      }

      case "task_completed":
      case "task_failed": {
        set({ isStreaming: false, currentTask: null });
        break;
      }
    }
  },

  clear: () =>
    set({
      messages: [],
      currentTask: null,
      isStreaming: false,
      processedEventIds: new Set<number>(),
    }),
}));
