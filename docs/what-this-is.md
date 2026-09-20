# Что это такое

Это **не приложение**. Это открытый скелет, из которого клонируют новый продукт.

Репа: [7erhii/React-Native-NextJs-Tamplate](https://github.com/7erhii/React-Native-NextJs-Tamplate)  
Лицензия: MIT.

Клонировал → `npm install` → `npm start` → телефон. Сайта, аккаунта и базы нет, пока сам не включишь.

---

## Из чего состоит

Три независимые штуки. Общие только конфиг и токены, не экраны.

```text
телефон          сайт             бэкенд (по желанию)
apps/mobile      apps/web         infra/supabase
Expo / RN        Next.js          Supabase = Postgres + Auth + API
```

| Папка | Что это | Когда нужно |
|---|---|---|
| `apps/mobile` | Приложение в телефоне (Expo, SDK 57) | Всегда. Это ядро скелета. |
| `apps/web` | Отдельный сайт продукта (Next.js), не Expo в браузере | Когда нужен лендинг, Install или кабинет |
| `packages/config` | Один switch на оба клиента | Всегда. Флаги «есть сайт / есть рега / куда писать сейвы» |
| `packages/tokens` | Цвета, отступы, иконки | Всегда. Экраны не выдумывают hex |
| `infra/supabase` | Self-hosted Supabase: Postgres + GoTrue + PostgREST + Studio | Когда нужны облачные сейвы или аккаунт |

Телефон и сайт **не ходят друг в друга**. Если оба включены в облако — оба ходят в **один Supabase**. UI не шарится (это не Solito).

---

## Что включено прямо сейчас (дефолт)

Кейс **A**: только телефон, без аккаунта, без сайта, без базы.

В `packages/config/src/app.config.ts`:

- `web.enabled: false` — сайт не часть поставки (страницы Next всё равно можно открыть локально)
- `web.auth` / `mobile.auth`: false — нет Sign in
- `identity.mode: 'device'` — игрок = это устройство
- `persistence.mode: 'local'` — сейвы на телефоне, не в Supabase

Игра `tap-rush` в хабе — **пример плагина**, не продукт.

Версия продукта: `packages/config/src/release.json` (`0.1.0`, build `1`). Оттуда футер сайта, Settings в аппе, iOS buildNumber / Android versionCode.

---

## Чего здесь нет (и это нормально)

- Google-вход на сайте ещё не подключён. Маршруты `/sign-in` и `/sign-up` есть, провайдера нет.
- Своего Nest/Node API нет. Бэкенд — Supabase, когда включён.
- Телефон в Docker не упакован. Симулятор / Expo Go живут на хосте: `npm start` / `npm run ios`.
- Данные с симулятора **не** пишутся в Supabase, пока persistence `local` и стек выключен.

---

## Как запускать

```bash
npm install

npm start          # телефон (Metro). В симулятор: npm run ios
npm run web        # сайт на http://localhost:3000 без Docker

npm run stack:up   # сайт + Supabase в Docker
npm run stack:down
```

После `stack:up`:

| Что | Адрес |
|---|---|
| Сайт | http://localhost:3000 |
| API (Kong) | http://localhost:54321 |
| Studio | http://localhost:54323 |
| Postgres | localhost:5432 |

Секреты: корневой `.env` (anon-ключ для клиентов) и `infra/supabase/.env` (пароли, service-role). В git их нет, только `*.example`.

Чтобы сейвы и аккаунт пошли в облако — мало поднять Docker. Ещё flip в `app.config.ts`: `persistence.mode` → `hybrid` или `cloud`, `identity.mode` → `anonymous` или `google`.

---

## Четыре продукта из одного скелета

| | Сайт | Рега на сайте | Рега в аппе | База |
|---|---|---|---|---|
| **A** одностраничная мобилка | нет | нет | нет | нет |
| **B** мобилка с аккаунтом | нет | нет | да | да |
| **C** рекламный сайт + Install | да | нет | как нужно | обычно нет |
| **D** «банк»: кабинет + апп | да | да | да | да |

Дефолт клона — **A**. Остальное — флаги в одном файле, не переписка фундамента.

---

## Куда смотреть дальше

| Документ | Зачем |
|---|---|
| [what-we-discussed.md](./what-we-discussed.md) | Договорённости: что нельзя класть в фундамент |
| [adding-a-game.md](./adding-a-game.md) | Добавить экран в телефон как плагин |
| [../README.md](../README.md) | Запуск, switch, security notes |
