# Single entry point for developers, the agent and CI. `make help` lists the targets.
.DEFAULT_GOAL := help
BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help
help: ## List targets
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-20s %s\n", $$1, $$2}'

.PHONY: up
up: ## Build and start the whole stack; open http://localhost:5173
	docker compose up -d --build --wait

.PHONY: down
down: ## Stop the stack (data in the postgres-data volume is kept)
	docker compose down

.PHONY: logs
logs: ## Follow logs of all services
	docker compose logs -f

.PHONY: dev-deps
dev-deps: ## Start services needed for local development and tests (Postgres, Mailpit)
	docker compose up -d --wait postgres mailpit

.PHONY: install
install: ## Install all dependencies, the Playwright browser and git hooks
	pnpm install
	cd e2e && pnpm exec playwright install chromium
	$(BACKEND) uv sync

.PHONY: check
check: format-check check-tooling check-ci check-backend check-frontend check-e2e ## Run all linters, type checks and tests

.PHONY: format-check
format-check: ## Prettier: check formatting of all files it knows
	pnpm format:check

.PHONY: check-tooling
check-tooling: ## Tests of Claude Code hooks and repository scripts
	pnpm test:tooling

.PHONY: worktime
worktime: ## Working time summed from session markers in docs/decisions.md
	node scripts/worktime.mjs

.PHONY: check-ci
check-ci: ## GitHub Actions workflows: actionlint and existence of action tags (needs network)
	uvx --from actionlint-py actionlint
	node scripts/check-action-refs.mjs

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

.PHONY: check-e2e
check-e2e: ## e2e: ESLint and tsc for the test code (does not run the tests)
	cd e2e && pnpm lint
	cd e2e && pnpm typecheck

.PHONY: e2e
e2e: up ## Start the stack and run Playwright tests against it
	cd e2e && pnpm test

# A separate compose project with its own containers, volumes and ports, so a review does
# not recreate the developer's stack or touch its data. The project name is global to the
# Docker daemon, hence the repository prefix.
REVIEW_POSTGRES_PORT := 5433
REVIEW_COMPOSE := POSTGRES_PORT=$(REVIEW_POSTGRES_PORT) BACKEND_PORT=8001 FRONTEND_PORT=5174 \
	MAILPIT_PORT=8026 MAILPIT_SMTP_PORT=1026 docker compose -p event-registration-review

.PHONY: review-check
review-check: ## make check against the review stack's Postgres (port 5433)
	$(REVIEW_COMPOSE) up -d --wait postgres
	POSTGRES_PORT=$(REVIEW_POSTGRES_PORT) $(MAKE) check

.PHONY: review-up
review-up: ## Separate review stack: http://localhost:5174, Mailpit http://localhost:8026
	$(REVIEW_COMPOSE) up -d --build --wait

.PHONY: review-e2e
review-e2e: review-up ## Start the review stack and run Playwright tests against it
	cd e2e && E2E_BASE_URL=http://localhost:5174 pnpm test

.PHONY: review-down
review-down: ## Remove the review stack with its volumes
	$(REVIEW_COMPOSE) down -v

.PHONY: dev-frontend
dev-frontend: ## Frontend dev server on :5173, proxies /api to localhost:8000
	$(FRONTEND) pnpm dev

.PHONY: dev-backend
dev-backend: ## Backend dev server on :8000 (needs `make dev-deps`)
	$(BACKEND) uv run python manage.py migrate
	$(BACKEND) uv run python manage.py runserver 8000

.PHONY: dev-worker
dev-worker: ## Email worker: sends the outbox to Mailpit, http://localhost:8025 (needs `make dev-deps`)
	$(BACKEND) uv run python manage.py run_worker

.PHONY: fmt
fmt: ## Format all files
	$(FRONTEND) pnpm exec eslint --fix .
	pnpm format
	$(BACKEND) uv run ruff check --fix .
	$(BACKEND) uv run ruff format .
