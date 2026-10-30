---
name: api-change
description: >
  Процедура изменения API: serializer, view или URL backend → тест → схема OpenAPI → типы
  фронтенда → вызов с фронтенда. Использовать, когда добавляется или меняется эндпоинт, поле
  запроса или ответа, статус ответа. Не использовать для правок логики без изменения
  контракта.
---

# Изменение API

Контракт API живёт в трёх местах, которые меняются вместе, в одном коммите:
код backend → `backend/openapi.yaml` → `frontend/src/shared/api/schema.d.ts`.

## Порядок

1. **Тест вперёд.** Логика — функция в `<app>/services.py`, тест вызывает её напрямую
   (правило 1 `backend/AGENTS.md`). Поведение эндпоинта — тест через `APIClient`: статус,
   тело, права. Гонки и блокировки — `django_db(transaction=True)` (правило 5).
2. **Serializer и view.** View тонкий: разбор запроса, вызов сервиса, ответ. Ошибки
   предметной области — исключения сервиса, которые view переводит в статус.
3. **Описание для схемы.** Ответ не из serializer, несколько статусов или поток —
   `@extend_schema` (образцы — `backend/config/health.py`, `backend/accounts/views.py`).
   Перечислить все статусы, которые
   эндпоинт реально возвращает, включая 4xx.
4. **`make schema`.** Обновит `backend/openapi.yaml` и `schema.d.ts`. Не править их руками.
5. **Фронтенд.** Тип ответа — `components["schemas"]["<Имя>"]`, вызов — через `api` и
   `unwrap()` из `@/shared/api`. Если поле или путь изменились, `make check-frontend`
   упадёт на vue-tsc — это и есть проверка контракта (`frontend/AGENTS.md`, правила 2–3).
6. **Проверка.** `make check-backend` (в нём `schema-check`) и `make check-frontend`.
   Схема и типы — в том же коммите, что и код.

## Что проверить на каждом эндпоинте

- **Права.** Организаторский эндпоинт (`/api/org/...`) требует входа (права по умолчанию —
  `IsAuthenticated`; публичный view явно ставит `AllowAny`). Событие берётся через
  `get_org_event(user, id)`: несуществующее — 404, чужое — 403 (решение от 01:17 в
  `docs/decisions.md`); список — через `Event.objects.for_organizer(user)`. Тест:
  пользователь A по id события B получает 403, а не данные; гость — 401.
- **CSRF.** Изменяющий запрос организатора идёт с `X-CSRFToken` (`shared/api/csrf.ts`
  добавляет сам). Тест CSRF — `APIClient(enforce_csrf_checks=True)`, образец —
  `test_logout_requires_csrf_token`.
  Публичные эндпоинты участника (регистрация, отказ по токену) от сессии не зависят.
- **Список.** Счётчики и связанные объекты — без запроса на строку; тест с
  `django_assert_num_queries` (правило 10 `backend/AGENTS.md`).
- **Ответ без лишнего.** В ответ не попадают данные, дающие доступ к чужому: код билета в
  ответе регистрации не возвращается, он приходит только письмом (`docs/architecture.md`,
  раздел «API»).
- **Логи.** Ни email, ни имён, ни кодов, ни токенов (правило 8).

## Ошибки

Фронтенд приводит статус к `AppError.kind` (`shared/api/app-error.ts`: 400/422 — `validation`,
401 — `unauthorized`, 403 — `forbidden`, 404 — `not_found`, 409 — `conflict`, 5xx — `server`).
Новый статус — правка `kindForStatus` и тест. Анонимный запрос к закрытому эндпоинту — 401
(`accounts.authentication.SessionAuthenticationWith401`: без заголовка `WWW-Authenticate`
DRF подменяет 401 на 403); 403 — «вошёл, но нельзя» (чужое событие, CSRF). «Неверный логин» —
400, чтобы не путать с протухшей сессией.

Ошибки полей (400 `ValidationError`) — коды, а не тексты: DRF отдаёт английские сообщения, а
интерфейс русский. `config.exceptions.api_exception_handler` превращает тело в
`{"errors": {"поле": ["код"]}}` (`exc.get_codes()`: `required`, `blank`, `max_length`,
`min_value`, `invalid`…); ошибка вне поля (из `validate()`) — под `non_field_errors`. Свой код
для правила предметной области — `ValidationError(msg, code="past")`. Форма сопоставляет код
с текстом в своём `<i18n>`; коды полей фронтенд кладёт в `AppError.fields` (задача 2.2). В схему 400 попадает через
`responses={400: ValidationErrorSerializer}` (`config.exceptions`) — указывать у каждого
эндпоинта с телом запроса. Остальные 4xx сохраняют `{"detail": "..."}`.

Образец теста эндпоинта — `backend/accounts/tests/test_auth_api.py`: `APIClient`,
`force_login`, параметризованные плохие входы, статус и тело.

## Готово, когда

- Тест эндпоинта и тест логики проходят; `make check-backend` и `make check-frontend` зелёные.
- `openapi.yaml` и `schema.d.ts` в коммите; `git diff` схемы содержит только ожидаемое.
- Изменение документировано: эндпоинт в `docs/architecture.md` (раздел «API») приведён к
  коду, статус раздела обновлён.
