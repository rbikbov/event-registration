# frontend/ — Vue 3 + Vite

Команды и инструменты — `docs/development.md`, раздел «Frontend». Как писать код (слои, DI,
состояние, тесты) — skill `fsd-frontend`. Здесь — правила, которые действуют всегда.

## Карта

```text
src/main.ts          точка входа: mountApp("#app")
src/app/             приложение: App.vue, router.ts, query-client.ts
src/pages/<page>/    экраны: ui/, api/ (запросы, нужные только странице), index.ts
src/entities/session/ кто вошёл: meQuery (null — гость)
src/entities/event/  события: orgEventsQuery / orgEventQuery(id) / orgEventLive(id) (организатор), publicEventsQuery / publicEventQuery(id) (публичные)
src/shared/api/      клиент API, AppError, unwrap, сгенерированный schema.d.ts. Правила: src/shared/api/AGENTS.md
src/shared/ui/       самописные компоненты (query-state — загрузка и ошибки запроса, `RetryAlert` — ошибка с повтором); ui/shadcn/ — сгенерированные shadcn-vue, руками не правятся
src/shared/config/   routes — все пути приложения
src/shared/lib/      утилиты; live-source (`LiveSource` — данные от сервера, `sseSource` — по SSE) и use-live — подписка на время жизни компонента; lib/test/ — MSW, фейк EventSource и setup для Vitest
src/widgets|features/            появляются с первым срезом, пустыми не создаются
```

## Правила

1. Импорт — только в нижние слои; в чужой срез — только через его `index.ts`. Проверяет
   ESLint (`boundaries/dependencies`); правило не отключать и не обходить.
2. Сеть — только через `api` и `unwrap()` из `@/shared/api`. Выше `shared/api` нет `fetch`,
   `Response` и HTTP-статусов: только данные и `AppError.kind`.
3. Типы API не пишутся руками — они из `schema.d.ts` (`make schema`). Нужен тип ответа —
   `components["schemas"]["<Имя>"]`.
4. Каждое асинхронное действие в UI показывает загрузку, ошибку и пустое состояние и
   блокирует повторную отправку.
   Данные запроса на странице выводятся через `QueryState` (`shared/ui/query-state`), а не
   цепочкой `v-if="isPending"` / `v-else-if="isError"` / `v-else-if="data"`. TanStack Query
   при неудачном фоновом обновлении (фокус окна, `invalidateQueries`) ставит `isError`, но
   оставляет `data`: ветка ошибки перед веткой данных прячет уже загруженное. Ошибка — на
   месте данных, только если данных нет; иначе — алерт над прежними данными. Ответы, которые
   повтор не меняет (`not_found`, `forbidden`), страница показывает до `QueryState`. Тест
   страницы с запросом проверяет и неудачный `refetchQueries()` после загрузки.
   Исключения: `pages/health` — страница показывает текущую доступность backend, и после
   неудачного обновления верно «недоступен», а не прежнее «работает»; `pages/org-checkin` —
   форма работает и без события (название — только подпись), а `QueryState` прячет
   содержимое до данных: там своя разметка, ошибка запроса — через `RetryAlert` из того же
   `shared/ui/query-state` (повтор блокирует кнопку и показывает, что запрос идёт).
5. Тексты интерфейса — по-русски, в блоке `<i18n lang="json" locale="ru">` того же
   компонента, достаются через `useI18n({ useScope: "local" })`; в store и чистых функциях
   текстов нет (они возвращают коды, компонент подбирает текст). Глобальных сообщений нет.
   Символ `@` в сообщении пишется `{'@'}`, иначе сборка падает.
6. Имена: компоненты — `PascalCase.vue`, остальные файлы — `kebab-case.ts`, composable —
   `use-<что>.ts` с функцией `use<Что>`. Тест — рядом: `<файл>.test.ts`.
7. Без `any`, `@ts-ignore`, `as unknown as`, пустых `catch`, `console.log`. Каждый промис —
   `await` или `void` с обработкой ошибки внутри.
8. Тесты: сеть — только MSW (`server.use()` в каждом тесте), свои модули не мокаются через
   `vi.mock` — зависимости передаются явно (skill `fsd-frontend`, раздел про DI).
9. Компонент из `shared/ui/shadcn/` не правится: нужен другой вид — обёртка в `shared/ui/`
   или токены в `app/styles.css`. Новый — `pnpm dlx shadcn-vue@latest add <имя>`, только
   с потребителем.
   Заголовок карточки — `CardHeading` с `level` (`shared/ui/card-heading`), не `CardTitle`:
   тот всегда `h3` и молча игнорирует `as`.
10. Пути маршрутов — только из `routes` (`@/shared/config`): ни в роутере, ни в
    `router.push`/`RouterLink`, ни в тестах строкой `"/..."` не пишутся.
