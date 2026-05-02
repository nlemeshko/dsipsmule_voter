# DSIPSMULE voter

Мини-сервис голосования с:

- авторизацией через Telegram Login Widget;
- несколькими независимыми голосованиями по отдельным ссылкам;
- поддержкой прямых внешних аудиоссылок (`.m4a`, `.mp3`, `.ogg`, `.wav` и др.) через собственный HTML5-плеер;
- сохранением голосов в SQLite;
- админкой со статистикой по участникам, пользователям и голосам.

## Запуск

1. Скопируйте `.env.example` в `.env`.
2. В `@BotFather` выполните `/setdomain` и укажите домен сайта.
3. Укажите `TELEGRAM_BOT_USERNAME` и `TELEGRAM_BOT_TOKEN`.
4. Запустите:

```bash
npm install
npm run dev
```

## Docker

Сборка образа:

```bash
docker build -t dsipsmule-voter .
```

Запуск контейнера:

```bash
docker run --rm -p 3000:3000 --env-file .env -v dsipsmule-voter-data:/app/storage dsipsmule-voter
```

Или через Compose:

```bash
docker compose up --build
```

SQLite внутри Docker сохраняется в volume `voting_storage`.

## GitHub Actions

В репозиторий добавлен workflow `CI`, который:

- ставит зависимости через `npm ci`;
- проверяет синтаксис `app.js`;
- собирает Docker image;
- пушит образ в `ghcr.io` при пуше в `main`.

Итоговый image публикуется как `ghcr.io/<owner>/<repo>`.

## Helm

Helm chart лежит в `helm/smule-followers`.

Пример установки:

```bash
helm upgrade --install dsipsmule-voter ./helm/smule-followers \
  --set image.repository=ghcr.io/<owner>/<repo> \
  --set image.tag=latest \
  --set app.baseUrl=https://vote.example.com \
  --set app.telegramBotUsername=dsipsmule_bot \
  --set app.telegramBotToken=YOUR_BOT_TOKEN \
  --set app.sessionSecret=YOUR_SESSION_SECRET \
  --set app.adminUsername=admin \
  --set app.adminPassword=change-me \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=vote.example.com
```

Chart создаёт `Deployment`, `Service`, `Secret`, `Ingress` и `PersistentVolumeClaim` для SQLite.

## Основные URL

- `/` — список активных голосований
- `/polls/<slug>` — публичная страница конкретного этапа / голосования
- `/polls/<slug>/thanks` — финальная страница после успешного голоса
- `/admin/login` — вход в админку
- `/admin` — панель администратора

## Несколько голосований

В админке можно создавать отдельные голосования со своими:

- названием;
- `slug` для ссылки;
- описанием;
- URL редиректа после завершения;
- набором участников.

Для каждого голосования формируется отдельная ссылка вида `/polls/<slug>`, а прогресс пользователя хранится отдельно по каждому этапу.

## Что сохраняется

- данные пользователя из Telegram: `id`, имя, username, фото и полный raw payload;
- телефон через Login Widget Telegram не приходит;
- каждый вход пользователя;
- каждый голос: кто голосовал, за кого, против кого, когда.

## Telegram Login

Реализация использует Telegram Login Widget:

- `https://telegram.org/js/telegram-widget.js?23`
- `data-auth-url="/auth/telegram/widget"`
- серверную проверку `hash` по схеме из документации Telegram.
