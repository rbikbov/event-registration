# src/shared/api — сеть и ошибки

- `api` (openapi-fetch) + `unwrap()` — единственный путь к backend. `unwrap` возвращает
  данные или бросает `AppError`; сетевую ошибку — как `kind: "network"`.
- `AppError.kind` выводится из HTTP-статуса в `app-error.ts` и только там. Новый статус или
  новый `kind` — правка `kindForStatus` и новый случай в `app-error.test.ts`.
- `csrf.ts` — middleware: `X-CSRFToken` из cookie `csrftoken` на всех изменяющих запросах;
  страницы заголовок сами не ставят.
- - 400 несёт `AppError.fields` — коды ошибок по полям (`{"errors": {поле: [код]}}`); тексты по
    кодам подбирает форма в своём `<i18n>`.
- Выше этой папки не читают `Response`, статусы и тексты ошибок — только `kind`.
- `schema.d.ts` генерируется из `backend/openapi.yaml` (`make schema`) и руками не правится;
  `make schema-check` сравнивает его с генерацией.
- Запросы конкретных сущностей сюда не кладутся: `queryOptions` живут в `pages/<page>/api`
  (нужно одной странице) или в `entities/<x>/api` (нужно нескольким срезам).
- `fetch` передаётся клиенту функцией (`(r) => globalThis.fetch(r)`): иначе openapi-fetch
  запоминает его при импорте, и MSW в тестах не перехватывает запросы.
- Тесты — MSW: каждый тест объявляет свою сеть через `server.use()`; запрос без обработчика
  роняет тест.
