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
