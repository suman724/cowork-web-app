import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SseClient } from "../client";

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (e: unknown) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  close() {
    this.closed = true;
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

vi.stubGlobal("EventSource", MockEventSource);

vi.mock("../../config", () => ({
  SESSION_SERVICE_URL: "http://localhost:8000",
}));

beforeEach(() => {
  MockEventSource.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SseClient", () => {
  it("connect creates EventSource with correct URL", () => {
    const client = new SseClient("s-123");
    client.connect();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe(
      "http://localhost:8000/sessions/s-123/events",
    );

    client.disconnect();
  });

  it("disconnect sets shouldReconnect to false and closes EventSource", () => {
    const client = new SseClient("s-123");
    client.connect();

    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    client.disconnect();
    expect(es.closed).toBe(true);
  });

  it("onEvent registers handler and returns unsubscribe function", () => {
    const client = new SseClient("s-123");
    const handler = vi.fn();

    const unsub = client.onEvent(handler);
    client.connect();

    // Simulate an event
    const es = MockEventSource.instances[0];
    const sessionEventHandlers = es.listeners["session_event"];
    expect(sessionEventHandlers).toBeDefined();

    sessionEventHandlers[0]({
      data: JSON.stringify({ id: 1, type: "test", data: {} }),
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Unsubscribe and verify handler is removed
    unsub();
    // Create a new connection to test handler is gone
    // Actually test by firing another event - handler should not be called
    // The handler array is already modified, so existing EventSource listener
    // will iterate an empty handlers list
    sessionEventHandlers[0]({
      data: JSON.stringify({ id: 2, type: "test", data: {} }),
    });
    expect(handler).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  it("closes existing EventSource before creating new one on reconnect", () => {
    const client = new SseClient("s-123");
    client.connect();

    const firstEs = MockEventSource.instances[0];
    expect(firstEs.closed).toBe(false);

    // Manually call connect again (simulating reconnect)
    client.connect();

    expect(firstEs.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);

    client.disconnect();
  });
});
