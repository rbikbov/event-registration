# Single entry point for developers, the agent and CI. `make help` lists the targets.
.DEFAULT_GOAL := help
BACKEND := cd backend &&

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
check: check-backend ## Run all linters, type checks and tests

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

.PHONY: schema
schema: ## Regenerate the OpenAPI schema (backend/openapi.yaml) after an API change
	$(BACKEND) $(SPECTACULAR) --file openapi.yaml

.PHONY: schema-check
schema-check: ## Backend: fail if openapi.yaml is out of date or any view is undocumented
	@$(BACKEND) $(SPECTACULAR) | diff -u openapi.yaml - \
		|| (echo "openapi.yaml is out of date: run 'make schema' and commit it" >&2; exit 1)

.PHONY: test-backend
test-backend: ## Backend: pytest (needs `make dev-deps`)
	$(BACKEND) uv run pytest

.PHONY: fmt
fmt: ## Format all files
	pnpm format
	$(BACKEND) uv run ruff check --fix .
	$(BACKEND) uv run ruff format .
