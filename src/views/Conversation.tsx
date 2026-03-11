import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import {
  useConversationStore,
  type Message,
} from "../stores/conversationStore";
import { useFileStore } from "../stores/fileStore";
import { SseClient } from "../sse/client";

export function ConversationView() {
  const activeSession = useSessionStore((s) => s.activeSession);
  const cancelSession = useSessionStore((s) => s.cancelSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const messages = useConversationStore((s) => s.messages);
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const handleEvent = useConversationStore((s) => s.handleEvent);
  const clear = useConversationStore((s) => s.clear);
  const files = useFileStore((s) => s.files);
  const refreshFiles = useFileStore((s) => s.refresh);
  const [input, setInput] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<SseClient | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionId = activeSession?.sessionId;

  // Connect SSE
  useEffect(() => {
    if (!sessionId) return;
    const sse = new SseClient(sessionId);
    sse.onEvent(handleEvent);
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [sessionId, handleEvent]);

  // Auto-scroll (throttled to avoid layout thrash during streaming)
  const messageCount = messages.length;
  const lastMessageStatus = messages[messages.length - 1]?.status;
  useEffect(() => {
    if (scrollTimerRef.current) return;
    scrollTimerRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      scrollTimerRef.current = null;
    }, 100);
  }, [messageCount, lastMessageStatus]);

  // Refresh files when sidebar opens
  useEffect(() => {
    if (showFiles && sessionId) refreshFiles(sessionId);
  }, [showFiles, sessionId, refreshFiles]);

  const handleSend = async () => {
    if (!input.trim() || !sessionId || isStreaming) return;
    const prompt = input.trim();
    setInput("");
    await sendMessage(sessionId, prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = async () => {
    if (sessionId) {
      sseRef.current?.disconnect();
      try {
        await cancelSession(sessionId);
      } catch {
        /* best effort */
      }
    }
    clear();
    setActiveSession(null);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-gray-200"
          >
            &larr; Back
          </button>
          <span className="text-sm text-gray-500 font-mono">
            {sessionId?.slice(0, 8)}...
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
            {activeSession?.status}
          </span>
        </div>
        <button
          onClick={() => setShowFiles(!showFiles)}
          className="text-sm text-gray-400 hover:text-gray-200"
        >
          {showFiles ? "Hide Files" : "Files"}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500"
                disabled={isStreaming}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* File sidebar */}
        {showFiles && (
          <div className="w-72 border-l border-gray-800 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-gray-400 mb-3">
              Workspace Files
            </h3>
            {files.length === 0 ? (
              <p className="text-sm text-gray-600">No files yet</p>
            ) : (
              <div className="space-y-1">
                {files.map((f) => (
                  <div
                    key={f.path}
                    className="text-sm text-gray-300 p-2 hover:bg-gray-800 rounded cursor-pointer truncate"
                  >
                    {f.path}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-blue-600 rounded-lg px-4 py-2">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
          <p className="text-xs text-gray-500 mb-1">
            {message.toolName || "Tool"}
          </p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] bg-gray-900 rounded-lg px-4 py-2">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        {message.status === "streaming" && (
          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}
