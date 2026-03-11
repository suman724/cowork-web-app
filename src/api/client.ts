const BASE_URL =
  import.meta.env.VITE_SESSION_SERVICE_URL || "http://localhost:8000";

export interface CreateSessionRequest {
  executionEnvironment: "cloud_sandbox";
  tenantId: string;
  userId: string;
}

export interface SessionResponse {
  sessionId: string;
  status: string;
  sandboxEndpoint?: string;
  createdAt: string;
}

export interface TaskResponse {
  taskId: string;
  sessionId: string;
  status: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API error ${status}: ${body}`);
  }
}

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

class SessionApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async createSession(req: CreateSessionRequest): Promise<SessionResponse> {
    const resp = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    return resp.json();
  }

  async getSession(sessionId: string): Promise<SessionResponse> {
    const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}`);
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    return resp.json();
  }

  async cancelSession(sessionId: string): Promise<void> {
    const resp = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/cancel`,
      { method: "POST" },
    );
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
  }

  async sendRpc(
    sessionId: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const resp = await fetch(`${this.baseUrl}/sessions/${sessionId}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    const data = await resp.json();
    if (data.error) throw new RpcError(data.error.code, data.error.message);
    return data.result;
  }

  async createTask(
    sessionId: string,
    prompt: string,
  ): Promise<TaskResponse> {
    const taskId = crypto.randomUUID();
    const resp = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, prompt }),
      },
    );
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    const task: TaskResponse = await resp.json();

    // Start task in agent-runtime via RPC
    await this.sendRpc(sessionId, "StartTask", { taskId, prompt });
    return task;
  }

  async uploadFile(sessionId: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    const resp = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/upload`,
      { method: "POST", body: formData },
    );
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
  }

  async listFiles(
    sessionId: string,
  ): Promise<{
    files: Array<{ path: string; size: number; contentType: string }>;
  }> {
    const resp = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/files`,
    );
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    return resp.json();
  }

  async downloadFile(sessionId: string, path: string): Promise<Blob> {
    const resp = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/files/${path}`,
    );
    if (!resp.ok) throw new ApiError(resp.status, await resp.text());
    return resp.blob();
  }
}

export const api = new SessionApiClient();
