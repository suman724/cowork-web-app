import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConversationStore } from "../conversationStore";
import type { SessionEvent } from "../../sse/client";

vi.mock("../../api/client", () => {
  const createTask = vi.fn();
  return {
    api: { createTask },
  };
});

import { api } from "../../api/client";

const mockApi = api as {
  createTask: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  useConversationStore.getState().clear();
});

describe("conversationStore", () => {
  describe("sendMessage", () => {
    it("adds user message to messages", async () => {
      mockApi.createTask.mockResolvedValue({
        taskId: "t-1",
        sessionId: "s-1",
        status: "RUNNING",
      });

      await useConversationStore.getState().sendMessage("s-1", "Hello");

      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("user");
      expect(state.messages[0].content).toBe("Hello");
    });
  });

  describe("handleEvent", () => {
    it("creates streaming message on first llm_response_chunk", () => {
      const event: SessionEvent = {
        id: 1,
        type: "session_event",
        data: { type: "llm_response_chunk", content: "Hello" },
      };

      useConversationStore.getState().handleEvent(event);

      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("assistant");
      expect(state.messages[0].content).toBe("Hello");
      expect(state.messages[0].status).toBe("streaming");
    });

    it("appends to existing streaming message on subsequent chunks", () => {
      const event1: SessionEvent = {
        id: 1,
        type: "session_event",
        data: { type: "llm_response_chunk", content: "Hello" },
      };
      const event2: SessionEvent = {
        id: 2,
        type: "session_event",
        data: { type: "llm_response_chunk", content: " world" },
      };

      useConversationStore.getState().handleEvent(event1);
      useConversationStore.getState().handleEvent(event2);

      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe("Hello world");
    });

    it("clears streaming state on task_completed", () => {
      // First create a streaming message
      useConversationStore.getState().handleEvent({
        id: 1,
        type: "session_event",
        data: { type: "llm_response_chunk", content: "Hello" },
      });

      useConversationStore.setState({ isStreaming: true });

      useConversationStore.getState().handleEvent({
        id: 2,
        type: "session_event",
        data: { type: "task_completed" },
      });

      const state = useConversationStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.currentTask).toBeNull();
    });

    it("deduplicates events with the same id", () => {
      const event: SessionEvent = {
        id: 1,
        type: "session_event",
        data: { type: "llm_response_chunk", content: "Hello" },
      };

      useConversationStore.getState().handleEvent(event);
      useConversationStore.getState().handleEvent(event);

      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe("Hello");
    });
  });
});
