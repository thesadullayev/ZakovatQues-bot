# Zakovat Bot — Cloudflare Workers (этап 1)

Это стартовая webhook-адаптация. Она НЕ переносит все функции исходного Python-бота на этом этапе.
Сейчас поддерживаются: webhook, проверка OWNER_ID, /start /help, /packs, чтение и ответы
из JSON-пакетов, переход `/go N`. Хранилища: Cloudflare KV для пакетов и состояния.
На следующем этапе переносим загрузку PDF/DOCX/TXT/MD, zakovatklubi API, картинки,
авто-режим и более полный UI.

## Подготовка

1. Установить Node.js LTS.
2. В терминале в папке проекта:
   `npm install -g wrangler`
   `wrangler login`
3. Создать namespace:
   `wrangler kv namespace create PACKS`
   `wrangler kv namespace create STATE`
4. Вставить полученные ID в `wrangler.toml` вместо заглушек.
5. Добавить секреты:
   `wrangler secret put BOT_TOKEN`
   `wrangler secret put OWNER_ID`
   `wrangler secret put WEBHOOK_SECRET`
   Для WEBHOOK_SECRET придумать случайную строку (1–64 символа, допустимые: A-Z a-z 0-9 _ -).
6. Развернуть:
   `wrangler deploy`
7. Добавить пакеты (пример ниже). После деплоя URL Worker будет показан Wrangler.

## Загрузить seed_pack.json в KV

`wrangler kv key put --binding PACKS "pack:876e5352dd" --path seed_pack.json`

(Для новых пакетов их JSON надо импортировать в KV аналогичным образом.)

## Установить webhook

С URL Worker и токеном выполните в браузере/терминале запрос Telegram API `setWebhook`:
- URL: `https://api.telegram.org/bot<TOKEN>/setWebhook`
- JSON-параметры: `url` = `https://<worker-subdomain>.workers.dev`,
  `secret_token` = значение WEBHOOK_SECRET.

Пример curl:
`curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" -H "Content-Type: application/json" -d '{"url":"https://YOUR-WORKER.workers.dev","secret_token":"YOUR_WEBHOOK_SECRET"}'`

## Важно

- Не публикуйте токен.
- В архиве этапа 1 не включён `.env` с секретами.
- В этом прототипе используется KV; хранение файлов и разбор документов ещё не портированы.
