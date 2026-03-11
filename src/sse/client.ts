export interface SessionEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: SessionEvent) => void;

import { SESSION_SERVICE_URL } from "../config";

export class SseClient {
  private url: string;
  private eventSource: EventSource | null = null;
  private lastEventId: number = 0;
  private handlers: EventHandler[] = [];
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private shouldReconnect: boolean = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string) {
    this.url = `${SESSION_SERVICE_URL}/sessions/${sessionId}/events`;
  }

  connect(): void {
    const url =
      this.lastEventId > 0 ? `${this.url}?since=${this.lastEventId}` : this.url;

    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener("session_event", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as SessionEvent;
      if (data.id > this.lastEventId) {
        this.lastEventId = data.id;
      }
      this.handlers.forEach((h) => h(data));
    });

    this.eventSource.addEventListener("gap", (e: MessageEvent) => {
      console.warn("SSE gap detected:", JSON.parse(e.data));
    });

    this.eventSource.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
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

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
  }
}
