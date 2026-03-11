# cowork-web-app

Web frontend for cowork cloud sandbox sessions.

## Setup

```bash
pnpm install
make dev
```

## Local Development

Requires backend services running:

```bash
# Terminal 1: LocalStack
docker-compose up -d

# Terminal 2-4: Backend services
cd cowork-session-service && make run
cd cowork-workspace-service && make run
cd cowork-policy-service && make run

# Terminal 5: Web app
cd cowork-web-app && make dev
```

Open http://localhost:5173. Create a session — it will auto-provision a sandbox.

## Features

- **Session management**: Create, monitor, and cancel cloud sandbox sessions
- **Conversation**: Send prompts, stream LLM responses and tool outputs via SSE
- **File upload**: Upload files via button or drag-and-drop. Files persist to S3 via Workspace Service and sync to sandbox when ready. Shows sync status ("Synced to sandbox" / "Saved. Will sync when sandbox is ready.")
- **File browser**: List and download workspace files from the sidebar

## Available Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start dev server |
| `make build` | Production build |
| `make lint` | Run ESLint |
| `make format` | Format with Prettier |
| `make typecheck` | TypeScript check |
| `make test` | Run tests |
| `make check` | CI gate |
