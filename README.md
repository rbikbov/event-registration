# Регистрация на мероприятия

Тестовое задание: сервис регистрации на мероприятия с лимитом мест, листом ожидания,
билетами и чекином. Задание — [docs/task.md](docs/task.md), решения —
[docs/decisions.md](docs/decisions.md), устройство системы —
[docs/architecture.md](docs/architecture.md), ход работы — [docs/roadmap.md](docs/roadmap.md).

Стек: Vue 3 + Vite, Django + DRF, PostgreSQL.

## Состояние

Готовы фаза 0 (каркас) и фаза 1 (регистрация, лист ожидания, отказ). Работают: вход
организатора (демо: `demo@example.com` / `demo`), создание события, публичный список и страница
события с регистрацией, лист ожидания с номером, отказ по токену (API; экран билета — фаза 2),
защита от гонок за последнее место и за один email. Писем, билета по ссылке, чекина, живых
счётчиков и переноса события ещё нет — фазы 2–5.

Линтеры, проверки типов и тесты настроены и проходят локально (`make check`, `make e2e`).
Соответствие требований тестам — в таблице ниже.

## Требования и тесты

Пути — от корня репозитория; `pytest` — `backend/`, `Vitest` — `frontend/src/`, e2e — `e2e/tests/`.

| Требование                                                     | Тест                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Организатор входит, неверный пароль — ошибка                   | `accounts/tests/test_auth_api.py::test_login_returns_user_and_starts_session`, `::test_login_rejects_bad_credentials_with_400`; e2e `organizer-creates-event.spec.ts` («a wrong password …»)                             |
| Организатор создаёт событие и видит его в списке               | `events/tests/test_org_events_api.py::test_create_makes_the_caller_the_organizer`; e2e `organizer-creates-event.spec.ts`                                                                                                 |
| Организатор видит только свои события                          | `events/tests/test_org_events_api.py::test_list_has_only_own_events_ordered_by_start`, `::test_for_organizer_returns_only_that_users_events`                                                                             |
| Место есть — регистрация подтверждена                          | `registrations/tests/test_services.py::test_register_confirms_when_a_seat_is_free`; `EventPage.test.ts` («registers, shows the result …»)                                                                                |
| Повторная регистрация не создаёт второго места                 | `test_services.py::test_register_again_returns_the_same_registration`, `::test_repeat_by_a_registered_email_does_not_take_a_second_seat`; `test_registration_api.py::test_repeat_returns_200_and_no_second_registration` |
| Мест нет — лист ожидания, номер растёт 1, 2, 3                 | `test_services.py::test_register_waitlists_when_no_seats_are_left`, `::test_waitlist_positions_grow_in_registration_order`; e2e `participant-registers.spec.ts`                                                          |
| Отказ подтверждённого повышает первого из листа                | `registrations/tests/test_cancel.py::test_cancel_confirmed_promotes_the_first_waitlisted`, `::test_waitlist_shifts_after_a_promotion`                                                                                    |
| Отказ из листа и повторный отказ никого не повышают            | `test_cancel.py::test_cancel_from_the_waitlist_promotes_nobody`, `::test_repeated_cancel_does_not_promote_a_second_person`                                                                                               |
| Гонка за последнее место: ровно один подтверждён               | `registrations/tests/test_concurrency.py::test_parallel_registrations_for_the_last_seat_confirm_exactly_one`, `::test_parallel_registrations_never_exceed_capacity`                                                      |
| Гонка с одним email: одна регистрация                          | `test_concurrency.py::test_parallel_registrations_of_one_email_make_one_registration`, `::test_parallel_registrations_differing_only_by_case_make_one_registration`                                                      |
| Параллельные отказы повышают ровно столько, сколько освободили | `test_concurrency.py::test_parallel_cancels_of_one_token_promote_exactly_one`, `::test_parallel_cancels_of_different_tokens_fill_seats_from_the_queue_in_order`                                                          |
| Участник регистрируется и видит результат на странице          | e2e `participant-registers.spec.ts`; `EventPage.test.ts`                                                                                                                                                                 |

Один email — одно место. Адреса, отличающиеся только регистром, — один участник; разные адреса
одного ящика (точки и `+tag` в Gmail) считаются разными (`test_services.py::test_email_differing_by_dot_or_tag_is_a_different_registration`).

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
