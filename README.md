# Регистрация на мероприятия

Тестовое задание: сервис регистрации на мероприятия с лимитом мест, листом ожидания,
билетами и чекином. Задание — [docs/task.md](docs/task.md), решения —
[docs/decisions.md](docs/decisions.md), устройство системы —
[docs/architecture.md](docs/architecture.md), ход работы — [docs/roadmap.md](docs/roadmap.md).

Стек: Vue 3 + Vite, Django + DRF, PostgreSQL.

## Состояние

Идёт фаза 0 — каркас (2026-10-28). Работает сквозной путь: страница фронтенда запрашивает
`/api/health/` через прокси Vite, backend проверяет подключение к БД. Предметной логики
(события, регистрации, письма) ещё нет. Проверки, хуки и тесты для обеих частей настроены и
проходят: `make check`.

## Запуск

Нужен только Docker с Compose (и `make` — или те же команды через `docker compose`).

```sh
make up      # или: docker compose up -d --build --wait
```

Открыть <http://localhost:5173>. Остановить — `make down`.

| Сервис   | Адрес                   | Что это                                                   |
| -------- | ----------------------- | --------------------------------------------------------- |
| frontend | <http://localhost:5173> | Vue (dev-сервер Vite); `/api` проксируется на backend     |
| backend  | <http://localhost:8000> | Django + DRF под uvicorn; миграции применяются при старте |
| postgres | `localhost:5432`        | PostgreSQL 17, пользователь и пароль `postgres`           |

Порты меняются переменными `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`.

Разработка — установка инструментов, команды, проверки и правила — в
[docs/development.md](docs/development.md).
