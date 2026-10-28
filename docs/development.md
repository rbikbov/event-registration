# Руководство разработчика

Всё, что нужно, чтобы начать работать с репозиторием: что установить, какие команды
есть, что проверяется автоматически и почему. Документ обновляется вместе с кодом: новая
команда, инструмент или проверка появляются здесь в том же коммите.

Как запустить проект только для просмотра — в [README](../README.md).

## Что установить

| Инструмент       | Версия                                     | Зачем                                                                                      | Как поставить                                                                                 |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Node.js          | 22 (см. `.nvmrc`)                          | git-хуки, форматирование                                                                   | `nvm install` в корне репозитория                                                             |
| pnpm             | 10 (см. `packageManager` в `package.json`) | зависимости Node                                                                           | `corepack enable` — версию возьмёт из `package.json`                                          |
| uv               | 0.13+                                      | Python и зависимости backend; нужную версию Python (`backend/.python-version`) скачает сам | `curl -LsSf https://astral.sh/uv/install.sh \| sh`                                            |
| Docker + Compose | Docker Desktop или Docker Engine           | Postgres и остальные сервисы                                                               | WSL: в Docker Desktop включить Settings → Resources → WSL Integration для своего дистрибутива |
| make             | любая (GNU)                                | единая точка входа для команд                                                              | обычно уже есть; Debian/Ubuntu: `apt install make`                                            |

## Первая настройка

```sh
make install    # pnpm install + uv sync в backend/
make dev-deps   # Postgres в Docker
make check      # всё должно пройти
```

`pnpm install` (внутри `make install`) кроме зависимостей устанавливает git-хуки: скрипт
`prepare` → husky прописывает `core.hooksPath=.husky/_`. Без него хуки не работают и
проверки сработают только в CI.

## Команды

Основной вход — `make`; `make help` печатает список целей с описанием. Если команда
появилась — она должна быть в Makefile и в этой таблице.

| Команда                   | Что делает                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `make up`                 | весь стек в Docker: postgres, backend, frontend; <http://localhost:5173>                 |
| `make down`               | остановить стек (данные БД сохраняются)                                                  |
| `make logs`               | логи всех сервисов                                                                       |
| `make install`            | установить зависимости Node и backend, git-хуки                                          |
| `make dev-deps`           | поднять Postgres в Docker и дождаться готовности                                         |
| `make check`              | всё: форматирование, линтеры, проверки типов, схема, тесты backend и frontend            |
| `make check-backend`      | то же только для backend                                                                 |
| `make lint-backend`       | ruff: линтер и проверка форматирования                                                   |
| `make typecheck-backend`  | mypy (strict)                                                                            |
| `make migrations-check`   | падает, если модели изменены, а миграция не создана                                      |
| `make schema`             | пересобрать `backend/openapi.yaml` и типы фронтенда `schema.d.ts` после изменения API    |
| `make schema-check`       | падает, если `openapi.yaml` или `schema.d.ts` устарели или у view нет описания для схемы |
| `make test-backend`       | pytest (нужен `make dev-deps`)                                                           |
| `make check-frontend`     | ESLint, vue-tsc, Vitest                                                                  |
| `make lint-frontend`      | ESLint: правила на типах и границы слоёв FSD                                             |
| `make typecheck-frontend` | vue-tsc                                                                                  |
| `make test-frontend`      | Vitest: unit- и компонентные тесты                                                       |
| `make format-check`       | Prettier: проверка форматирования всех файлов                                            |
| `make dev-backend`        | применить миграции и запустить backend на :8000 (нужен `make dev-deps`)                  |
| `make dev-frontend`       | dev-сервер фронтенда на :5173, `/api` проксируется на :8000                              |
| `make fmt`                | отформатировать всё: `eslint --fix`, Prettier, `ruff check --fix`, `ruff format`         |
| `pnpm test:tooling`       | тесты хуков Claude Code и скриптов `scripts/` (`node:test`)                              |

Команды Django — из `backend/` через uv: `uv run python manage.py <команда>`. Например,
`uv run python manage.py makemigrations`, `uv run python manage.py createsuperuser`.

