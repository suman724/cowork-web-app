# CLAUDE.md

## Purpose

`cowork-web-app` is the web frontend for cowork cloud sandbox sessions. A React SPA that communicates with Session Service via REST API and SSE for real-time event streaming.

## Tech Stack

TypeScript, React 19, Vite, Tailwind CSS v4, Zustand, pnpm

## Architecture

```
src/
  api/         — Session Service REST client (fetch-based, typed)
  sse/         — SSE client with auto-reconnect, Last-Event-ID, typed events
  stores/      — Zustand stores: sessionStore, conversationStore, fileStore
  views/       — Page components: SessionList, Conversation
  App.tsx      — Root component with view routing
```

### Key Patterns

- All API calls go through Session Service proxy endpoints (`/sessions/{id}/rpc`, `/sessions/{id}/events`, etc.)
- SSE for real-time events (LLM streaming, tool calls, status changes) with auto-reconnect, replay via `?since=` query param, and `onDisconnect` callback for session termination detection
- Zustand for client-side state — session lifecycle, conversation messages, workspace files
- Tailwind CSS v4 for styling (imported via `@import "tailwindcss"` in index.css)

### Data Flow

1. User clicks "New Session" → `POST /sessions` (cloud_sandbox) → poll until `SANDBOX_READY`
2. Conversation view opens → SSE connection to `/sessions/{id}/events`
3. User sends message → `POST /sessions/{id}/tasks` + `POST /sessions/{id}/rpc` (StartTask)
4. SSE events stream back: `llm_response_chunk`, `tool_call_started`, `tool_call_completed`, `task_completed`
5. File operations via `/sessions/{id}/upload`, `/sessions/{id}/files`
6. Session disconnect: SSE detects persistent failures → refresh session status → show disconnected banner
7. Resume: User clicks "Resume" → `POST /sessions/{id}/resume` → poll until `SANDBOX_READY` → SSE reconnects to new sandbox with full history

## Environment Variables

- `VITE_SESSION_SERVICE_URL` — Session Service URL (default: `http://localhost:8000`)

## Makefile Targets

| Target | Purpose |
|--------|---------|
| `make dev` | Start Vite dev server |
| `make build` | Production build |
| `make lint` | ESLint |
| `make format` | Prettier format |
| `make format-check` | Check formatting |
| `make typecheck` | tsc --noEmit |
| `make test` | Vitest |
| `make check` | CI gate: lint + format-check + typecheck + test |

## Local Development

```bash
# Prerequisites: LocalStack + backend services running
pnpm install
make dev  # http://localhost:5173
```

## Design Doc

See `cowork-infra/docs/components/web-execution-plan.md` (Step 10).
