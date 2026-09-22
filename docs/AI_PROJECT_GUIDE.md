# RoadRadar / OnMap — инструкция для AI-агентов

Пользовательское имя продукта: **OnMap**. Технические идентификаторы (пакет, bundle ID, Android application ID, модуль RN, ключи AsyncStorage identity) остаются **`RoadRadar` / `com.roadradar.app`**. Не переименовывать без явной задачи.

Этот файл описывает **подтверждённое поведение из кода**. Где данных нет — помечено как неизвестное.

---

## 1. Краткое описание

Мобильное приложение (React Native) и API (NestJS) для карты дорожных событий города **Балаково**: ДТП, перекрытия, работы, пробки, ДПС, опасности и др. Источники:

| Источник | Где живёт | Как попадает на карту |
| --- | --- | --- |
| `USER` | PostgreSQL + PostGIS | POST `/api/road-events` |
| `TELEGRAM` | PostgreSQL + PostGIS | GramJS (MTProto) → парсер → persistence |
| `TOMTOM` | Не в БД | Подмешивается в GET `/api/road-events` из Traffic API |

Первый город в реестре: `cityId = "balakovo"`. Других городов в рантайм-реестре нет.

Продуктовые ограничения: карта — главный экран; приблизительная геометрия должна выглядеть приблизительной; онбординг локальный и не требует аккаунта. См. `PRODUCT.md`, визуал — `DESIGN.md`.

---

## 2. Архитектура

```
iOS / Android (RN 0.86, New Architecture)
  AppProviders (QueryClient, gestures, SafeArea)
    AppLaunchGate → Launch / Onboarding / Map
      MapScreen
        RoadMap (MapLibre) + HTTP + Socket.IO

NestJS :4000
  HTTP prefix /api
  Socket.IO на том же порту без prefix /api
  Prisma 7 + pg adapter → PostGIS (docker :5434)
```

Слои фронтенда близки к Feature-Sliced Design:

| Слой | Путь | Назначение |
| --- | --- | --- |
| app | `src/app/` | `App`, провайдеры, навигация, launch/onboarding |
| screens | `src/screens/` | `MapScreen`, `LaunchScreen`, `OnboardingScreen` |
| widgets | `src/widgets/` | `RoadMap`, `EventDetailsSheet`, `ReportEventSheet` |
| features | `src/features/` | отчёт, фильтр, feedback, геолокация, контролы карты |
| entities | `src/entities/` | `road-event`, `weather` |
| shared | `src/shared/` | env, HTTP, socket, theme, cities, map helpers |

Backend модули (`backend/src/app.module.ts`):

- `DatabaseModule` — Prisma
- `HealthModule` — `GET /api/health`
- `IdentityModule` — анонимный HMAC-токен
- `RoadEventsModule` — CRUD-подобное API событий + gateway + DPS tracker
- `TelegramIngestionRuntimeModule` — опциональный live-ingest
- `TomTomModule` — traffic incidents
- `WeatherModule` — Yandex Weather informers

---

## 3. Структура папок (ключевое)

### Frontend

- `src/app/navigation/RootNavigator.tsx` — один стек, экран `Map`.
- `src/app/launch/AppLaunchGate.tsx` — splash ≥ `motion.launchMinimumVisibleMs`, затем onboarding или карта.
- `src/shared/config/env.ts` — URL API/socket, MapTiler vs OpenFreeMap.
- `src/shared/api/httpClient.ts` — fetch + Bearer + refresh при 401.
- `src/shared/device/installationIdentity.ts` — токен в AsyncStorage namespace `roadradarIdentity`.
- `src/shared/realtime/socketClient.ts` — один ленивый `socket.io-client`.
- `src/shared/config/cities/` — фронтовый реестр города (центр `[lng, lat]`).
- `src/entities/road-event/api/httpRoadEventRepository.ts` — единственный используемый репозиторий событий.
- `src/entities/road-event/api/mockRoadEventRepository.ts` — **не импортируется** (мёртвый код).
- `src/entities/road-event/model/useRoadEvents.ts` — TanStack Query viewport list.
- `src/entities/road-event/model/useRoadEventRealtime.ts` — подписка на комнату города.
- `src/widgets/RoadMap/RoadMap.tsx` — MapLibre Map/Camera/UserLocation/слои.
- `src/entities/road-event/ui/RoadEventSource/RoadEventSource.tsx` — GeoJSON линии + маркеры.

