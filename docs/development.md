# Руководство разработчика

Всё, что нужно, чтобы начать работать с репозиторием: что установить, как запустить, какие
команды есть, что проверяется автоматически и почему. Документ обновляется вместе с кодом:
новая команда, инструмент, проверка или нюанс появляются здесь в том же коммите.

Только посмотреть проект, без разработки, — [README](../README.md).

## Содержание

1. [Что установить](#что-установить)
2. [Первая настройка](#первая-настройка)
3. [Запуск](#запуск)
4. [Команды](#команды)
5. [Как вести задачу](#как-вести-задачу)
6. [Типовые задачи](#типовые-задачи)
7. [Что проверяется автоматически](#что-проверяется-автоматически)
8. [Коммиты, решения, прогресс](#коммиты-решения-прогресс)
9. [Backend](#backend) · [Frontend](#frontend) · [E2E](#e2e)
10. [Правила и skills](#правила-и-skills)
11. [Хуки Claude Code](#хуки-claude-code)
12. [Нюансы](#нюансы)

## Что установить

| Инструмент       | Версия                                     | Зачем                                                                         | Как поставить                                                                                 |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Node.js          | 22 (см. `.nvmrc`)                          | frontend, e2e, git-хуки, форматирование                                       | `nvm install` в корне репозитория                                                             |
| pnpm             | 10 (см. `packageManager` в `package.json`) | зависимости Node (workspace: корень, `frontend/`, `e2e/`)                     | `corepack enable` — версию возьмёт из `package.json`                                          |
| uv               | 0.13+                                      | Python и зависимости backend; Python из `backend/.python-version` скачает сам | `curl -LsSf https://astral.sh/uv/install.sh \| sh`                                            |
| Docker + Compose | Docker Desktop или Docker Engine           | Postgres и весь стек                                                          | WSL: в Docker Desktop включить Settings → Resources → WSL Integration для своего дистрибутива |
| make             | GNU make                                   | единая точка входа для команд                                                 | обычно уже есть; Debian/Ubuntu: `apt install make`                                            |

## Первая настройка

```sh
make install    # зависимости Node и backend, браузер Playwright, git-хуки
make dev-deps   # Postgres и Mailpit в Docker
make check      # всё должно пройти
```

`pnpm install` (внутри `make install`) кроме зависимостей устанавливает git-хуки: скрипт
`prepare` → husky прописывает `core.hooksPath=.husky/_`. Без этого хуки не работают и
ошибки всплывут только в CI.

## Запуск

**Для разработки** — сервисы локально, с перезагрузкой при изменениях:

```sh
make dev-deps       # Postgres и Mailpit
make dev-backend    # терминал 1: миграции + backend на :8000
make dev-frontend   # терминал 2: http://localhost:5173
make dev-worker     # терминал 3, если нужны письма: outbox → Mailpit, http://localhost:8025
```

Фронтенд и API открываются с одного адреса (:5173): Vite проксирует `/api` на backend,
поэтому cookie сессии и `EventSource` работают без CORS. Адрес backend для прокси —
переменная `API_PROXY_TARGET` (по умолчанию `http://localhost:8000`).

**Весь стек в Docker** — как его запускает проверяющий:

```sh
make up     # собрать и поднять postgres, backend, worker, mailpit, frontend; http://localhost:5173
make logs   # логи всех сервисов
make down   # остановить; данные БД остаются в томе postgres-data
```

- `make up` = `docker compose up -d --build --wait`: ждёт healthcheck всех сервисов.
- `backend/Dockerfile`: Python 3.12 + uv, зависимости из `uv.lock` без dev-группы; при старте
  `migrate`, затем uvicorn (ASGI — понадобится для SSE).
- `worker` — тот же образ `backend` с командой `python manage.py run_worker`: берёт из outbox
  пачки до 20 писем подряд и отправляет их в Mailpit; если писем нет — ждёт 1 с. Стартует
  после healthy `backend` (миграции применены) и Mailpit, после падения перезапускается
  (`restart: unless-stopped`). В логе — только `id` писем, без адресов и ссылок.
- Mailpit — SMTP-ловушка: письма не уходят наружу, их видно в веб-интерфейсе
  http://localhost:8025 (он же API для e2e). SMTP опубликован на :1025 для `make dev-worker`.
- `frontend/Dockerfile` собирается из корня репозитория (там pnpm workspace и lock-файл) и
  запускает dev-сервер Vite с `API_PROXY_TARGET=http://backend:8000`.
- `make up` и `make dev-*` занимают одни и те же порты (5173, 8000): не запускать одновременно
  или поменять порты переменными `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`,
  `MAILPIT_PORT` (веб, 8025), `MAILPIT_SMTP_PORT` (1025). Ссылки в письмах ведут на
  `http://localhost:${FRONTEND_PORT}`.
- Стереть данные БД: `docker compose down -v`.

## Команды

Основной вход — `make`; `make help` печатает все цели с описанием. Новая команда должна
появиться и в Makefile, и в этой таблице.

| Команда                                                       | Что делает                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Окружение**                                                 |                                                                                          |
| `make install`                                                | зависимости Node и backend, браузер Playwright (chromium), git-хуки                      |
| `make dev-deps`                                               | поднять Postgres и Mailpit в Docker и дождаться готовности                               |
| `make dev-backend` / `make dev-frontend`                      | локальные dev-серверы (см. «Запуск»)                                                     |
| `make dev-worker`                                             | локальный воркер писем: outbox → Mailpit (`manage.py run_worker`)                        |
| `make up` / `make down` / `make logs`                         | весь стек в Docker                                                                       |
| **Проверки**                                                  |                                                                                          |
| `make check`                                                  | всё, кроме запуска e2e: форматирование, линтеры, типы, схема, тесты — то же, что CI      |
| `make check-backend`                                          | ruff, mypy, миграции, схема, pytest                                                      |
| `make check-frontend`                                         | ESLint, vue-tsc, Vitest                                                                  |
| `make check-e2e`                                              | ESLint и tsc для кода e2e-тестов (сами тесты не запускает)                               |
| `make check-tooling`                                          | тесты хуков Claude Code и `scripts/` (`node:test`)                                       |
| `make check-ci`                                               | workflow GitHub Actions: actionlint и существование тегов actions (нужна сеть)           |
| `make format-check`                                           | Prettier: форматирование всех файлов                                                     |
| `make lint-backend` / `typecheck-backend` / `test-backend`    | по отдельности: ruff / mypy / pytest (pytest нужен `make dev-deps`)                      |
| `make lint-frontend` / `typecheck-frontend` / `test-frontend` | по отдельности: ESLint / vue-tsc / Vitest                                                |
| `make migrations-check`                                       | падает, если модели изменены, а миграция не создана                                      |
| `make schema-check`                                           | падает, если `openapi.yaml` или `schema.d.ts` устарели или у view нет описания для схемы |
| `make e2e`                                                    | поднять стек (`make up`) и прогнать Playwright против него                               |
| `make review-up` / `review-e2e` / `review-down`               | отдельный стек для ревью (см. «E2E»): поднять / e2e против него / удалить с томами       |
| `make review-check`                                           | `make check` на Postgres стека ревью (5433), а не на Postgres из `make dev-deps`         |
| **Изменения**                                                 |                                                                                          |
| `make schema`                                                 | пересобрать `backend/openapi.yaml` и типы фронтенда `schema.d.ts` после изменения API    |
| `make fmt`                                                    | отформатировать всё: `eslint --fix`, Prettier, `ruff check --fix`, `ruff format`         |
| **Прочее**                                                    |                                                                                          |
| `make worktime`                                               | время работы по маркерам сессий в `decisions.md` (см. «Коммиты, решения, прогресс»)      |

Команды Django — из `backend/` через uv: `uv run python manage.py <команда>`.

## Как вести задачу

Процесс один для человека и для агента. Агенту он расписан подробно в skills
`feature-workflow` (фаза целиком) и `session-handoff` (начало и конец работы); здесь — тот же
порядок коротко.

**1. Найти задачу.** В [roadmap.md](roadmap.md) — фаза со статусом «в работе», в ней первая
неотмеченная задача. У крупных фаз (1, 2, 4) задачи лежат в `docs/features/<slug>/tasks.md`.
Перед началом — `git pull` и чистый `git status`.

**2. Крупная фаза только началась — сначала spec и задачи, потом код.**

1. Прочитать раздел фазы в [architecture.md](architecture.md) и требования в
   [task.md](task.md).
2. Скопировать `docs/features/_template/spec.md` и `tasks.md` в `docs/features/<slug>/`.
3. Spec — до 150 строк: модель, инварианты и чем они защищены, API, состояния UI, крайние
   случаи, сценарии приёмки. **Non-Goals обязательны** — список того, что не делаем, хотя
   захочется.
4. Задачи — «одна задача = один коммит», у каждой «готово, когда»; первая — tracer bullet:
   один сценарий насквозь, от модели до экрана.
5. Spec и задачи утверждает владелец проекта, до первой строки кода. Коммит —
   `docs: add <slug> spec and tasks`.

**3. Перед кодом.** Прочитать `AGENTS.md` папок, которые затронет задача, и `docs/rules/` по
теме ([список](#правила-и-skills)). Найти похожий код и переиспользовать, а не писать второй
вариант того же.

**4. Тест вперёд — для логики.** Сервисы backend, чистые функции, преобразования: сначала
тест, он должен упасть по ожидаемой причине, потом код. Разметку и стили проверяют браузер и
e2e. Изменения API и моделей — по рецептам из «[Типовых задач](#типовые-задачи)».

**5. Проверить.**

- `make check` — всегда;
- `make e2e` — если затронуты API, UI или сценарии из `e2e/`;
- руками в браузере (`make dev-backend` + `make dev-frontend`): сценарий задачи и негативные
  случаи — пустые данные, ошибка, повторная отправка, две вкладки.

**6. Обновить в том же коммите** — чек-лист:

- [ ] задача отмечена `[x]` в roadmap или в `tasks.md` фазы;
- [ ] принятые по ходу решения — в [decisions.md](decisions.md) (время — из `date`);
- [ ] новая команда, инструмент, проверка, нюанс — в этом файле;
- [ ] поведение разошлось со spec — поправлен `spec.md`;
- [ ] найденное вне задачи — в «На потом» в `tasks.md`, а не в этот коммит.

**7. Закоммитить** — одна задача, одно сообщение в формате Conventional Commits. Если
`pre-commit` или `commit-msg` остановили коммит — исправить причину, хук не обходить.

**8. Отправить.** `git push`: `pre-push` проверит затронутые части, затем CI — результат в
Actions на GitHub или `gh run watch`. Красный CI — первая задача, прежде чем брать следующую.
Сейчас работа идёт прямо в `main` (один разработчик); в команде — ветка и pull request, и CI
на PR дополнительно проверит сообщения всех коммитов.

**9. Закрыть фазу**, когда все её задачи отмечены:

- критерии фазы из roadmap проверены фактами — тест, команда, вывод;
- разделы фазы в [architecture.md](architecture.md) приведены к коду и помечены
  «реализовано»;
- в [README](../README.md) обновлены «Состояние» и строки «требование → тест»;
- в roadmap фаза — «готова», следующая — «в работе»; закрытие — запись в
  [decisions.md](decisions.md);
- независимое ревью изменений фазы: человек или агент `reviewer`.

Как выглядит история крупной фазы:

```text
docs: add registration spec and tasks
feat(backend): register for an event with a seat limit        ← tracer bullet
feat(backend): put registrations over the limit on the waitlist
feat(backend): promote the first waitlisted on cancellation
test(backend): race for the last seat on Postgres
feat(frontend): event page with registration form
test(e2e): organizer creates an event, participant registers
docs: close phase 1 (registration)
```

## Типовые задачи

**Изменить API** (serializer, view, URL):

1. Код и тест backend.
2. Ответ не из serializer, несколько статусов или поток — описать через `@extend_schema`
   (пример — `backend/config/health.py`).
3. `make schema` — обновит `backend/openapi.yaml` и `frontend/src/shared/api/schema.d.ts`.
4. `make check-frontend`: если фронтенд использует изменённое поле, упадёт vue-tsc — это и
   есть проверка контракта.
5. Схема и типы — в том же коммите, что и код.

**Изменить модели БД:**

1. `cd backend && uv run python manage.py makemigrations <app> --name <что_сделано>`.
2. Посмотреть SQL: `uv run python manage.py sqlmigrate <app> <номер>`.
3. Правила (не править закоммиченные, схема и данные раздельно) —
   [rules/db-migrations.md](rules/db-migrations.md).

**Создать организатора** (вход в админку и экраны организатора):
`cd backend && uv run python manage.py createsuperuser`. Демо-учётки `demo@example.com` /
`demo` и `admin@example.com` / `admin` создаёт `python manage.py create_demo_users` (идемпотентна,
сбрасывает пароли); в compose она запускается при старте `backend`. При
`DJANGO_DEBUG=false` команда ничего не создаёт и не меняет паролей, только пишет предупреждение:
известные пароли и суперпользователь не должны попасть в развёртывание без DEBUG. При `DJANGO_DEBUG=false`
команда ничего не создаёт и не меняет паролей, только пишет предупреждение: известные пароли и
суперпользователь не должны попасть в развёртывание без DEBUG.

**Запустить один тест:**

- backend: `cd backend && uv run pytest accounts/tests/test_user.py -k lowercase`;
- frontend: `cd frontend && pnpm test src/pages/health`;
- e2e: `cd e2e && pnpm test tests/smoke.spec.ts` (`--headed` — с окном, `--debug` —
  отладчик).

## Что проверяется автоматически

| Когда        | Хук          | Что проверяет                                                                    |
| ------------ | ------------ | -------------------------------------------------------------------------------- |
| `git commit` | `pre-commit` | lint-staged — только изменённые файлы, см. таблицу ниже                          |
| `git commit` | `commit-msg` | commitlint: сообщение в формате Conventional Commits                             |
| `git push`   | `pre-push`   | `scripts/pre-push.mjs`: проверки тех частей, которые меняют отправляемые коммиты |
| push / PR    | CI           | `make check` и `make e2e` на GitHub Actions                                      |

**`pre-commit` (lint-staged).** Исправления добавляются в коммит; то, что не исправляется
автоматически, останавливает коммит.

| Файлы                       | Что запускается                   |
| --------------------------- | --------------------------------- |
| `backend/**/*.py`           | `ruff check --fix`, `ruff format` |
| `frontend/**/*.{ts,vue,js}` | `eslint --fix`, Prettier          |
| `e2e/**/*.{ts,js}`          | `eslint --fix`, Prettier          |
| `*.{mjs,json,md,yml,yaml}`  | Prettier                          |

**`pre-push`.** Медленные проверки (типы, тесты) — здесь, а не в `pre-commit`: хук, который
тормозит каждый коммит, начинают обходить.

| Изменены файлы                                                                                                | Что запускается                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `backend/**`                                                                                                  | `make dev-deps check-backend` — поднимет Postgres, если он не запущен |
| `frontend/**`                                                                                                 | `make check-frontend`                                                 |
| `e2e/**`                                                                                                      | `make check-e2e`                                                      |
| `.github/**`                                                                                                  | `make check-ci`                                                       |
| `.claude/hooks/**`, `scripts/**`                                                                              | `make check-tooling`                                                  |
| `Makefile`, `docker-compose.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.prettierrc.json` | проверки всех частей                                                  |
| только документация                                                                                           | ничего                                                                |

Отправляемые коммиты — от того, что уже есть на remote, до отправляемого. Ветка, которой
ещё нет на remote, сравнивается с тем, что есть на любом remote; если remote пуст —
проверяется всё. Новая часть репозитория добавляется в `PARTS` в `scripts/pre-push.mjs`
вместе со строкой в `pre-push.test.mjs`.

**CI** — `.github/workflows/ci.yml`, на push в `main` и на pull request. Команды те же, что
локально: отличий между «у меня проходит» и «в CI падает» быть не должно.

| Job      | Что делает                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `checks` | `pnpm install --frozen-lockfile`, `uv sync --frozen`, `make dev-deps`, `make check`; на PR — commitlint по всем коммитам PR |
| `e2e`    | браузер Playwright, `make e2e` (весь стек в Docker); при падении — логи сервисов и отчёт Playwright в артефактах            |

`--frozen-lockfile` / `--frozen`: если `package.json` или `pyproject.toml` изменён без
обновления lock-файла, CI падает. Workflow проверяет `make check-ci` (входит в `make check`
и в `pre-push` при изменениях в `.github/`): actionlint — синтаксис и выражения,
`scripts/check-action-refs.mjs` — что у каждого `uses: owner/repo@ref` есть такой тег или
ветка. actionlint этого не проверяет: `astral-sh/setup-uv@v10` он пропустил, а CI упал —
проект не публикует мажорные теги, только полные версии.

`actions/checkout` в job `checks` берёт полную историю (`fetch-depth: 0`): по умолчанию клон
поверхностный, базового коммита PR в нём нет, и commitlint падает с `Invalid revision range`,
хотя `make check` прошёл.

Хуки не обходим (`--no-verify`): если проверка мешает, исправляем причину или обсуждаем
правило.

## Коммиты, решения, прогресс

**Коммиты** — [Conventional Commits](https://www.conventionalcommits.org/):
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

**Решения** — любой выбор, влияющий на код, структуру, стек или сроки, записывается в
[decisions.md](decisions.md) в том же коммите, что и изменение. Формат — в
[AGENTS.md](../AGENTS.md).

**Время работы** — границы сессий отмечаются в [decisions.md](decisions.md) строками
`- **ЧЧ:ММ** — ▶ начало сессии` и `- **ЧЧ:ММ** — ■ конец сессии` (время — из `date`);
`make worktime` суммирует интервалы. Сессия может пересекать полночь — дата берётся из
заголовка дня над маркером. Непарный маркер даёт предупреждение, а не молчаливый ноль;
незакрытая сессия не учитывается. Переход на летнее/зимнее время внутри сессии не
корректируется. Для сверки — время первого и последнего коммита за день (`git log`).

**Прогресс** — [roadmap.md](roadmap.md): фазы со статусом и критериями, задачи с
отметками. Задача отмечается в том же коммите, который её выполняет.

## Backend

- Структура: `backend/config/` — настройки, корневые URL, ASGI, `health.py`; приложения
  Django — папки рядом (`accounts/`). Python 3.12, Django 5.2 LTS, DRF.
- Переменные окружения читаются только в `config/settings.py`. Значения по умолчанию
  совпадают с сервисами `docker compose`, поэтому локально ничего задавать не нужно.
- Почта: `EMAIL_HOST` / `EMAIL_PORT` (SMTP Mailpit, по умолчанию `localhost:1025`),
  `DEFAULT_FROM_EMAIL`, `FRONTEND_URL` — адрес фронтенда для ссылок в письмах (по умолчанию
  `http://localhost:5173`). Письма не отправляются из запроса: сервис кладёт их в outbox
  (`emails.services.enqueue_email`) в своей транзакции. В тестах pytest-django сам
  подменяет backend почты на `locmem`.
- Своя модель пользователя `accounts.User`: вход по email, username нет. Email хранится в
  нижнем регистре (приводится в `save()`), поэтому обычный `unique` работает без учёта
  регистра. Точки и `+tag` в адресе значимы — см. запись от 2026-10-28 22:38 в
  [decisions.md](decisions.md).
- Тесты — pytest + pytest-django на настоящем Postgres (`make dev-deps`): блокировки,
  `SKIP LOCKED` и `LISTEN/NOTIFY` на SQLite не проверить. pytest-django создаёт отдельную
  тестовую БД `test_<имя>` и удаляет её после прогона. Тест, которому нужна БД, помечается
  `pytest.mark.django_db`.
- mypy в режиме `strict` с плагинами django-stubs и drf-stubs. Generic-классы Django
  (`UserAdmin[User]`) работают в runtime благодаря `django_stubs_ext.monkeypatch()` в
  настройках. `# type: ignore` — только с кодом ошибки и причиной в комментарии.
- ruff: правила `E, F, W, I, B, UP, DJ, S, SIM, RUF`. Миграции форматируются, но не
  проверяются линтером (сгенерированный код). В тестах разрешены `assert` и пароли в коде.
- API описан OpenAPI-схемой `backend/openapi.yaml` (drf-spectacular), она закоммичена, по ней
  фронтенд получает типы (см. «Изменить API»). Генерация идёт с `--fail-on-warn`: view без
  описания ответа или неоднозначное имя enum — ошибка, а не тихий пробел в схеме.
- Статику (админка) раздаёт WhiteNoise — одинаково под uvicorn, `runserver`
  (`whitenoise.runserver_nostatic`) и в тестах: файлы с хэшем в имени из `STATIC_ROOT`
  (`backend/staticfiles/`, собирается `collectstatic`, в git не попадает). Образ собирает
  статику при сборке; pytest — один раз за сессию (фикстура в `backend/conftest.py`), потому
  что тесты идут с `DEBUG=False`, как продакшен.
- Админка — <http://localhost:8000/admin/> (напрямую на backend: Vite проксирует только
  `/api`); вход по email, нужен `is_staff`. Каждая модель наших приложений обязана быть
  зарегистрирована в админке — это проверяет тест.
- `GET /api/health/` — проверка процесса и БД: 200 `{"status": "ok", "database": "ok"}` или
  503, если БД недоступна. Используют healthcheck'и compose, e2e и фронтенд.

## Frontend

- Vue 3 + Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`), vue-router,
  `@tanstack/vue-query` для серверных данных.
- Слои Feature-Sliced Design в `frontend/src/`: `app` (приложение, роутер, QueryClient) →
  `pages` → `widgets` → `features` → `entities` → `shared`. Импорт — только в нижние слои, в
  чужой срез — только через его `index.ts`. Проверяет ESLint (`eslint-plugin-boundaries`).
  Слои `widgets`, `features`, `entities` появятся с первым срезом — пустыми не создаются.
- API: `api` из `@/shared/api` — клиент openapi-fetch, типизированный `schema.d.ts`
  (генерируется `make schema`, руками не правится). Несуществующий путь, метод или поле —
  ошибка vue-tsc. `unwrap()` превращает ответ в данные или `AppError`; выше `shared/api`
  ошибки различаются только по `kind` (`network`, `unauthorized`, `not_found`, `conflict`,
  `validation`, `server`, …).
- Повтор запросов (vue-query) — только для `network` и `server`: 4xx повтор не исправит.
- Тесты: Vitest + `@vue/test-utils` в jsdom, сеть — MSW. Каждый тест объявляет свою сеть через
  `server.use()`; запрос без обработчика роняет тест. Пример —
  `src/pages/health/ui/HealthPage.test.ts`.
- ESLint с правилами на типах: `no-floating-promises`, `no-misused-promises`,
  `switch-exhaustiveness-check`, `consistent-type-imports`, запрет `any`.
- UI-компоненты — shadcn-vue (Reka UI + Tailwind CSS v4). Код компонентов лежит в
  репозитории: `src/shared/ui/shadcn/` (сгенерированный, правила ESLint для него смягчены
  в `eslint.config.js`); `src/shared/ui/` вне этой папки — самописные компоненты.
  Добавить компонент: `cd frontend && pnpm dlx shadcn-vue@latest add <имя>` — только тот,
  у которого есть потребитель. Настройка — `frontend/components.json`; `cn()` лежит в
  `src/shared/lib/class-names.ts`. Дизайн-токены — CSS-переменные в `src/app/styles.css`
  (`:root`). Нюансы CLI: ему нужен `paths` в `frontend/tsconfig.json` (без него падает с
  `resolvedPaths: Required`); при несовпадении алиаса он подставляет в импорты npm-пакет
  `cn` — после `add` проверить `grep -r 'from "cn"' src` и зависимости в `package.json`.
- Тексты интерфейса — по-русски, через vue-i18n: у каждого компонента свой блок
  `<i18n lang="json" locale="ru">` рядом с шаблоном (`useI18n({ useScope: "local" })`),
  блоки собирает `@intlify/unplugin-vue-i18n` (`vite.config.ts`). Глобальных сообщений нет;
  экземпляр создаёт `createAppI18n()` из `shared/lib/i18n.ts` — им же подключаются тесты
  компонентов. Ключи в `t()` типами не проверяются: опечатку ловит тест компонента. `@` в
  сообщении пишется `{'@'}`. Код, идентификаторы и логи — по-английски.

## E2E

- Playwright, пакет `e2e/`, только chromium. Тесты идут против стека из `make up` — того же,
  что запускает проверяющий; `make e2e` поднимает его сам. Другой адрес — `E2E_BASE_URL`.
- Стек ревью — `make review-up` / `review-e2e` / `review-check` / `review-down`:
  compose-проект `event-registration-review` со своими контейнерами, томами и портами
  (фронтенд 5174, backend 8001, Postgres 5433, Mailpit 8026, SMTP 1026). Нужен, когда стек
  разработчика уже запущен: тот же проект на других портах пересоздал бы его контейнеры, а
  тесты backend пересоздавали бы `test_event_registration` в его Postgres. Агент `reviewer`
  работает только с этим стеком; `review-down` удаляет тома проекта
  `event-registration-review`. Имя проекта общее для всего Docker на машине, поэтому два
  ревью одновременно делят один стек — запускать по очереди.
- При падении сохраняется trace:
  `cd e2e && pnpm exec playwright show-trace test-results/<папка теста>/trace.zip`.
- В `make check` e2e не запускаются (нужен поднятый стек) — там только ESLint и tsc для их
  кода. Главное правило линтера здесь — `no-floating-promises`: забытый `await` в Playwright
  делает тест зелёным, ничего не проверив.

## Правила и skills

Договорённости для кода записаны как правила для агента, но они же действуют для людей —
их стоит прочитать.

| Файл                                                                      | О чём                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [AGENTS.md](../AGENTS.md)                                                 | весь репозиторий: лог решений, коммиты, язык, проверки                     |
| [backend/AGENTS.md](../backend/AGENTS.md)                                 | тонкие view и `services.py`, env, API и схема, тесты, время, логи          |
| [frontend/AGENTS.md](../frontend/AGENTS.md)                               | слои FSD, сеть через `shared/api`, состояния UI, имена, тесты              |
| [frontend/src/shared/api/AGENTS.md](../frontend/src/shared/api/AGENTS.md) | клиент API, `AppError`, сгенерированные типы                               |
| [e2e/AGENTS.md](../e2e/AGENTS.md)                                         | `await`, ожидания без `sleep`, локаторы, независимые данные, два контекста |
| [rules/db-migrations.md](rules/db-migrations.md)                          | миграции БД                                                                |

Правило для папки — `AGENTS.md` в ней (рядом `CLAUDE.md` = `@AGENTS.md`, его читает Claude
Code); правило по теме — `docs/rules/<тема>.md`.

Процедуры («как сделать X по шагам») — skills в `.claude/skills/`: `session-handoff`,
`feature-workflow`, `fsd-frontend`, `anti-slop-review`, `api-change` (черновик); агент
независимого ревью — `.claude/agents/reviewer.md`. Источник — шаблон
[rbikbov/frontend-starter](https://github.com/rbikbov/frontend-starter), адаптированный под
Django + Vue. Шаблоны spec и задач фазы — `docs/features/_template/`.

Чужие skills (`django-security`, `vue-best-practices`, `vue-router-best-practices`,
`vue-testing-best-practices`) лежат в `.agents/skills/`, а в `.claude/skills/` — симлинки на
них; версии — в `skills-lock.json`. Их не правят: `npx skills update` и
`npx skills experimental_install` (восстановить по lock-файлу) перезапишут папку из
источника. Уточнения под проект — в `AGENTS.md` или в своих skills. Папка `.agents/`
исключена из Prettier. Симлинки хранятся в git как есть: на Linux, macOS и WSL `git clone`
создаёт их сам; на Windows без developer mode (или с `core.symlinks=false`) они станут
текстовыми файлами и skills будут недоступны — клонировать из WSL или включить
`git config core.symlinks true`.

## Хуки Claude Code

Настроены в `.claude/settings.json`, скрипты — в `.claude/hooks/` (Node, без зависимостей).
Действуют только для агента, на ручную работу не влияют.

| Событие                    | Скрипт                 | Что делает                                                                                                                       |
| -------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`             | `session-start.mjs`    | выводит агенту фазу «в работе», её открытые задачи из `tasks.md` (или подсказку начать со spec) и последние коммиты              |
| `PreToolUse` (Bash)        | `guard-bash.mjs`       | блокирует обход git-хуков (`--no-verify`, `-n`, `HUSKY=0`, смена `core.hooksPath`), force push и `--amend` отправленного коммита |
| `PreToolUse` (Edit/Write)  | `guard-migrations.mjs` | блокирует правку закоммиченных миграций `backend/*/migrations/NNNN_*.py`                                                         |
| `PostToolUse` (Edit/Write) | `format-file.mjs`      | форматирует изменённый файл, как `pre-commit` (Prettier, ruff, ESLint); оставшиеся ошибки линтера показывает агенту              |

- `guard-bash.mjs` сначала вырезает из команды heredoc и строки в кавычках (иначе `-n` в
  тексте сообщения коммита сработал бы как флаг), затем проверяет каждую простую команду
  (разделители — перевод строки, `;`, `|`, `&`) отдельно. Новый случай — строка в
  `guard-bash.test.mjs`.
- Хуки на Edit/Write не видят правку файла через shell (`sed -i`, `>`). Правила от этого не
  перестают действовать, но соблюдать их в этом случае — на агенте и ревью.
- Хуки подхватываются при изменении `.claude/settings.json` без перезапуска сессии. Хук
  блокирует лишнее — исправить скрипт и добавить случай в тест, а не обходить хук.

## Нюансы

**Окружение и проверки**

- `pre-push` проверяет **рабочую копию**, а не содержимое отправляемых коммитов: так
  устроены git-хуки. Незакоммиченные изменения могут и уронить push, и замаскировать ошибку
  в коммите. Перед push лучше иметь чистый `git status`; коммиты как есть проверяет CI.
- Сгенерированные `backend/openapi.yaml` и `frontend/src/shared/api/schema.d.ts` исключены из
  Prettier и ESLint: `make schema-check` сравнивает их с генерацией байт в байт.
- `docs/task.md` — текст задания как есть; Prettier его не трогает.
- pnpm запускает install-скрипты только у пакетов из `pnpm.onlyBuiltDependencies` в корневом
  `package.json` (`unrs-resolver` — резолвер импортов для ESLint, `vue-demi`).

**Docker**

- Healthcheck фронтенда обращается к `127.0.0.1`, а не к `localhost`: в Alpine `localhost`
  резолвится в IPv6 `::1`, а Vite слушает только IPv4 — проверка падала при работающем
  сервере.
- Если на Linux chromium для e2e не стартует из-за системных библиотек:
  `cd e2e && pnpm exec playwright install --with-deps chromium` (нужен sudo).

**Версии и библиотеки фронтенда**

- TypeScript закреплён на `~6.0`: typescript-eslint поддерживает TypeScript `<6.1`, а
  TypeScript 7 (компилятор на Go) — другой API, его пока не поддерживают ни typescript-eslint,
  ни vue-tsc. openapi-typescript предупреждает о peer `typescript@^5`, но с 6.0 генерация
  работает (проверяется `make schema-check`).
- Клиент openapi-fetch получает `fetch: (r) => globalThis.fetch(r)`: иначе он запоминает
  `fetch` при импорте, MSW в тестах включается позже, и запросы уходили в настоящую сеть.
- MSW 3: опция называется `onUnhandledFrame`, а не `onUnhandledRequest`, как в MSW 2 и в
  большинстве примеров в интернете.
