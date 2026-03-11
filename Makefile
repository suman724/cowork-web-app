.PHONY: help install dev build lint format format-check typecheck test check clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

dev: ## Start Vite dev server
	pnpm exec vite

build: ## Production build
	pnpm exec vite build

lint: ## Run ESLint
	pnpm exec eslint src/

format: ## Auto-format code
	pnpm exec prettier --write "src/**/*.{ts,tsx,css}"

format-check: ## Check formatting
	pnpm exec prettier --check "src/**/*.{ts,tsx,css}"

typecheck: ## Run TypeScript type checker
	pnpm exec tsc --noEmit

test: ## Run tests
	pnpm exec vitest run

check: lint format-check typecheck test ## CI gate

clean: ## Remove build artifacts
	rm -rf dist/ node_modules/.vite/
