# Деплой на Railway

Проект — **один процесс**: `npm start` собирает и раздаёт фронтенд (`dist/`),
API (`/api/*`) и Socket.IO с одного порта. Railway ставит зависимости,
выполняет `npm run build`, затем `npm start` (см. `railway.json`). Миграции
базы применяются автоматически при старте сервера.

## Переменные окружения в Railway

В сервисе (Variables) должны быть заданы:

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | ссылка на плагин Postgres: `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | длинная случайная строка (не публиковать) |
| `NODE_ENV` | `production` |
| `NPM_CONFIG_PRODUCTION` | `false` (иначе не ставятся devDependencies и сборка падает: `tsc: not found`) |
| `BREVO_API_KEY` | ключ Brevo (SMTP & API → API Keys). Почта идёт через HTTP-API Brevo, т.к. Railway режет SMTP-порты |
| `MAIL_FROM` | `"Chess 2 · ASCENT" <ящик@gmail.com>` — адрес-отправитель, подтверждённый в Brevo (Senders) |
| `APP_URL` | публичный домен сайта, напр. `https://chess2-production.up.railway.app` (нужен для ссылок в письмах; НЕ localhost) |
| `TOTP_ENCRYPTION_KEY` | 32-байтовый ключ в hex (64 символа) для шифрования секретов 2FA |

**`TOTP_ENCRYPTION_KEY` должен совпадать с локальным `.env`** — иначе после
деплоя расшифровка уже включённых у пользователей секретов 2FA сломается.
Сгенерировать новый (если нужно):
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

`PORT` Railway задаёт сам — трогать не нужно. Если используете **публичный**
адрес базы (не внутренний `*.railway.internal`) и он требует TLS — добавьте
`DATABASE_SSL=1`.

## Способ 1 — через GitHub (рекомендуется)

1. Создайте пустой репозиторий на GitHub.
2. Локально привяжите и запушьте:
   ```bash
   git remote add origin https://github.com/<вы>/<репозиторий>.git
   git push -u origin master
   ```
3. В Railway: **New → Deploy from GitHub repo**, выберите репозиторий.
4. Добавьте плагин **PostgreSQL** (если ещё не добавлен) и задайте переменные
   окружения из таблицы выше.
5. Railway соберёт и запустит проект. Каждый `git push` — новый деплой.

## Способ 2 — через Railway CLI (без GitHub)

```bash
npm i -g @railway/cli
railway login          # откроется браузер для входа
railway link           # выбрать существующий проект
railway up             # собрать и задеплоить текущую папку
```

Переменные окружения задаются в дашборде Railway так же, как в способе 1.

## После деплоя

- Откройте выданный Railway домен — должна открыться игра.
- Проверка живости: `https://<домен>/api/health` → `{"ok":true,"db":"ok"}`.
- Первую регистрацию делайте прямо на сайте; база и таблицы создаются
  миграцией при первом старте.