### Backend

- `backend/src/main.ts` — prefix `api`, ValidationPipe whitelist+forbidNonWhitelisted, CORS, listen `0.0.0.0`.
- `backend/src/road-events/road-events.service.ts` — list/create/feedback/lifecycle/rate-limit/dedup.
- `backend/src/road-events/realtime/road-events.gateway.ts` — Socket.IO комнаты `road-events:{cityId}`.
- `backend/src/cities/` — реестр, geo-dataset, Балаково.
- `backend/src/integrations/telegram/` — MTProto, parser, location-resolver, persistence, runtime.
- `backend/prisma/schema.prisma` + `backend/prisma/migrations/`.
- `backend/scripts/` — telegram auth/dry-run/apply, city-geo-import, tomtom probe.

---

## 4. Как запускать

Требования: **Node ≥ 22.11.0** (`package.json` `engines`). Docker для Postgres.

### База

```bash
cd backend
# docker compose поднимает postgis/postgis:17-3.5 на 127.0.0.1:5434
# пользователь/пароль/БД: roadradar / roadradar_dev / roadradar
docker compose up -d
cp .env.example .env   # задать IDENTITY_SIGNING_SECRET ≥ 32 символов
npm install
npx prisma generate
npm run prisma:migrate:deploy   # или prisma:migrate:dev
```

`DATABASE_URL` по умолчанию: `postgresql://roadradar:roadradar_dev@localhost:5434/roadradar?schema=public` (`backend/.env.example`).

Prisma 7: URL задаётся в `backend/prisma.config.ts`, клиент генерируется в `backend/src/generated/prisma` (gitignored). `PrismaService` использует `@prisma/adapter-pg`.

### Backend

```bash
cd backend
npm run start:dev     # watch
# API:    http://localhost:4000/api
# Socket: http://localhost:4000
```

Старт падает без `DATABASE_URL` и без `IDENTITY_SIGNING_SECRET` (`validateEnvironment` в `backend/src/app.module.ts`).

Telegram **выключен**, пока `TELEGRAM_INGESTION_ENABLED` не `true` и не заданы `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TELEGRAM_SOURCE_CHAT_ID`.

TomTom/Weather опциональны: без ключей инциденты/погода просто отсутствуют (пустой массив / `null`).

### Frontend

Корень репозитория:

```bash
cp .env.example .env   # react-native-config
npm install
npm start              # Metro
npm run ios            # или npm run android
```

iOS: `bundle install`, затем `bundle exec pod install` в `ios/`. В `ios/Podfile` после RN post_install вызывается `$MLRN.post_install(installer)` (MapLibre).

URL по умолчанию (`.env.example`):

- iOS Simulator: `http://localhost:4000/api` и `http://localhost:4000`
- Android Emulator: `http://10.0.2.2:4000/api` и `http://10.0.2.2:4000`
- Физическое устройство: задать `API_BASE_URL` / `SOCKET_URL` на LAN IP хоста.

`REALTIME_ENABLED=true` включает сокет только если `socketUrl` непустой (`src/shared/config/env.ts`).

---

## 5. Команды разработки

### Frontend (корень)

