# Как делалось с ИИ

## Модель и инструмент

Claude Code (CLI, WSL). Модели — Claude Opus 5.5 (основная: 261 коммит с её подписью
`Co-Authored-By` на закрытии фазы 7) и Claude Sonnet 5.5 (54 коммита, почти все — 30 октября).
Пересчитать: `git log --format='%(trailers:key=Co-Authored-By,valueonly)' | grep -ci opus`.

Claude Code — агент в терминале: сам запускает тесты, git и Docker, а хуки, skills и
субагенты встраивают проверки и независимое ревью прямо в процесс. Сначала план и ревью
делались с Opus, а реализация — с Sonnet; но при моей скорости работы Opus был комфортнее и
для реализации, а лимита подписки на него хватало целиком — поэтому дальше всё шло на Opus.

Как с агентом работали — [AGENTS.md](../AGENTS.md) (правила, которые агент читает в начале
каждой сессии), `.claude/skills/` (процедуры: фаза от spec до ревью, передача сессии,
проверка на мусор), `.claude/agents/reviewer.md` (независимое ревью каждого этапа с чистым
контекстом), `.claude/hooks/` (форматирование после правки, запрет `--no-verify` и force push).
Решения, принятые в обсуждении с агентом, — в [docs/decisions.md](decisions.md) с
временем; spec и задачи каждой фазы — в `docs/features/<фаза>/`.

Экспорт сессий агента — [docs/session/](session/): по файлу на сессию Claude Code, текстом
в формате, близком к `/export` (запросы, ответы, вызовы инструментов и начало их вывода; без
мыслей модели и переписки субагентов). Имя — начало сессии и примерное время работы: паузы
между репликами считаются не больше 15 минут. Пересобрать или дополнить —
`make export-sessions`.

## Ход работы

Работа шла с 28 октября по 4 ноября 2026 года, сессиями. Каждая сессия отмечена в
[docs/decisions.md](decisions.md) маркерами `▶ начало` и `■ конец`; `make worktime`
суммирует их (на закрытии фазы 7 — 58 ч 35 мин). Маркеры заведены вечером 29 октября, более
ранние сессии отмечены задним числом по времени коммитов (такие записи помечены). Этапы фаз —
отдельные ветки и PR с этапа 3 фазы 1 (PR #1); с него же каждый этап проходит независимое
ревью агентом `reviewer`, с PR #7 — в отдельной копии репозитория и своём стеке.
Коммиты — маленькими шагами, по одному на задачу.

## Что взято чужое

- Устройство правил агента (`AGENTS.md` + `CLAUDE.md`, правила, которые действуют всегда),
  skills `feature-workflow`, `fsd-frontend`, `anti-slop-review` и агент `reviewer` — из моего
  шаблона [rbikbov/frontend-starter](https://github.com/rbikbov/frontend-starter), адаптированы
  под Django + Vue (`docs/decisions.md`, 2026-10-28, 21:25, 21:41 и 23:00). Хуки и skills
  `session-handoff`, `api-change` написаны в этом проекте.
- Skills `vue-best-practices`, `vue-router-best-practices`, `vue-testing-best-practices`
  ([vuejs-ai/skills](https://github.com/vuejs-ai/skills)) и `django-security`
  ([affaan-m/ecc](https://github.com/affaan-m/ecc)) — целиком, через `npx skills add`; версии —
  в `skills-lock.json`, лежат в `.agents/skills/`.
- UI-компоненты — [shadcn-vue](https://www.shadcn-vue.com/), сгенерированы его CLI в
  `frontend/src/shared/ui/shadcn/`.
- Каркасы Django и Vue генераторами (`startproject`, `create-vue`) не создавались — написаны
  агентом.
