# Single entry point for developers, the agent and CI. `make help` lists the targets.
.DEFAULT_GOAL := help
BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help
help: ## List targets
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-24s %s\n", $$1, $$2}'

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
# Target-specific variables reach prerequisites: `up` builds the frontend for the gateway.
e2e: export FRONTEND_TARGET := gateway
e2e: up ## Start the stack with the nginx gateway and run Playwright tests against it
	cd e2e && pnpm test

# Slot stacks: separate compose projects with their own containers, volumes and ports, so
# the developer (slot 0, `make up`), the agent (slot 1) and the reviewer (slot 2) can run
# at the same time. Every port is the default plus the slot number. The project name is
# global to the Docker daemon, hence the repository prefix.
SLOT ?= 1
slot_port = $(shell echo $$(($(1) + $(SLOT))))
STACK_POSTGRES_PORT = $(call slot_port,5432)
STACK_FRONTEND_PORT = $(call slot_port,5173)
STACK_COMPOSE = POSTGRES_PORT=$(STACK_POSTGRES_PORT) BACKEND_PORT=$(call slot_port,8000) \
	FRONTEND_PORT=$(STACK_FRONTEND_PORT) MAILPIT_PORT=$(call slot_port,8025) \
	MAILPIT_SMTP_PORT=$(call slot_port,1025) docker compose -p event-registration-s$(SLOT)

.PHONY: stack-slot
stack-slot:
	@case "$(SLOT)" in [1-9]) ;; *) echo "SLOT must be 1-9; slot 0 is make up" >&2; exit 1 ;; esac

.PHONY: stack-postgres
stack-postgres: stack-slot
	$(STACK_COMPOSE) up -d --wait postgres

.PHONY: stack-check
stack-check: stack-postgres ## make check against the Postgres of slot SLOT (default 1)
	POSTGRES_PORT=$(STACK_POSTGRES_PORT) $(MAKE) check

.PHONY: stack-check-backend
stack-check-backend: stack-postgres ## make check-backend against the Postgres of slot SLOT
	POSTGRES_PORT=$(STACK_POSTGRES_PORT) $(MAKE) check-backend

.PHONY: stack-up
stack-up: stack-slot ## Stack of slot SLOT: frontend on 5173+SLOT, Mailpit on 8025+SLOT
	$(STACK_COMPOSE) up -d --build --wait

.PHONY: stack-e2e
stack-e2e: export FRONTEND_TARGET := gateway
stack-e2e: stack-up ## Start the stack of slot SLOT with the gateway and run Playwright tests
	cd e2e && E2E_BASE_URL=http://localhost:$(STACK_FRONTEND_PORT) \
		E2E_MAILPIT_URL=http://localhost:$(call slot_port,8025) pnpm test

.PHONY: stack-down
stack-down: stack-slot ## Remove the stack of slot SLOT with its volumes
	$(STACK_COMPOSE) down -v

# A detached worktree at REF for the reviewer, so it checks exactly the reviewed commits
# while the working tree keeps changing. Dependencies come from the pnpm and uv caches.
# A half-installed worktree would block the next run, so it is removed on failure.
REVIEW_WORKTREE := .claude/worktrees/review

.PHONY: review-worktree
review-worktree: ## Worktree for the reviewer at REF in .claude/worktrees/review
	@test -n "$(REF)" || { echo "usage: make review-worktree REF=<commit>" >&2; exit 1; }
	git worktree add --detach $(REVIEW_WORKTREE) $(REF)
	(cd $(REVIEW_WORKTREE) && pnpm install --frozen-lockfile --prefer-offline \
		&& cd backend && uv sync --frozen) \
		|| { git worktree remove --force $(REVIEW_WORKTREE); exit 1; }

.PHONY: review-worktree-remove
review-worktree-remove: ## Remove the reviewer's worktree
	git worktree remove $(REVIEW_WORKTREE)

.PHONY: dev-frontend
dev-frontend: ## Frontend dev server on :5173, proxies /api to localhost:8000
	$(FRONTEND) pnpm dev

# The reloader watches only the code: watching all of backend/ (.venv included) costs it
# 30-40% of a CPU core while idle. A new Django app is added here.
RELOAD_DIRS := $(foreach dir,config accounts events registrations emails,--reload-dir $(dir))

.PHONY: dev-backend
dev-backend: ## Backend dev server on :8000 (needs `make dev-deps`)
	$(BACKEND) uv run python manage.py migrate
	$(BACKEND) uv run uvicorn config.asgi:application --reload --port 8000 \
		--timeout-graceful-shutdown 3 $(RELOAD_DIRS)

.PHONY: dev-worker
dev-worker: ## Email worker: sends the outbox to Mailpit, http://localhost:8025 (needs `make dev-deps`)
	$(BACKEND) uv run python manage.py run_worker

.PHONY: fmt
fmt: ## Format all files
	$(FRONTEND) pnpm exec eslint --fix .
	pnpm format
	$(BACKEND) uv run ruff check --fix .
	$(BACKEND) uv run ruff format .
