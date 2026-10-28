# Single entry point for developers, the agent and CI. `make help` lists the targets.
.DEFAULT_GOAL := help
BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help
help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-20s %s\n", $$1, $$2}'

.PHONY: dev-deps
dev-deps: ## Start services needed for local development and tests (Postgres)
	docker compose up -d --wait postgres

.PHONY: install
install: ## Install all dependencies and git hooks
	pnpm install
	$(BACKEND) uv sync

.PHONY: check
check: format-check check-backend check-frontend ## Run all linters, type checks and tests

.PHONY: format-check
format-check: ## Prettier: check formatting of all files it knows
	pnpm format:check

.PHONY: check-backend
check-backend: lint-backend typecheck-backend migrations-check schema-check test-backend ## Backend: lint, types, migrations, schema, tests

.PHONY: lint-backend
lint-backend: ## Backend: ruff lint and format check
	$(BACKEND) uv run ruff check .
	$(BACKEND) uv run ruff format --check .

.PHONY: typecheck-backend
typecheck-backend: ## Backend: mypy
	$(BACKEND) uv run mypy .

.PHONY: migrations-check
migrations-check: ## Backend: fail if models changed without a migration
	$(BACKEND) uv run python manage.py makemigrations --check --dry-run

SPECTACULAR := uv run python manage.py spectacular --validate --fail-on-warn

API_TYPES := frontend/src/shared/api/schema.d.ts

.PHONY: schema
schema: ## Regenerate the OpenAPI schema and frontend API types after an API change
	$(BACKEND) $(SPECTACULAR) --file openapi.yaml
	$(FRONTEND) pnpm gen:api

.PHONY: schema-check
schema-check: ## Fail if openapi.yaml or frontend API types are out of date, or a view is undocumented
	@$(BACKEND) $(SPECTACULAR) | diff -u openapi.yaml - \
		|| (echo "backend/openapi.yaml is out of date: run 'make schema' and commit it" >&2; exit 1)
	@$(FRONTEND) pnpm exec openapi-typescript ../backend/openapi.yaml 2>/dev/null | diff -u ../$(API_TYPES) - \
		|| (echo "$(API_TYPES) is out of date: run 'make schema' and commit it" >&2; exit 1)

.PHONY: test-backend
test-backend: ## Backend: pytest (needs `make dev-deps`)
	$(BACKEND) uv run pytest

.PHONY: check-frontend
check-frontend: lint-frontend typecheck-frontend test-frontend ## Frontend: lint, types, tests

.PHONY: lint-frontend
lint-frontend: ## Frontend: ESLint (with type-aware rules and FSD boundaries)
	$(FRONTEND) pnpm lint

.PHONY: typecheck-frontend
typecheck-frontend: ## Frontend: vue-tsc
	$(FRONTEND) pnpm typecheck

.PHONY: test-frontend
test-frontend: ## Frontend: Vitest unit and component tests
	$(FRONTEND) pnpm test

.PHONY: dev-frontend
dev-frontend: ## Frontend dev server on :5173, proxies /api to localhost:8000
	$(FRONTEND) pnpm dev

.PHONY: dev-backend
dev-backend: ## Backend dev server on :8000 (needs `make dev-deps`)
	$(BACKEND) uv run python manage.py migrate
	$(BACKEND) uv run python manage.py runserver 8000

.PHONY: fmt
fmt: ## Format all files
	$(FRONTEND) pnpm exec eslint --fix .
	pnpm format
	$(BACKEND) uv run ruff check --fix .
	$(BACKEND) uv run ruff format .
