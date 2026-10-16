# dekard

MCP-сервер заметок для ИИ-агентов: общая память между чатами и сессиями.

Пример: несколько скиллов прогоняют `tsc` перед действием. Если коммит уже проверен в другом чате, агент читает заметку `tsc/<hash>` и не запускает проверку повторно.

## Возможности

- Заметки вида `topic` / `key` / `value`
- Иерархические топики через `/`: запрос `company/branch` вернёт заметки из `company/branch`, `company/branch/a`, `company/branch/a/b`, но не из `company/branchX`
- Мягкое удаление: удалённая заметка скрыта, но 30 дней её можно восстановить, после чего она удаляется окончательно
- Хранение в SQLite (встроенный `node:sqlite`), безопасная параллельная работа нескольких чатов (WAL)
- Все запросы параметризованы — защищено от SQL-инъекций, покрыто тестами

## Инструменты

| Инструмент | Параметры | Результат |
|---|---|---|
| `add_note` | `topic`, `key`, `value` | Создаёт или перезаписывает заметку |
| `get_note` | `topic`, `key` | Заметка или `null` |
| `get_topic_notes` | `topic` | Заметки топика и всех вложенных топиков |
| `delete_note` | `topic`, `key` | `true`, если заметка удалена |
| `restore_note` | `topic`, `key` | Восстановленная заметка или `null` |
| `get_deleted_topic_notes` | `topic` | Удалённые заметки, которые ещё можно восстановить |

Слэши в конце топика отбрасываются (`tsc/` → `tsc`). Символ `\0` в строках запрещён.

## Требования

Node.js **22.18+** — TypeScript запускается напрямую, без сборки.

## Установка

```bash
git clone https://github.com/imabramon/dekard.git
cd dekard
npm install
```

### Claude Code

```bash
claude mcp add dekard --scope user -- node /path/to/dekard/src/index.ts
```

### Другие MCP-клиенты

```json
{
  "mcpServers": {
    "dekard": {
      "command": "node",
      "args": ["/path/to/dekard/src/index.ts"]
    }
  }
}
```

## Где хранятся данные

| ОС | Путь |
|---|---|
| Windows | `%LOCALAPPDATA%\dekard\notes.db` |
| macOS | `~/Library/Application Support/dekard/notes.db` |
| Linux | `$XDG_DATA_HOME/dekard/notes.db` (по умолчанию `~/.local/share/dekard/notes.db`) |

Путь можно переопределить переменной окружения `DEKARD_DB`:

```bash
claude mcp add dekard --scope user -e DEKARD_DB=/path/to/notes.db -- node /path/to/dekard/src/index.ts
```

## Пример для скилла

```markdown
- получи хэш коммита: `git rev-parse HEAD`; если есть незакоммиченные изменения — заметки не используй
- вызови get_note(topic="tsc", key=<хэш>); если value="passed" — tsc не запускай
- иначе запусти tsc; если ошибок нет — add_note(topic="tsc", key=<хэш>, value="passed")
```

## Архитектура

```
src/
  index.ts                 сборка зависимостей и запуск по stdio
  createServer.ts          регистрация MCP-инструментов
  getAppDataDir.ts         системная папка данных
  notes/
    Note.ts                модель
    INotesRepository.ts    контракт хранилища
    NotesService.ts        бизнес-логика: нормализация, валидация, срок хранения
  infrastructure/
    SqliteNotesRepository.ts  реализация INotesRepository на SQLite
```

Чтобы сменить хранилище, реализуйте `INotesRepository` и передайте его в `NotesService` в `src/index.ts`.

## Тесты

```bash
npm test
```

Функциональные тесты репозитория, сервиса и MCP-инструментов, а также тесты безопасности (SQL-инъекции, подмена типов, спецсимволы).