## Что проверяется автоматически

| Когда        | Хук          | Что проверяет                                                                                                                                                                                                                                                                    |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git commit` | `pre-commit` | lint-staged по изменённым файлам: `*.py` в `backend/` — `ruff check --fix` и `ruff format`; `ts`, `vue`, `js` во `frontend/` — `eslint --fix` и Prettier; `mjs`, `json`, `md`, `yml` — Prettier. Исправления добавляются в коммит, неисправимые ошибки ruff останавливают коммит |
| `git commit` | `commit-msg` | commitlint: сообщение коммита в формате Conventional Commits                                                                                                                                                                                                                     |
| `git push`   | `pre-push`   | `scripts/pre-push.mjs`: проверки только тех частей, которые меняют отправляемые коммиты (см. ниже)                                                                                                                                                                               |

Как `pre-push` выбирает проверки:

| Изменены файлы                                                                                                | Что запускается                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `backend/**`                                                                                                  | `make dev-deps check-backend` — поднимет Postgres, если он не запущен |
| `frontend/**`                                                                                                 | `make check-frontend`                                                 |
| `.claude/hooks/**`, `scripts/**`                                                                              | `pnpm test:tooling`                                                   |
| `Makefile`, `docker-compose.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.prettierrc.json` | проверки всех частей                                                  |
| только документация                                                                                           | ничего                                                                |

Отправляемые коммиты — от того, что уже есть на remote, до отправляемого. Ветка, которой
ещё нет на remote, сравнивается с тем, что есть на любом remote; если remote пуст —
проверяется всё. Новая часть репозитория (например, e2e) добавляется в `PARTS` в
`scripts/pre-push.mjs` вместе со строкой в `pre-push.test.mjs`.

Хуки не обходим (`--no-verify`): если проверка мешает, исправляем причину или обсуждаем
правило.

## Коммиты

Формат — [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <subject>`, по-английски, в повелительном наклонении.

```text
feat(backend): add waitlist promotion on cancel
fix(frontend): show error when check-in code is empty
docs: describe pre-push hook
```

- Типы: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`,
  `revert`.
- Scope — часть репозитория: `backend`, `frontend`, `e2e`, `infra`; для изменений во всём
  репозитории не указывается.
- Один коммит — одно логическое изменение, после которого проект собирается и тесты
  проходят.

## Хуки Claude Code

Настроены в `.claude/settings.json`, скрипты — в `.claude/hooks/` (Node, без зависимостей).
Действуют только для агента, на ручную работу не влияют.

| Событие                    | Скрипт                 | Что делает                                                                                                                                      |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`             | `session-start.mjs`    | выводит агенту фазу «в работе» из `docs/roadmap.md` и последние коммиты                                                                         |
| `PreToolUse` (Bash)        | `guard-bash.mjs`       | блокирует обход git-хуков (`--no-verify`, `-n`, `HUSKY=0`, смена `core.hooksPath`), force push и `--amend` отправленного коммита                |
| `PreToolUse` (Edit/Write)  | `guard-migrations.mjs` | блокирует правку закоммиченных миграций `backend/*/migrations/NNNN_*.py` — исправление идёт новой миграцией ([правила](rules/db-migrations.md)) |
| `PostToolUse` (Edit/Write) | `format-file.mjs`      | форматирует изменённый файл, как `pre-commit`: Prettier или ruff; оставшиеся ошибки ruff показывает агенту                                      |

Как устроен `guard-bash.mjs`: из команды сначала вырезаются heredoc и строки в кавычках
(иначе `-n` в тексте сообщения коммита сработал бы как флаг), затем каждая простая команда
(разделители — перевод строки, `;`, `|`, `&`) проверяется отдельно. Новый блокируемый или
разрешённый случай — новая строка в `guard-bash.test.mjs`.

Ограничение: хуки на Edit/Write не видят правку файла через shell (`sed -i`, `>`). Правила
от этого не перестают действовать, но в этом случае их соблюдение — на агенте и ревью.

Хуки подхватываются при изменении `.claude/settings.json` без перезапуска сессии. Если
хук блокирует то, что блокировать не должен, — исправить скрипт и добавить случай в тест, а
не обходить хук.

## Прогресс

Где работа сейчас и что дальше — [roadmap.md](roadmap.md): фазы со статусом и критериями,
задачи с отметками. Задача отмечается в том же коммите, который её выполняет.

## Решения

Любой выбор, влияющий на код, структуру, стек или сроки, записывается в
[decisions.md](decisions.md) в том же коммите, что и изменение. Формат и правила — в
[AGENTS.md](../AGENTS.md).

## Backend

- Структура: `backend/config/` — настройки, корневые URL, ASGI; приложения Django — папки
  рядом (`accounts/`).
- Настройки читают переменные окружения только в `config/settings.py`. Значения по умолчанию
  совпадают с сервисами `docker compose`, поэтому локально переменные задавать не нужно.
- Своя модель пользователя `accounts.User`: вход по email, username нет. Email хранится в
  нижнем регистре (приводится в `save()`), поэтому обычный `unique` работает без учёта
  регистра. Создать организатора: `uv run python manage.py createsuperuser`.
- Тесты — pytest + pytest-django, на настоящем Postgres (`make dev-deps`): блокировки,
  `SKIP LOCKED` и `LISTEN/NOTIFY` на SQLite не проверить. pytest-django создаёт отдельную
  тестовую БД `test_<имя>` и удаляет её после прогона. Тест, которому нужна БД, помечается
  `pytest.mark.django_db`.
- mypy в режиме `strict` с плагинами django-stubs и drf-stubs. Generic-классы Django
  (`UserAdmin[User]`) работают в runtime благодаря `django_stubs_ext.monkeypatch()` в
  настройках. `# type: ignore` — только с кодом ошибки и причиной в комментарии.
