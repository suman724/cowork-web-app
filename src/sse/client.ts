export interface SessionEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: SessionEvent) => void;
type DisconnectHandler = () => void;

import { SESSION_SERVICE_URL } from "../config";

export class SseClient {
  private url: string;
  private eventSource: EventSource | null = null;
  private lastEventId: number = 0;
  private handlers: EventHandler[] = [];
  private disconnectHandlers: DisconnectHandler[] = [];
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private shouldReconnect: boolean = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors: number = 0;

  constructor(sessionId: string) {
    this.url = `${SESSION_SERVICE_URL}/sessions/${sessionId}/events`;
  }

  connect(): void {
    // Close existing connection before creating a new one (prevents listener accumulation on reconnect)
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const url =
      this.lastEventId > 0 ? `${this.url}?since=${this.lastEventId}` : this.url;

    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener("session_event", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as SessionEvent;
      if (data.id > this.lastEventId) {
        this.lastEventId = data.id;
      }
      this.consecutiveErrors = 0;
      this.handlers.forEach((h) => h(data));
    });

    this.eventSource.addEventListener("gap", (e: MessageEvent) => {
      console.warn("SSE gap detected:", JSON.parse(e.data));
    });

    this.eventSource.onopen = () => {
      this.reconnectDelay = 1000;
      this.consecutiveErrors = 0;
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.consecutiveErrors++;

      // Notify disconnect handlers after multiple consecutive failures
      // (single failure could be a transient network blip)
      if (this.consecutiveErrors >= 3) {
        this.disconnectHandlers.forEach((h) => h());
      }

      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
      }
    };
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.push(handler);
    return () => {
      this.disconnectHandlers = this.disconnectHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
  }

  /** Reset the last event ID — used when resuming a session on a new sandbox. */
  resetEventId(): void {
    this.lastEventId = 0;
  }
}
