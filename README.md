# Регистрация на мероприятия

Тестовое задание: сервис регистрации на мероприятия с лимитом мест, листом ожидания, билетами
и чекином. Стек: Vue 3 + Vite, Django + DRF, PostgreSQL 17. Все требования задания сделаны и
покрыты тестами; что именно работает — [docs/features.md](docs/features.md).

## Запуск

Нужен только Docker с Compose и `make`.

```sh
make up          # весь стек в Docker
make demo-users  # демо-учётка организатора: demo@example.com / demo
make seed        # демо-события с участниками
```

Открыть <http://localhost:5173>, письма — в Mailpit <http://localhost:8025>. Остановить —
`make down`. Сервисы, порты и разработка — [docs/development.md](docs/development.md).

## Что доказано тестами

- **Последнее место:** два человека одновременно — место одному, второй в листе ожидания;
  один email — одна регистрация. Замок строки события, гонки — `docs/rules/concurrency.md`.
- **Чекин:** билет проходит один раз, в том числе при одновременных запросах (условный
  `UPDATE`).
- **Письма:** через transactional outbox и отдельный воркер, с повторами при ошибке SMTP;
  доставка «хотя бы один раз».
- **Напоминание:** ровно одно за сутки до события, после переноса — новое, о новой дате.
- **Live:** счётчики организатора и свободные места обновляются во всех вкладках (SSE +
  Postgres `LISTEN/NOTIFY`); e2e с двумя контекстами браузера.

Линтеры, типы, pytest, Vitest и Playwright — в CI на каждый PR (`make check`, `make e2e`).

## Требования и тесты

Пути — от корня репозитория; `pytest` — `backend/`, `Vitest` — `frontend/src/`, e2e — `e2e/tests/`.
Что каждый упомянутый тест существует, проверяет `make check-readme` (входит в `make check`).

Пункты задания его словами; общие требования и подробная таблица по каждому поведению —
[docs/requirements.md](docs/requirements.md).

| Требование задания                                                                   | Тест                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Событие: описание, дата и время, лимит мест                                          | `events/tests/test_org_events_api.py::test_create_makes_the_caller_the_organizer`, `::test_create_requires_all_main_fields`; e2e `organizer-creates-event.spec.ts`                                                                                                  |
| Регистрация участника по email                                                       | `registrations/tests/test_registration_api.py::test_register_returns_201_and_status_without_secrets`; e2e `participant-registers.spec.ts`                                                                                                                           |
| Отказ от участия                                                                     | `registrations/tests/test_cancel.py::test_cancel_api_returns_200_and_status`; e2e `participant-opens-ticket.spec.ts`                                                                                                                                                |
| Лист ожидания, когда места кончились                                                 | `registrations/tests/test_services.py::test_register_waitlists_when_no_seats_are_left`; e2e `participant-registers.spec.ts`                                                                                                                                         |
| Билет с кодом и экран чекина на входе (ввод кода)                                    | `registrations/tests/test_checkin.py::test_check_in_marks_a_confirmed_ticket`; e2e `organizer-checks-in.spec.ts`                                                                                                                                                    |
| Экран организатора: сколько зарегистрировано, в листе ожидания, пришло               | `events/tests/test_org_event_detail_api.py::test_detail_has_the_event_and_its_counts`; e2e `two-participants-last-seat.spec.ts`, `organizer-checks-in.spec.ts`                                                                                                      |
| Зарегистрировавшийся получает письмо с билетом                                       | `registrations/tests/test_emails.py::test_register_on_a_seat_queues_one_ticket_email`; `emails/tests/test_worker.py::test_pending_email_is_sent_and_marked_sent`; e2e `participant-opens-ticket.spec.ts`                                                            |
| Повторная регистрация на тот же email не создаёт второго места                       | `registrations/tests/test_registration_api.py::test_repeat_returns_200_and_no_second_registration`; `registrations/tests/test_concurrency.py::test_parallel_registrations_of_one_email_make_one_registration`                                                       |
| Кто-то отказался — первый из листа автоматически получает место и письмо             | `registrations/tests/test_emails.py::test_cancel_confirmed_queues_promoted_for_the_waitlist_head`; e2e `waitlisted-gets-promoted.spec.ts`                                                                                                                           |
| Два человека на последнее место одновременно: место одному, второй — в лист ожидания | `registrations/tests/test_concurrency.py::test_parallel_registrations_for_the_last_seat_confirm_exactly_one`; e2e с двумя браузерами `two-participants-last-seat.spec.ts`                                                                                           |
| За сутки до события всем участникам — напоминание, ровно одно                        | `registrations/tests/test_reminders.py::test_open_window_reminds_each_seat_once`; `emails/tests/test_run_worker.py::test_worker_queues_reminders_once_an_interval`. Без e2e: сутки в тесте не прождать; вживую — `make seed`, через ~30 с три напоминания в Mailpit |
| Билет проходит чекин один раз                                                        | `registrations/tests/test_concurrency.py::test_parallel_check_ins_of_one_code_mark_it_once`; e2e `organizer-checks-in.spec.ts` (повтор на одном входе и «one code at two entrances at once …»)                                                                      |
| Счётчик пришедших у организатора обновляется live                                    | e2e `organizer-sees-arrivals-live.spec.ts`; `events/tests/test_org_event_stream_api.py::test_check_in_sends_a_new_snapshot`                                                                                                                                         |
| Организатор перенёс событие — все участники получают письмо                          | `registrations/tests/test_update_event.py::test_reschedule_emails_confirmed_and_waitlisted_and_bumps_the_version`; e2e `organizer-reschedules-event.spec.ts`                                                                                                        |

## Ограничения

- Только локальный запуск: режим разработки, без HTTPS, деплоя нет.
- Живые обновления держит один процесс backend: для демо хватает, для тысяч соединений нужен
  push-сервер.
- Письма «хотя бы один раз»: если воркер упадёт между отправкой и отметкой, письмо уйдёт
  повторно.
- Организаторов создаёт команда или админка, экрана регистрации нет; на начавшееся событие
  можно зарегистрироваться.
- Изредка нестабилен один прогон Vitest (`vue-i18n` после закрытия jsdom), повтор зелёный.

Что отложено и что нужно, чтобы это стало продуктом, — [docs/roadmap.md](docs/roadmap.md#что-дальше).

## Документы

- [Задание](docs/task.md) и [лог решений с временем](docs/decisions.md)
- [Устройство системы](docs/architecture.md) и [ход работы по фазам](docs/roadmap.md)
- [Как делалось с ИИ](docs/ai-workflow.md): Claude Code, правила агента, ревью, экспорт сессий,
  что взято чужое
- `AGENTS.md` в папках — правила для агента; `CLAUDE.md` рядом — одна строка `@AGENTS.md`,
  потому что Claude Code читает только его.
