# План проекта (временный файл)

Рабочий план, согласованный в обсуждении 2026-10-28. Когда каркас и основные механизмы
будут готовы, содержимое разойдётся по `README.md`, `docs/` и правилам агента, а файл будет
удалён. Обоснования решений — в [docs/decisions.md](docs/decisions.md).

## Модель данных

**User** — своя модель (`AUTH_USER_MODEL`) с самого начала, вход по уникальному email.
Сейчас это только организаторы; участники аккаунтов не имеют.

**Event**
- `organizer` (FK → User), `title`, `description`, `starts_at` (timestamptz, UTC), `capacity`
- `schedule_version` (int) — увеличивается при каждом переносе; входит в ключи
  дедупликации писем о переносе и напоминаний.

**Registration**
- `event` (FK), `email` (в нижнем регистре), `name`
- `status`: `confirmed` / `waitlisted` / `cancelled`
- `queued_at` — порядок в листе ожидания
- `confirmed_at` — момент получения места (нужен для правила напоминаний)
- `ticket_code` — короткий, уникальный, без похожих символов; показывается на входе
- `manage_token` — длинный секрет для ссылки «мой билет / отказаться»
- `checked_in_at`, `cancelled_at`
- `UNIQUE(event, email)`; повторная регистрация после отказа «оживляет» строку: место или лист
  ожидания определяются заново, `ticket_code` выдаётся новый.

**OutboxEmail** — очередь писем в Postgres
- `kind`: `ticket` / `waitlisted` / `promoted` / `reminder` / `rescheduled`
- `registration` (FK), `dedup_key UNIQUE`, `status` (`pending`/`sent`/`failed`), `attempts`,
  `next_attempt_at`, `sent_at`, `last_error`
- Создаётся в той же транзакции, что и бизнес-изменение, через
  `enqueue_email(kind, registration, dedup_key)`, вставка `ON CONFLICT DO NOTHING`.

## Гонки и инварианты

- Регистрация: транзакция, `SELECT … FOR UPDATE` на Event, подсчёт `confirmed` →
  `confirmed` или `waitlisted`. Гонка за одинаковый email — `UNIQUE` + обработка
  `IntegrityError` → возврат существующей записи.
- Отказ: та же блокировка; отмена и повышение первого из листа (`ORDER BY queued_at, id`)
  и письмо `promoted` — в одной транзакции.
- Лимит: увеличение повышает людей из листа; уменьшение ниже числа `confirmed` → 400.
- Чекин: один атомарный `UPDATE … WHERE ticket_code=? AND event=? AND status='confirmed'
  AND checked_in_at IS NULL`; при 0 строк — выяснение причины (уже отмечен / не найден /
  отменён / в листе ожидания).
- Тесты гонок — на реальном Postgres, N потоков с `threading.Barrier`.

## API (DRF)

Публичное:
- `GET /api/events/`, `GET /api/events/{id}/` — с числом свободных мест
- `POST /api/events/{id}/registrations/` `{email, name}` → `{status, position?}`; кода билета
  в ответе нет — он приходит только письмом
- `GET /api/tickets/{manage_token}/`, `POST /api/tickets/{manage_token}/cancel/`
- `GET /api/events/{id}/stream/` — SSE: свободные места

Организатор (сессия + CSRF):
- `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
- `GET/POST /api/org/events/`, `GET/PATCH /api/org/events/{id}/` (перенос → письма;
  лимит → повышение)
- `GET /api/org/events/{id}/registrations/?status=`
- `POST /api/org/events/{id}/checkin/` `{code}` → 200 / 404 / 409 / 422
- `GET /api/org/events/{id}/stream/` — SSE: зарегистрировано / в листе / пришло

Фронтенд и `/api` на одном адресе: прокси Vite в разработке, nginx/ingress в продакшене.

## Realtime

- SSE + Postgres `LISTEN/NOTIFY`: транзакции, меняющие счётчики, делают
  `pg_notify('event_stats', event_id)`; доставка только после коммита.
- Backend под ASGI (uvicorn); один слушатель на процесс раздаёт уведомления подписчикам
  через `asyncio.Queue`.
- Передаётся полный снимок счётчиков; при (пере)подключении — сразу снимок; heartbeat ~15 с.
- Заголовок `X-Accel-Buffering: no`, без сжатия потока.
- Запасного опроса нет; на экране организатора — индикатор «соединение потеряно,
  переподключаюсь».

## Фоновые задачи и письма

Отдельный процесс `manage.py run_worker`, цикл:
1. Рассылка: `SELECT … FOR UPDATE SKIP LOCKED LIMIT 20` из outbox → SMTP → `sent`; ошибки —
   повтор с нарастающей паузой, после N попыток — `failed`.
2. Напоминания раз в ~30 с: события с `starts_at − 24h ≤ now < starts_at` → письмо
   `reminder` каждому `confirmed` с `confirmed_at < starts_at − 24h`; ключ
   `reminder:{reg_id}:{schedule_version}`.
3. Чистка отправленных писем старше N дней.

Письма:
| kind | кому | когда |
|---|---|---|
| `ticket` | получил место при регистрации | один раз |
| `waitlisted` | попал в лист ожидания; номер «на момент письма» + ссылка управления | один раз при попадании в лист |
| `promoted` | повышен из листа ожидания | один раз |
| `reminder` | `confirmed`, место получено до начала 24-часового окна | раз на каждую дату события |
| `rescheduled` | `confirmed` и `waitlisted` | раз на каждый перенос |

Повторная регистрация на тот же email писем не шлёт.

Почта: Mailpit в compose (UI на :8025), `locmem` в unit-тестах; e2e читает письма через API
Mailpit. Доставка — «хотя бы один раз» (падение между SMTP и записью `sent` даёт повтор) —
указать в README.

## Фронтенд (Vue 3)

Список событий → страница события (регистрация, свободные места live) → страница билета по
`manage_token` (код, статус, отказ). Организатор: вход → свои события (создание,
редактирование) → панель события (счётчики live, участники) → чекин (ввод кода, крупный
ответ).

## Окружение

- `docker-compose.yml`: `postgres`, `mailpit`, `backend` (uvicorn), `worker`
  (`run_worker`), `frontend` (Vite). `backend` и `worker` — один образ из
  `backend/Dockerfile`, разные `command`.
- `make seed`: организатор `demo@example.com` / `demo`; событие через неделю на 2 места;
  событие через ~23 ч с участниками, у которых `confirmed_at` задним числом (явно помечено
  как демо) — напоминания видны в Mailpit через ~30 с.

## Структура репозитория

```
event-registration/
├── README.md            # развёртывание, состояние, «требование → тест», модель/инструмент,
│                        # что дальше, что взято чужое
├── docs/
│   ├── task.md
│   ├── decisions.md
│   └── session/         # экспорт сессий Claude Code — в конце
├── backend/             # Django + DRF: API и воркер
├── frontend/            # Vue 3 + Vite
├── e2e/                 # Playwright, два браузерных контекста
├── docker-compose.yml
├── Makefile             # make up / make test / make e2e / make seed
├── CLAUDE.md
└── .github/workflows/ci.yml
```

## Порядок работы (срок — 2026-11-05)

1. Каркас — **сначала спланировать отдельно** (линтеры, хуки, типы, тесты, правила агента).
2. Модели, регистрация, лист ожидания, отказ, тесты гонок.
3. Outbox, воркер, письма.
4. Чекин и статистика организатора.
5. SSE.
6. Напоминания и перенос события.
7. Экраны фронтенда.
8. Playwright, README с таблицей «требование → тест».
