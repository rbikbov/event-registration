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

| Требование                                                                                   | Тест                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Организатор входит, неверный пароль — ошибка                                                 | `accounts/tests/test_auth_api.py::test_login_returns_user_and_starts_session`, `::test_login_rejects_bad_credentials_with_400`; e2e `organizer-creates-event.spec.ts` («a wrong password …»)                                            |
| Организатор создаёт событие и видит его в списке                                             | `events/tests/test_org_events_api.py::test_create_makes_the_caller_the_organizer`; e2e `organizer-creates-event.spec.ts`                                                                                                                |
| Организатор видит только свои события                                                        | `events/tests/test_org_events_api.py::test_list_has_only_own_events_ordered_by_start`, `::test_for_organizer_returns_only_that_users_events`                                                                                            |
| Место есть — регистрация подтверждена                                                        | `registrations/tests/test_services.py::test_register_confirms_when_a_seat_is_free`; `EventPage.test.ts` («registers, shows the result …»)                                                                                               |
| Повторная регистрация не создаёт второго места                                               | `test_services.py::test_register_again_returns_the_same_registration`, `::test_repeat_by_a_registered_email_does_not_take_a_second_seat`; `test_registration_api.py::test_repeat_returns_200_and_no_second_registration`                |
| Мест нет — лист ожидания, номер растёт 1, 2, 3                                               | `test_services.py::test_register_waitlists_when_no_seats_are_left`, `::test_waitlist_positions_grow_in_registration_order`; e2e `participant-registers.spec.ts`                                                                         |
| Отказ подтверждённого повышает первого из листа                                              | `registrations/tests/test_cancel.py::test_cancel_confirmed_promotes_the_first_waitlisted`, `::test_waitlist_shifts_after_a_promotion`                                                                                                   |
| Отказ из листа и повторный отказ никого не повышают                                          | `test_cancel.py::test_cancel_from_the_waitlist_promotes_nobody`, `::test_repeated_cancel_does_not_promote_a_second_person`                                                                                                              |
| Гонка за последнее место: ровно один подтверждён                                             | `registrations/tests/test_concurrency.py::test_parallel_registrations_for_the_last_seat_confirm_exactly_one`, `::test_parallel_registrations_never_exceed_capacity`                                                                     |
| Гонка с одним email: одна регистрация                                                        | `test_concurrency.py::test_parallel_registrations_of_one_email_make_one_registration`, `::test_parallel_registrations_differing_only_by_case_make_one_registration`                                                                     |
| Параллельные отказы повышают ровно столько, сколько освободили                               | `test_concurrency.py::test_parallel_cancels_of_one_token_promote_exactly_one`, `::test_parallel_cancels_of_different_tokens_fill_seats_from_the_queue_in_order`                                                                         |
| Участник регистрируется и видит результат на странице                                        | e2e `participant-registers.spec.ts`; `EventPage.test.ts`                                                                                                                                                                                |
| Получил место — письмо с кодом билета и ссылкой                                              | `registrations/tests/test_emails.py::test_register_on_a_seat_queues_one_ticket_email`; `emails/tests/test_services.py::test_ticket_email_is_a_snapshot_with_code_date_and_link`; e2e `participant-opens-ticket.spec.ts`                 |
| Повтор регистрации писем не шлёт; одно изменение — одно письмо                               | `test_emails.py::test_repeated_register_queues_no_more_emails`; `emails/tests/test_services.py::test_same_dedup_key_is_queued_once`                                                                                                     |
| Попал в лист ожидания — письмо с номером и ссылкой                                           | `test_emails.py::test_register_on_the_waitlist_queues_waitlisted_with_the_position`; e2e `waitlisted-gets-promoted.spec.ts`                                                                                                             |
| Кто-то отказался — первый из листа получает место и письмо                                   | `test_emails.py::test_cancel_confirmed_queues_promoted_for_the_waitlist_head`; e2e `waitlisted-gets-promoted.spec.ts`                                                                                                                   |
| Отказ из листа, повторный отказ, отказ при пустом листе — без писем                          | `test_emails.py::test_cancel_from_the_waitlist_queues_no_email`, `::test_repeated_cancel_queues_no_email`, `::test_cancel_with_an_empty_waitlist_queues_no_email`                                                                       |
| Регистрация после отказа — новое письмо с новым кодом                                        | `test_emails.py::test_revival_after_cancel_queues_a_new_email_with_the_new_code`, `::test_revival_onto_the_waitlist_queues_a_new_waitlisted`                                                                                            |
| Воркер отправляет письмо один раз                                                            | `emails/tests/test_worker.py::test_pending_email_is_sent_and_marked_sent`, `::test_sent_email_is_not_sent_again`                                                                                                                        |
| Ошибка SMTP — повтор с растущей паузой, после 5 попыток — `failed`; пачка не останавливается | `test_worker.py::test_failed_send_is_retried_later`, `::test_pause_between_attempts_doubles_and_the_last_attempt_fails_the_email`, `::test_failed_email_does_not_stop_the_batch`, `::test_silent_smtp_server_is_retried_like_a_refusal` |
| Воркер переживает потерю соединения с БД                                                     | `emails/tests/test_run_worker.py::test_lost_database_connection_is_logged_and_the_next_poll_reconnects`                                                                                                                                 |
| Два воркера: каждое письмо отправлено один раз                                               | `emails/tests/test_concurrency.py::test_two_workers_send_each_email_once`                                                                                                                                                               |
| В логе воркера нет адресов и текста ошибки                                                   | `test_worker.py::test_failure_is_logged_with_the_email_id_and_error_class_only`, `::test_bug_is_logged_as_an_error_with_the_stack_but_not_the_message`                                                                                  |
| Билет по ссылке из письма: код, №N, «отменена», «не найден»; отказ с подтверждением          | `registrations/tests/test_ticket.py` (`test_ticket_api_*`); `TicketPage.test.ts`; e2e `participant-opens-ticket.spec.ts`                                                                                                                |

Один email — одно место. Адреса, отличающиеся только регистром, — один участник; разные адреса
одного ящика (точки и `+tag` в Gmail) считаются разными (`test_services.py::test_email_differing_by_dot_or_tag_is_a_different_registration`).

Письмо создаётся ровно один раз — в той же транзакции, что и регистрация или отказ
(`UNIQUE` на ключе письма). Доставка — «хотя бы один раз»: если воркер упадёт после
отправки, но до записи `sent`, письмо уйдёт повторно. Неудачная попытка повторяется через
30 с, 1, 2 и 4 мин; после 5-й письмо остаётся в outbox со статусом `failed` — его видно в
админке (<http://localhost:8000/admin/>, `admin@example.com` / `admin`).

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
| mailpit  | <http://localhost:8025> | SMTP-ловушка: сюда приходят все письма (наружу не уходят) |
| worker   | —                       | отправляет письма из outbox в Mailpit                     |

Порты меняются переменными `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `MAILPIT_PORT`
(веб Mailpit) и `MAILPIT_SMTP_PORT`.

Разработка — установка инструментов, команды, проверки и правила — в
[docs/development.md](docs/development.md).
