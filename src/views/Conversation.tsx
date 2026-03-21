import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore, RESUMABLE_STATUSES } from "../stores/sessionStore";
import {
  useConversationStore,
  type Message,
} from "../stores/conversationStore";
import { useFileStore, TERMINAL_STATUSES } from "../stores/fileStore";
import { SseClient } from "../sse/client";

export function ConversationView() {
  const activeSession = useSessionStore((s) => s.activeSession);
  const cancelSession = useSessionStore((s) => s.cancelSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const reconnecting = useSessionStore((s) => s.reconnecting);
  const sessionError = useSessionStore((s) => s.error);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const refreshSession = useSessionStore((s) => s.refreshSession);
  const clearError = useSessionStore((s) => s.clearError);
  const messages = useConversationStore((s) => s.messages);
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const handleEvent = useConversationStore((s) => s.handleEvent);
  const clear = useConversationStore((s) => s.clear);
  const files = useFileStore((s) => s.files);
  const uploads = useFileStore((s) => s.uploads);
  const uploading = useFileStore((s) => s.uploadingCount > 0);
  const uploadError = useFileStore((s) => s.uploadError);
  const refreshFiles = useFileStore((s) => s.refresh);
  const uploadFile = useFileStore((s) => s.upload);
  const clearUploads = useFileStore((s) => s.clearUploads);
  const clearUploadError = useFileStore((s) => s.clearUploadError);
  const downloadFile = useFileStore((s) => s.download);
  const [input, setInput] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<SseClient | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sessionId = activeSession?.sessionId;
  const status = activeSession?.status ?? "";
  const isTerminal = TERMINAL_STATUSES.has(status);
  const isResumable = RESUMABLE_STATUSES.has(status);
  const isDisconnected = isResumable && !reconnecting;

  // Connect SSE
  useEffect(() => {
    if (!sessionId) return;
    const sse = new SseClient(sessionId);
    sse.onEvent(handleEvent);

    // On persistent disconnect, refresh session status to detect termination
    sse.onDisconnect(() => {
      if (sessionId) {
        refreshSession(sessionId);
      }
    });

    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [sessionId, handleEvent, refreshSession]);

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

  // Clear uploads on session change
  useEffect(() => {
    clearUploads();
  }, [sessionId, clearUploads]);

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

  const handleResume = async () => {
    if (!sessionId) return;
    clearError();

    // Reset SSE event tracking — new sandbox will have new event IDs
    sseRef.current?.resetEventId();

    await resumeSession(sessionId);

    // After resume + pollUntilReady completes, SSE auto-reconnect
    // will pick up the new sandbox endpoint
  };

  const handleUpload = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || !sessionId || isTerminal) return;
      clearUploadError();
      for (const file of Array.from(fileList)) {
        uploadFile(sessionId, file);
      }
    },
    [sessionId, isTerminal, uploadFile, clearUploadError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // Reject folder drops — only accept files
      const items = Array.from(e.dataTransfer.items);
      const hasDirectory = items.some(
        (item) => item.webkitGetAsEntry?.()?.isDirectory,
      );
      if (hasDirectory) return;
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

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
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDisconnected && (
            <button
              onClick={handleResume}
              className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
            >
              Resume
            </button>
          )}
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            {showFiles ? "Hide Files" : "Files"}
          </button>
        </div>
      </div>

      {/* Reconnecting banner */}
      {reconnecting && (
        <div className="px-4 py-2 bg-yellow-900/30 border-b border-yellow-800/50 text-yellow-200 text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          Reconnecting to session...
        </div>
      )}

      {/* Session error banner */}
      {sessionError && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-red-200 text-sm flex items-center justify-between">
          <span>{sessionError}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-200 ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Disconnected banner */}
      {isDisconnected && !reconnecting && (
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700 text-gray-300 text-sm flex items-center justify-between">
          <span>
            Session disconnected ({status.replace(/_/g, " ").toLowerCase()}).
            Your conversation is saved.
          </span>
          <button
            onClick={handleResume}
            className="text-blue-400 hover:text-blue-300 ml-2"
          >
            Resume
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Messages + drop zone */}
        <div
          className={`flex-1 flex flex-col relative ${dragOver ? "ring-2 ring-blue-500 ring-inset" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {dragOver && (
            <div className="absolute inset-0 bg-blue-500/10 z-10 flex items-center justify-center pointer-events-none">
              <p className="text-blue-400 text-lg font-medium">
                Drop files to upload
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Upload error banner */}
          {uploadError && (
            <div className="mx-4 mb-2 p-2 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm flex items-center justify-between">
              <span>{uploadError}</span>
              <button
                onClick={clearUploadError}
                className="text-red-400 hover:text-red-200 ml-2"
              >
                &times;
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isTerminal || uploading}
                title="Upload file"
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-gray-400 transition-colors"
              >
                {uploading ? "..." : "\u2191"}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isDisconnected
                    ? "Session disconnected — click Resume to continue"
                    : "Type a message..."
                }
                rows={1}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500"
                disabled={isStreaming || isDisconnected || reconnecting}
              />
              <button
                onClick={handleSend}
                disabled={
                  !input.trim() || isStreaming || isDisconnected || reconnecting
                }
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
            {files.length === 0 && uploads.length === 0 ? (
              <p className="text-sm text-gray-600">No files yet</p>
            ) : (
              <div className="space-y-1">
                {uploads.map((u) => (
                  <div key={`upload-${u.path}`} className="text-sm p-2 rounded">
                    <div className="text-gray-300 truncate">{u.path}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {u.sandboxSynced ? (
                        <span className="text-green-500">
                          Synced to sandbox
                        </span>
                      ) : u.persisted ? (
                        <span className="text-yellow-500">
                          Saved. Will sync when sandbox is ready.
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {files
                  .filter((f) => !uploads.some((u) => u.path === f.path))
                  .map((f) => (
                    <div
                      key={f.path}
                      onClick={() =>
                        sessionId && downloadFile(sessionId, f.path)
                      }
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
