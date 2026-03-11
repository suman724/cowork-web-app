export interface SessionEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: SessionEvent) => void;

export class SseClient {
  private url: string;
  private eventSource: EventSource | null = null;
  private lastEventId: number = 0;
  private handlers: EventHandler[] = [];
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private shouldReconnect: boolean = true;

  constructor(sessionId: string) {
    const baseUrl =
      import.meta.env.VITE_SESSION_SERVICE_URL || "http://localhost:8000";
    this.url = `${baseUrl}/sessions/${sessionId}/events`;
  }

  connect(): void {
    const url =
      this.lastEventId > 0
        ? `${this.url}?since=${this.lastEventId}`
        : this.url;

    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener(
      "session_event",
      (e: MessageEvent) => {
        const data = JSON.parse(e.data) as SessionEvent;
        if (data.id > this.lastEventId) {
          this.lastEventId = data.id;
        }
        this.handlers.forEach((h) => h(data));
      },
    );

    this.eventSource.addEventListener("gap", (e: MessageEvent) => {
      console.warn("SSE gap detected:", JSON.parse(e.data));
    });

    this.eventSource.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay);
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
    this.eventSource?.close();
    this.eventSource = null;
  }
}