- API описан OpenAPI-схемой `backend/openapi.yaml` (drf-spectacular), она закоммичена. По
  ней фронтенд получает типы. После изменения serializer'а, view или URL — `make schema` и
  закоммитить схему вместе с кодом; `make schema-check` (входит в `make check`) иначе
  упадёт и покажет diff. Генерация идёт с `--fail-on-warn`: view без описания ответа или
  неоднозначное имя enum — ошибка, а не тихий пробел в схеме. Нестандартные ответы
  описываются через `@extend_schema` (пример — `config/health.py`). Prettier схему не
  трогает (`.prettierignore`), иначе она никогда не совпала бы с генерацией.
- `GET /api/health/` — проверка процесса и БД: 200 `{"status": "ok", "database": "ok"}` или
  503, если БД недоступна. Используется healthcheck'ами compose, e2e и фронтендом.
- ruff: правила `E, F, W, I, B, UP, DJ, S, SIM, RUF`. Миграции форматируются, но не
  проверяются линтером (сгенерированный код). В тестах разрешены `assert` и пароли в коде.

## Весь стек в Docker

`make up` собирает образы и поднимает `postgres`, `backend`, `frontend`, дожидаясь их
healthcheck (`--wait`); `make down` останавливает, данные БД остаются в томе
`postgres-data` (удалить: `docker compose down -v`). `make logs` — логи всех сервисов.

- `backend/Dockerfile`: Python 3.12 + uv, зависимости из `uv.lock` без dev-группы; при старте
  `migrate`, затем uvicorn (ASGI — понадобится для SSE).
- `frontend/Dockerfile`: собирается из корня репозитория (там pnpm workspace и lock-файл),
  запускает dev-сервер Vite с `API_PROXY_TARGET=http://backend:8000`.
- `make up` и локальные `make dev-*` занимают одни и те же порты (5173, 8000) — одновременно
  не запускать или поменять порты переменными `FRONTEND_PORT`, `BACKEND_PORT`.

## Локальная разработка

```sh
make dev-deps       # Postgres
make dev-backend    # терминал 1: backend на :8000
make dev-frontend   # терминал 2: http://localhost:5173
```

Фронтенд и API открываются с одного адреса (:5173): Vite проксирует `/api` на backend.
Поэтому cookie сессии и `EventSource` работают без CORS. Адрес backend для прокси —
переменная `API_PROXY_TARGET` (по умолчанию `http://localhost:8000`).