| Команда | Что делает |
| --- | --- |
| `npm start` | Metro |
| `npm run ios` / `npm run android` | Сборка и запуск |
| `npm test` | Jest (`@react-native/jest-preset`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

### Backend (`backend/`)

| Команда | Что делает |
| --- | --- |
| `npm run start:dev` | Nest watch |
| `npm run build` | `nest build` |
| `npm test` | Jest `*.spec.ts` из `backend/src` |
| `npm run test:e2e` | `backend/test/jest-e2e.json` |
| `npm run prisma:generate` | Prisma client |
| `npm run prisma:migrate:dev` / `deploy` | Миграции |
| `npm run telegram:*` | auth, list-chats, dry-run, apply, smoke, history, mining |
| `npm run city:geo-import` | импорт геословаря города |
| `npm run probe:tomtom-traffic` | ручной probe |

**Факт:** `backend/test/app.e2e-spec.ts` ожидает `GET /` → `Hello World!`. Реальное приложение слушает `/api/*` и не отдаёт этот ответ. E2E из шаблона Nest **не соответствует** текущему API.

CI в репозитории **нет** (нет `.github/`).

---

## 6. Типичный пользовательский сценарий

1. Запуск → `LaunchScreen` минимум `motion.launchMinimumVisibleMs`.
2. Если в AsyncStorage нет `onmap:onboarding` с `onboardingVersion === 1` (`src/app/launch/onboardingStorage.ts`) → `OnboardingScreen`. Онбординг **не** ходит в API.
3. `RootNavigator` → `MapScreen`.
4. Карта грузит style JSON (MapTiler Streets, если есть `MAPTILER_API_KEY`, иначе OpenFreeMap Liberty), брендирует через `createOnMapMapStyle`.
5. После load/region change `RoadMap` отдаёт viewport bounds `[west, south, east, north]`.
6. `useRoadEvents(cityId, bounds)` → `GET /api/road-events?...` с Bearer.
7. `useRoadEventRealtime(cityId)` подключается к Socket.IO и emit `road-events:subscribe`.
8. Параллельно `GET /api/road-events/dps-summary` и `GET /api/weather?cityId=`.
9. Long press / кнопка отчёта → `ReportEventSheet` → `POST /api/road-events`.
10. Тап по маркеру → `EventDetailsSheet` → confirm/reject → `POST /api/road-events/:id/feedback`.

Навигации кроме карты нет. Выбор города в store есть (`useSelectedCityStore`), но активен только `balakovo`.

---

## 7. Карта и геоданные

### Провайдеры стиля

`resolveMapStyleConfiguration` в `src/shared/config/env.ts`:

- primary: `https://api.maptiler.com/maps/streets-v4/style.json?key=...`
- fallback: `https://tiles.openfreemap.org/styles/liberty`

`RoadMap` при `onDidFailLoadingMap` переключает на fallback. Повтор — снова `initial`.

`useOnMapMapStyle` fetch'ит JSON (таймаут 7 с) и перекрашивает слои. При ошибке fetch остаётся URL провайдера.

### Координаты (критично)

Везде GeoJSON-порядок: **`[longitude, latitude]`**.

- Фронт `balakovoCity.center`: `[47.8007, 52.0278]`.
- Create DTO `coordinate`: `[lng, lat]` (`CreateRoadEventDto`).
- Backend `toResponse`: `coordinate: [longitude, latitude]`.
- Backend city config: `{ latitude, longitude }` — **другая форма**, не путать при копировании.

`coverageBounds` Балаково: west 47.5, south 51.82, east 48.2, north 52.25. Это **технический bbox**, не админграница (комментарий в `src/shared/config/cities/balakovo.ts` и `backend/src/cities/balakovo/balakovo.config.ts`).

Проверка «точка в городе» на бэкенде: **только bbox** (`isCoordinateInsideCityCoverage` в `city.registry.ts`), не полигон `coverageBoundary`.

`displayBoundary` на фронте — **только визуальный контур**. Комментарий в `city.types.ts`: не использовать для валидации покрытия.

Камера: `maxBounds` = coverage bbox, `minZoom` 10.8, `maxZoom` 19, `defaultZoom` 13.

### Маркеры и геометрия

- USER: всегда Point.
- TELEGRAM: Point или LineString/MultiLineString (улица); precision `EXACT | INTERSECTION | LANDMARK | STREET | AREA | SETTLEMENT`.
- TOMTOM: Point или LineString; id вида `tomtom:...`.

Рендер: `RoadEventSource` — линии TomTom/Telegram слоями MapLibre, точечные события — React `Marker` + `EventMarker` (не native clustering). GeoJSON-хелперы: `src/entities/road-event/lib/roadEventGeoJson.ts`.

Геолокация пользователя: MapLibre `useCurrentPosition` + permission; координата тоже `[lng, lat]` (`useUserLocation.ts`). iOS: `NSLocationWhenInUseUsageDescription`. Android: `ACCESS_FINE/COARSE_LOCATION`.

---

## 8. Жизненный цикл событий

### Загрузка (GET)

`RoadEventsController.list` → `RoadEventsService.list`:

1. `validateCityId` — неизвестный id → 400 `Unsupported cityId`.
2. `validateBounds` — west < east, south < north.
3. `runLifecycleTick(cityId)` — обновить статусы до чтения.
4. SQL: `city_id`, `status <> RESOLVED`, `expires_at > NOW()`, `location && ST_MakeEnvelope(...)`, LIMIT 500.
5. JOIN feedback текущей identity → `viewerRelation`: `CREATOR | CONFIRM | REJECT | null`.
6. Добавить TomTom (ошибка/нет ключа → `[]`, не валит весь list).

Фронт **требует bounds**; без них query disabled (`useRoadEvents`).

### Создание (POST)

`create`:

1. Координата внутри coverage bbox.
2. Rate limit: **3 создания / 10 минут / identity** (in-memory Map в процессе Node).
3. Дедуп: тот же `cityId`+`type`, статус ACTIVE/UNCONFIRMED (для ДПС ещё STALE), не истёк, `ST_DWithin` 150 м, окно 30 мин (для ДПС окно = `maxLifetimeMs` 75 мин). Источник: USER, либо любой ROAD_PATROL.
4. Если похожее есть и тип **не** ДПС → **409** `Similar active event already exists nearby`.
5. Если ДПС → вместо create вызывается `feedback(CONFIRM)` существующего.
6. Иначе INSERT: `status=UNCONFIRMED`, `confirmation_count=1`, `created_by_installation_id=identity`, TTL из `ROAD_EVENT_TTL_MINUTES`, Point 4326.
7. `broadcastCreated`.

USER create **не** выставляет `source` явно — в схеме default `USER`.

### Feedback (POST `:id/feedback`)

Только события `source=USER` **или** `type=ROAD_PATROL`. Иначе 404.

- Автор не голосует за своё (409 `Creator cannot vote for own event`).
- Один голос на пару event+installation (unique, 409 `Feedback already submitted`).
- RESOLVED или истёк → 410.
- Rate limit: **20 / 60 с / identity**.
- CONFIRM продлевает `expiresAt` (`nextConfirmedExpiry`); для ДПС rolling TTL 20 мин с потолком 75 мин (`ROAD_PATROL_LIFECYCLE`).
- RESOLVED → `broadcastResolved`, иначе `broadcastUpdated`.

### Удаление

Отдельного DELETE **нет**. Событие исчезает с карты, когда `status=RESOLVED` или `expires_at <= now`. Lifecycle-тик раз в 60 с (`ROAD_EVENT_LIFECYCLE_INTERVAL_MS`) и дополнительно на каждый list.

USER: STALE по давности last confirm; RESOLVE по TTL/отклонениям. ДПС: stale после 12 мин без confirm, reject-пороги 3/10. Telegram TTL задан отдельно (`TELEGRAM_EVENT_TTL_MS`).

### Telegram persistence

`TelegramIngestionPersistenceService.apply`: решения `CREATE | UPDATE | RESOLVE`. Идемпотентность по `(source, sourceChatId, externalMessageId)`. Координаты вне bbox → NOOP `INVALID_COORDINATES`. Realtime через `TelegramRoadEventRealtimeBridge`.

Нелокализованный ДПС учитывается in-memory в `DpsActivityTracker` (не в БД) и попадает в `unlocated` summary.

---

## 9. Realtime и fallback

Gateway: `@WebSocketGateway({ cors: { origin: '*' } })` — **без** Bearer.

События:

| Направление | Имя | Назначение |
| --- | --- | --- |
| client→server | `road-events:subscribe` | join `road-events:{cityId}` |
| client→server | `road-events:unsubscribe` | leave |
| server→room | `road-event:created` | полный payload события |
| server→room | `road-event:updated` | полный payload |
| server→room | `road-event:resolved` | `{ id, cityId, resolvedAt }` |

Фронт (`useRoadEventRealtime`):

- если `env.realtimeEnabled === false` → статус `disabled`, HTTP продолжает работать;
- created/updated: `parseRoadEventPayload`, **игнор TOMTOM**, upsert в Query cache viewport-ключей (`roadEventRealtimeCache.ts`);
- resolved: remove из cache;
- reconnect: `invalidateQueries` по городу + dps-summary;
- cleanup: unsubscribe + **`socket.disconnect()`** (общий сокет).

HTTP fallback: `useRoadEvents` `refetchInterval: 30_000`, `staleTime: 15_000`, `retry: 2`. Это основной путь и при живом сокете, и без него. TomTom на сокет **не** приходит — только через GET.

---

## 10. Анонимная авторизация

Не JWT от IdP. HMAC-токен:

```
v1.<base64url(JSON { type:"anonymous", sub:<uuid-v4> })>.<hmac-sha256 base64url>
```

- Выдача: `POST /api/identity/anonymous` **без** auth (`IdentityController`).
- Проверка: `IdentityService.verifyAnonymousIdentity` (timing-safe, канонический base64url).
- Guard: `AnonymousIdentityGuard` — заголовок `Authorization: Bearer <token>`.
- Identity id = `sub`; пишется в `created_by_installation_id` и `road_event_feedback.installation_id`.

Клиент (`httpClient.ts`):

1. `getAnonymousIdentityToken` — прочитать или выпустить и сохранить.
2. На 401 — `refreshAnonymousIdentityToken` (удалить ключ, выпустить новый).
3. Повторный 401 — `clearAnonymousIdentityToken`, проброс ошибки.

Хранилище: AsyncStorage `'roadradarIdentity'` / ключ `anonymousIdentityToken`.

**Кто требует Bearer:** все методы `RoadEventsController`.
**Кто не требует:** `POST /identity/anonymous`, `GET /health`, `GET /weather`. Клиент всё равно шлёт Bearer на weather, потому что использует тот же `httpRequest`.

Socket identity **не** привязан к HTTP-токену.

---

## 11. Валидация, дедуп, лимиты, ошибки

| Правило | Где | Значение |
| --- | --- | --- |
| cityId | `getCityConfig` | только `balakovo` |
| координата create | bbox coverage | иначе 400 `Coordinate is outside city bounds` |
| bounds list | west&lt;east, south&lt;north | 400 |
| create rate | in-memory | 3 / 10 мин |
| feedback rate | in-memory | 20 / 60 с |
| spatial dedup | PostGIS | 150 м, 30 мин (ДПС 75 мин) |
| whitelist DTO | ValidationPipe | лишние поля → 400 |
| list cap | SQL | 500 строк + TomTom отдельно |

Клиентские тексты: `getCreateRoadEventErrorState` / `getFeedbackErrorState` — 409 duplicate, 429 rate limit, иначе generic. 400 «вне города», 401, 410 **не** разобраны отдельно (generic).

**Хрупкость:** rate limit живёт в памяти процесса. Несколько инстансов / рестарт сбрасывают счётчики. Не подходит как защита продакшена при горизонтальном масштабе.

---

## 12. Формат API

Base: `http://host:4000/api`.

| Метод | Путь | Auth | Тело / query | Ответ |
| --- | --- | --- | --- | --- |
| POST | `/identity/anonymous` | нет | — | `{ token }` |
| GET | `/health` | нет | — | `{ status, service, database, postgis, timestamp }` |
| GET | `/weather?cityId=` | нет | cityId | CurrentWeather или `null` |
| GET | `/road-events` | Bearer | cityId, west, south, east, north | массив USER/TELEGRAM/TOMTOM |
| GET | `/road-events/dps-summary` | Bearer | cityId | `{ cityId, onMap, unlocated, total }` |
| POST | `/road-events` | Bearer | `{ cityId, type, title?, description?, coordinate:[lng,lat] }` | событие + `viewerRelation: CREATOR` |
| POST | `/road-events/:id/feedback` | Bearer | `{ action: CONFIRM \| REJECT }` | обновлённое событие |

Типы USER/TELEGRAM: `ACCIDENT | ROAD_CLOSURE | ROADWORKS | TRAFFIC | ROAD_HAZARD | TRAFFIC_LIGHT | ROAD_SERVICE | ROAD_PATROL | OTHER`.

TomTom read-типы другие: `TRAFFIC_JAM | ACCIDENT | ROADWORKS | ROAD_CLOSURE | HAZARD | OTHER` (`roadEvent.ts`). Парсер клиента отбрасывает неизвестный `source`, но **бросает**, если source знакомый, а поля битые.

Не выдумывать endpoints. Нет DELETE, PATCH, login, admin, cities API.

---

## 13. Prisma и БД

- Провайдер: PostgreSQL + PostGIS (миграция `enable_postgis`).
- Геометрия: `location geometry(Geometry, 4326)` как `Unsupported` в schema; все пространственные операции — **`$queryRaw` / `$executeRaw`**, не Prisma CRUD.
- Модели: `RoadEvent`, `RoadEventFeedback`, `TelegramRoadEventMessage`, `TelegramSourceCursor`.
- Новые поля → новая миграция в `backend/prisma/migrations/`, затем `prisma generate`.
- Не менять SRID 4326 и инварианты spatial (есть миграция `add_road_event_spatial_invariants`).
- После клона без `prisma generate` backend не соберётся (импорт `../generated/prisma/client`).

Docker порт хоста **5434**, не 5432, чтобы не конфликтовать с локальным Postgres.

---

## 14. Соглашения по коду

- Не ломать bundle id / applicationId / RN name `RoadRadar` / display name OnMap.
- Координаты API и карты: `[lng, lat]`.
- `cityId` строкой, не угадывать другие города.
- Доменные константы TTL/типов: backend `road-events.constants.ts` — источник истины для API. На фронте есть **копия** TTL в `roadEventFreshness.ts` (**не совпадает** для `ROAD_PATROL`: фронт 45 мин, бэкенд 20 мин).
- Слои FSD: фича не должна тащить SQL; API-клиент в `entities/*/api`.
- Zustand: локальный UI (`useMapUiStore`, фильтр, draft отчёта, выбранный город). Серверное состояние — TanStack Query.
- Не форматировать чужие файлы «заодно». Backend часто с необычными переносами строк — сохранять стиль файла.
- `class-validator` DTO + `forbidNonWhitelisted`.
- Тесты: фронт `*.test.ts(x)` рядом с кодом; бэкенд `*.spec.ts`.

Продукт/дизайн: не обещать «точную безопасность дороги»; approximate Telegram не рисовать как точную точку (линии/halo в `RoadEventSource.styles.ts`).

---

## 15. Частые ошибки и диагностика

| Симптом | Что проверить |
| --- | --- |
| `IDENTITY_SIGNING_SECRET is required` | `backend/.env`, длина ≥ 32 |
| Backend не стартует / Prisma | `docker compose ps`, порт 5434, `prisma generate`, PostGIS в health |
| `API_BASE_URL is not configured` | `.env` корня, rebuild native (`react-native-config`) |
| События не грузятся на устройстве | localhost vs LAN IP; iOS ATS `NSAllowsLocalNetworking`; Android cleartext |
| 401 петля | секрет identity сменился → клиент refresh'ит токен; если секрет крутится часто — ожидаемо |
| 409 при создании | дедуп 150 м / 30 мин |
| 429 | in-memory rate limit; рестарт API сбрасывает |
| Карта серая / error overlay | ключ MapTiler, сеть до OpenFreeMap, fallback в `RoadMap` |
| iOS MapLibre / pods | `pod install`, `$MLRN.post_install`, New Arch включена (`RCTNewArchEnabled`) |
| Нет Telegram-событий | `TELEGRAM_INGESTION_ENABLED`, session, chat id; runtime status в логах |
| Нет TomTom | `TOMTOM_API_KEY`; в list ошибка глотается |
| Нет погоды | `YANDEX_WEATHER_API_KEY`; API возвращает `null` |
| Realtime молчит, HTTP ок | `REALTIME_ENABLED`, `SOCKET_URL` без `/api`, CORS/сеть |
| Jest RN падает на native | моки MapLibre; смотреть соседние `*.test.tsx` |

Логи API: `[RoadRadar] API/Socket.IO` в `main.ts`. Telegram: `TelegramIngestionRuntimeService`, опционально NDJSON `TELEGRAM_REVIEW_LOGS_ENABLED`.

---

## 16. Что нельзя ломать

1. Порядок координат `[lng, lat]` в API, GeoJSON, MapLibre, create payload.
2. Анонимный формат токена `v1.payload.sig` и HMAC на `IDENTITY_SIGNING_SECRET`.
3. Имена Socket.IO событий и комната `road-events:{cityId}`.
4. Query keys: `['road-events','viewport', cityId, west, south, east, north]` — realtime cache парсит **ровно 7** элементов.
5. `cityId: "balakovo"` и bbox покрытия — иначе create/list/telegram отфильтруют данные.
6. Bundle ID `com.roadradar.app`, AsyncStorage `roadradarIdentity`, onboarding key `onmap:onboarding`.
7. PostGIS column `location` и raw SQL в `RoadEventsService` / telegram persistence.
8. Идемпотентность telegram messages unique `(source, sourceChatId, externalMessageId)`.
9. Честная точность: STREET/AREA не превращать в «точный пин» без изменения продукта.
10. Не требовать аккаунт на онбординге.

---

## 17. Алгоритм безопасной работы над задачей

1. Прочитать этот гайд и `.cursor/rules/roadradar-project.mdc`.
2. Создать **свою** рабочую ветку; не коммитить в `main`/`master`/`develop`.
3. Найти связанные файлы по таблице §19. Прочитать их **до** правок.
4. Сформулировать план (для нетривиальных задач) и границы: какие файлы не трогать.
5. Не выдумывать env, endpoint, тип события, город.
6. Сохранить контракты: DTO, parseRoadEventPayload, константы realtime.
7. Если меняется API — синхронно клиентский парсер и тесты `httpRoadEventRepository.test.ts` / `road-events.service.spec.ts`.
8. Если карта/гео — проверить `[lng,lat]`, bounds, coverage, GeoJSON.
9. Прогнать релевантные тесты + `npm run typecheck` (корень) и/или `npm test` в backend.
10. Не рефакторить соседние модули. Документацию не плодить без запроса.
11. В конце: убедиться, что изменения только в рабочей ветке.

---

## 18. Техдолг и улучшения (из кода, не фантазия)

**Подтверждено**

- `backend/test/app.e2e-spec.ts` — шаблон Nest, не тестирует API.
- `mockRoadEventRepository.ts` не используется.
- TTL `ROAD_PATROL` расходится: фронт 45 мин vs backend 20 мин (`roadEventFreshness.ts` vs `road-events.constants.ts`).
- Rate limit и `DpsActivityTracker.unlocated` — in-memory, теряются при рестарте/нескольких процессах.
- Socket.IO без аутентификации: любой клиент может подписаться на город.
- `GET /weather` без guard при том, что клиент шлёт Bearer.
- Корневой `README.md` — шаблон RN, не описывает backend/docker.
- `backend/README.md` — шаблон Nest.
- Нет CI.
- Prisma gitignore: `/backend/src/generated/prisma/` в корневом `.gitignore` корректен; в `backend/.gitignore` тот же путь выглядит ошибочно относительно каталога backend (проверить при чистке ignore).
- Coverage polygon в конфиге города не используется для create-валидации (только bbox).
- Список GET ограничен 500 — при плотном viewport возможны пропуски без пагинации.
- Общий socket `disconnect()` в cleanup realtime-хука: риск при будущих нескольких подписчиках.

**Предположения** (не доказано кодом)

- В проде, вероятно, один инстанс API, поэтому in-memory лимиты пока «работают».
- Telegram session хранится вне git (`.env`) — формат GramJS StringSession, судя по библиотеке `telegram`.

**Нужно проверить позже**

- Реальный прод-хостинг, HTTPS, секреты.
- Поведение MapLibre New Architecture на конкретных версиях Xcode/Android SDK.
- Актуальность Yandex Weather `v2/informers` и заголовка `X-Yandex-Weather-Key`.
- Содержимое `backend/src/cities/data/balakovo/imported-locations.json` vs словарь парсера.
- Нужен ли auth на weather/health в проде.

---

## 19. Задача → файлы

| Задача | Смотреть / менять |
| --- | --- |
| Экран карты, оверлеи, статус | `MapScreen.tsx`, `MapStatusCard.tsx`, `MapHeader.tsx`, `RoadMap.tsx` |
| Стиль карты, fallback тайлов | `env.ts`, `useOnMapMapStyle.ts`, `onMapMapStyle.ts`, `RoadMap.tsx` |
| Маркеры, линии, precision | `RoadEventSource.tsx`, `EventMarker.tsx`, `roadEventGeoJson.ts`, `roadEvent.ts` |
| Список событий / кэш / ключи query | `useRoadEvents.ts`, `roadEventRealtimeCache.ts`, `httpRoadEventRepository.ts` |
| Realtime | `useRoadEventRealtime.ts`, `socketClient.ts`, `roadEventRealtime.ts`, `road-events.gateway.ts` |
| Создание события | `useCreateRoadEvent.ts`, `useReportEventStore.ts`, `ReportEventSheet.tsx`, `create-road-event.dto.ts`, `RoadEventsService.create` |
| Confirm/reject | `useRoadEventFeedback.ts`, `EventDetailsSheet.tsx`, `RoadEventsService.feedback` |
| Фильтр типов | `useRoadEventFilterStore.ts`, `EventFilterBar.tsx` |
| Город, bbox, граница | `src/shared/config/cities/*`, `backend/src/cities/*` |
| Анонимный токен | `httpClient.ts`, `installationIdentity.ts`, `identity.service.ts`, `anonymous-identity.guard.ts` |
| Env клиента | `.env.example`, `env.ts`, `react-native-config.d.ts` |
| Env сервера | `backend/.env.example`, `app.module.ts` `validateEnvironment` |
| Схема БД / миграции | `schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, `prisma.service.ts` |
| Lifecycle / TTL / ДПС | `road-events.constants.ts`, `RoadEventsService.refreshStatuses`, `dps-activity-tracker.service.ts` |
| Telegram ingest | `telegram-ingestion-runtime.service.ts`, `telegram-mtproto.client.ts`, `telegram-message.parser.ts`, `telegram-dry-run-ingestion.pipeline.ts`, `telegram-ingestion-persistence.service.ts`, `telegram-location-resolver*` |
| TomTom | `tomtom-traffic.provider.ts`, `tomtom.mapper.ts`, `listTomTomIncidents` |
| Погода | `weather.controller.ts`, `weather.service.ts`, `weatherRepository.ts`, `useCurrentWeather.ts` |
| Онбординг / бренд | `AppLaunchGate.tsx`, `OnboardingScreen.tsx`, `LaunchScreen.tsx`, `PRODUCT.md`, `DESIGN.md` |
| iOS native / MapLibre | `ios/Podfile`, `ios/RoadRadar/Info.plist`, `ios/.xcode.env` |
| Android permissions | `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle` |
| Тесты фронта событий | `httpRoadEventRepository.test.ts`, `useRoadEventRealtime.test.tsx`, `roadEventRealtimeCache.test.ts` |
| Тесты бэкенда событий | `road-events.service.spec.ts`, `road-events.dps-lifecycle.spec.ts` |

---

## Легенда достоверности

- **Факт** — прочитано в указанных файлах.
- **Предположение** — правдоподобно, кодом не закреплено.
- **Неизвестно** — нет в репозитории (деплой, прод-секреты, реальные chat id, пайплайн CI вне git).