## Frontend

- Vue 3 + Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`), vue-router,
  `@tanstack/vue-query` для серверных данных. pnpm workspace: зависимости ставит
  `pnpm install` в корне.
- Слои Feature-Sliced Design в `frontend/src/`: `app` (приложение, роутер, QueryClient) →
  `pages` → `widgets` → `features` → `entities` → `shared`. Импорт — только в нижние слои, в
  чужой срез — только через его `index.ts`. Проверяет ESLint (`eslint-plugin-boundaries`).
  Слои `widgets`, `features`, `entities` появятся с первым срезом — пустыми не создаются.
- API: `api` из `@/shared/api` — клиент openapi-fetch, типизированный схемой из
  `backend/openapi.yaml` (`src/shared/api/schema.d.ts`, генерируется `make schema`, руками
  не правится). Несуществующий путь, метод или поле — ошибка vue-tsc. `unwrap()` превращает
  ответ в данные или `AppError`; выше `shared/api` ошибки различаются только по `kind`
  (`network`, `unauthorized`, `not_found`, `conflict`, `validation`, `server`, …).
- Повтор запросов (vue-query) — только для `network` и `server`: 4xx повтор не исправит.
- Тесты: Vitest + `@vue/test-utils` в jsdom, сеть — MSW. Каждый тест объявляет свою сеть через
  `server.use()`; запрос без обработчика роняет тест (`onUnhandledFrame: "error"`).
- ESLint с правилами на типах: `no-floating-promises`, `no-misused-promises`,
  `switch-exhaustiveness-check`, `consistent-type-imports`, запрет `any`.

## Правила по темам

Правила, которые относятся к одной теме, а не к папке, — в [docs/rules/](rules/):

- [db-migrations.md](rules/db-migrations.md) — миграции БД.

Правила для кода папки — в её `AGENTS.md` (например, [backend/AGENTS.md](../backend/AGENTS.md)).
Их полезно прочитать и человеку: это те же договорённости, что действуют для агента.

## Нюансы

- Healthcheck фронтенда обращается к `127.0.0.1`, а не к `localhost`: в Alpine `localhost`
  резолвится в IPv6 `::1`, а Vite слушает только IPv4 — проверка падала при работающем
  сервере.
- Под uvicorn Django не раздаёт статику, поэтому стили админки (`/admin/`) в `make up` не
  грузятся; под `make dev-backend` (`runserver`) — грузятся.

- TypeScript закреплён на `~6.0`: typescript-eslint поддерживает TypeScript `<6.1`, а
  TypeScript 7 (компилятор на Go) — другой API, его пока не поддерживают ни typescript-eslint,
  ни vue-tsc. openapi-typescript предупреждает о peer `typescript@^5`, но с 6.0 генерация
  работает (проверяется `make schema-check`).
- Клиент openapi-fetch получает `fetch: (r) => globalThis.fetch(r)`: иначе он запоминает
  `fetch` при импорте, и подмена сети в тестах (MSW включается позже) не срабатывает — тесты
  уходили в настоящую сеть.
- MSW 3: опция называется `onUnhandledFrame`, а не `onUnhandledRequest`, как в MSW 2 и в
  большинстве примеров в интернете.
- Сгенерированные `backend/openapi.yaml` и `frontend/src/shared/api/schema.d.ts` исключены из
  Prettier и ESLint: `make schema-check` сравнивает их с генерацией байт в байт.
- pnpm запускает install-скрипты только у пакетов из `pnpm.onlyBuiltDependencies` в корневом
  `package.json` (`unrs-resolver` — резолвер импортов для ESLint, `vue-demi`).

- `pre-push` проверяет **рабочую копию**, а не содержимое отправляемых коммитов: так
  устроены git-хуки. Незакоммиченные изменения могут как уронить push, так и замаскировать
  ошибку в коммите. Перед push лучше иметь чистый `git status`; полную проверку именно
  коммитов делает CI.

- `docs/task.md` — текст задания как есть; Prettier его не трогает (`.prettierignore`).
