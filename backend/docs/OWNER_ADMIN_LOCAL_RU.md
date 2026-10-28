# Локальная owner-панель OnMap

Локальная панель и защищённый owner API. Доступ включается оператором после backup и применения admin-миграции; frontend остаётся loopback. Этот документ описывает архитектуру и порядок подключения, а не текущий журнал состояния VPS.

## Архитектура и авторизация

- Отдельный frontend `onmap-admin/`, статический Node-сервер только на `127.0.0.1:4173`, с проверкой Host и CSP. Установка: `npm ci --prefix onmap-admin`; запуск: `npm --prefix onmap-admin start`.
- Запросы браузера идут непосредственно к введённому HTTPS API. Публичный URL можно задать `ONMAP_ADMIN_API_URL`. Секреты не читаются сборщиком и не включаются в конфигурацию frontend. До ручного входа запросов к backend нет.
- Owner API отделён от публичного API и anonymous identity. `OwnerAdminGuard` проверяет capability и актуальный `TELEGRAM_PARTNER_OWNER_IDS`, затем точный origin. Токен нельзя использовать как mobile identity.
- Резервный короткий 256-битный capability выдаётся CLI `npm run owner-admin:token` в интерактивном терминале backend. CLI использует только server-side окружение, требует подтверждение и allowlist, отображает токен через `/dev/tty`, не stdout/stderr. Постоянного admin-пароля нет. Telegram poller не меняется и не добавляется.
- Хранится только SHA-256 хеш токена. Срок 20 минут; новая выдача отзывает предыдущую сессию владельца. Browser rotation заменяет hash с проверкой старого, не продлевая TTL. Logout отзывает сессию. Браузер хранит токен только в private memory поля клиента, не storage/cookie/URL. Потеря ответа ротации требует нового CLI-токена.
- Rate limit в памяти единственного backend-процесса: 120 запросов владельца/минуту; общий предел 240/минуту. IP не сохраняются. После рестарта лимитер начинается заново; это не распределённый rate limiter.
- Все owner-ответы `Cache-Control: no-store`. Другой Origin не получает доступ даже при наличии в публичном CORS allowlist. Клиенты без Origin всё равно обязаны предъявить owner-token. Публичный REST и Socket.IO сохраняют прежние CORS-правила.

Требуемые server-side настройки: `OWNER_ADMIN_ENABLED` (по умолчанию false), `OWNER_ADMIN_ORIGIN` (точный `http://127.0.0.1:4173`), существующие `TELEGRAM_PARTNER_OWNER_IDS` и `DATABASE_URL`. Реальные значения не добавляются в repo. Отдельный backend secret не нужен.

## Домен

`PartnerManagementService` используется финальным подтверждением Telegram-мастера и owner API: проверки полей/города/периода/цветов/контактов, сохранение, стабильные contact IDs, статусы точек и баннеров. Совместная транзакционная advisory-блокировка `724513,1` сериализует изменения с текущим ботом. Public RoadEvent, его API, lifecycle, feedback и ingestion не меняются.

API создаёт только DRAFT. Публикация — отдельное подтверждение. Редактирование не включает точку, окончания и возобновления проверяются. При изменении типа или назначения контакта создаётся новый ID; перестановка и новая подпись сохраняют прежний. Удалённые данные не извлекаются из истории статистики. Баннер использует единственную существующую запись города; сохранение выключает его, а включение требует отдельного действия и действующей точки. Цвета наследуются от точки, нового поля оформления нет. Завершение баннера не продлевает точку.

Изображения загружаются только для уже сохранённой точки через защищённый multipart endpoint: memory upload до 4 МБ, существующий raster sanitizer, нормализованный PNG 256×256 в `partner_image_assets`. Никаких путей файлов или внешних download URL не принимается. Старое изображение не удаляется при ошибке декодирования; замена атомарна. Публичная выдача изображения для активной точки остаётся прежней. Отдельный файловый volume не нужен, изображения входят в DB backup.

Каждая мутация требует UUID `Idempotency-Key`, сохраняет только хеш канонического запроса и минимальный результат `{id}`. Ключ scoped владельцем; повтор возвращает результат без нового действия, другое содержимое с тем же ключом — 409. Ledger и аудит не очищаются автоматически в этом MVP; нужно отдельно определить срок их операторского хранения. Audit содержит владельца, действие, entity ID и время, без токена, payload, IP, номера или текста контакта. Редактирование защищено `expectedUpdatedAt`, чтобы устаревшая форма не перезаписала более новые данные.

## Endpoint-ы

Все пути начинаются с `/api/owner-admin`, доступны только owner guard, финансовых полей в выдаче нет:

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/session` | Срок и ограниченные права сессии, без токена/Telegram ID |
| POST | `/session/rotate` | Ротация текущей capability; новое значение только в ответе владельцу |
| DELETE | `/session` | Отзыв текущей сессии |
| GET | `/metadata` | Города, IANA-пояса, границы для выбора точки, правила метрик |
| GET | `/overview` | Глобальный счётчик дорог, учёт identities и рекламные агрегаты |
| GET | `/statistics` | Рекламные агрегаты и страница отдельных контактов |
| GET | `/points` | Поиск/город/статус, пагинация |
| GET | `/points/:id` | Данные редактируемой точки и контакты |
| POST | `/points` | Новый черновик |
| PUT | `/points/:id` | Сохранение с `expectedUpdatedAt` |
| POST | `/points/:id/actions/:action` | `publish`, `pause`, `resume`, `end` |
| GET | `/points/:id/statistics` | Агрегаты одной точки и отдельные/удалённые контакты |
| GET | `/points/:id/image` | Owner-превью изображения, включая черновик |
| POST | `/points/:id/image` | Multipart поле `image`, замена после проверки |
| DELETE | `/points/:id/image` | Очистка изображения |
| GET | `/banners` | Пагинированный список по городу |
| PUT | `/banners/:cityId` | Выключенный черновик с `expectedUpdatedAt` для существующего |
| POST | `/banners/:cityId/actions/:action` | `enable`, `pause`, `end` |

List: page >=1, pageSize 1–50. Статистика: `period=7|30|ALL`, необязательный `cityId`, page/pageSize относятся к контактам. Поиск ограничен 160 символами. Тела запросов проходят ValidationPipe с whitelist/forbidNonWhitelisted. Статусы и произвольные финансовые/owner поля в тело сохранения не принимаются. API не позволяет запускать push, менять его политику, источник Telegram или управлять сервером.

## Статистика и нагрузка

Переиспользуются `partner_stat_daily`, существующая дедупликация и `anonymous_identity_count`; новые пользовательские данные не собираются. 7/30 дней включают текущий день по UTC; будущие day-buckets исключаются. Сроки размещений отображаются в IANA-поясе города. Данные identities возвращаются вместе с startedAt и названием «анонимные идентификаторы с даты», без оценки предыдущей аудитории. Уникальных посетителей/людей текущие daily-агрегаты не дают; поле возвращается null.

Дороги считаются `GROUP BY source` без статусов, результат кешируется на 60 секунд. Daily-таблица уже является rollup: суммы и группы считаются SQL, таблица дорожных событий не загружается в память. Контакты агрегируются по `(partner_point_id, detail_id)` с LEFT JOIN актуального контакта; удалённые получают нейтральный номер, без старой подписи/назначения. LIMIT/OFFSET и отдельный групповой count сохраняют total даже для пустой страницы.

Проверенные индексы существующей схемы: `road_events_source_match_idx`, `partner_points_visibility_idx`, `partner_point_contacts_order_idx`, `partner_stat_daily_point_day_idx`, `partner_stat_daily_day_action_idx`. Новый ledger имеет составной PK owner/requestKey; audit и ledger — индексы времени. Дополнительный индекс текстового поиска не добавляется без измерения объёма партнёров. `%search%` требует просмотра подходящих строк; выдача ограничена. Production-объёмы/планы не запрашивались, поскольку доступ к VPS запрещён этим заданием. Локальная SQL-проверка выполняется только на disposable PostGIS; её маленькие данные не являются нагрузочным доказательством для production.

## Миграция и безопасный будущий выкат

Новая миграция: `20261028120000_owner_admin`, три таблицы `owner_admin_sessions`, `owner_admin_mutations`, `owner_admin_audit`. Существующие события и размещения не изменяются миграцией. Проверяется только disposable PostgreSQL/PostGIS. Runtime flag по умолчанию false, поэтому новые endpoint-ы не начинают работать автоматически после обычной сборки.

Будущий выкат — отдельное решение: backup, применение миграции, backend, проверка HTTPS и auth/CORS, затем ручное включение owner flag и получение токена. Локальная панель остаётся loopback. Нельзя публиковать её как публичный сайт. Тестовые миграции/fixtures не запускать против рабочей dev или production БД. Мобильная сборка для панели не требуется.

## Результаты локальных проверок — 28 октября 2026

- Backend: 71 suite / 1076 unit-тестов прошли; `npx tsc --noEmit`, `npm run build` и ESLint затронутых TS-файлов прошли. Скрипта `typecheck` в backend нет, использован прямой вызов tsc.
- Disposable PostgreSQL 17 + PostGIS 3.5.2: применены все 21 миграция, прошли 12 сквозных сценариев. Проверены owner auth/Origin, валидация, последовательные и конкурентные повторы, черновик/публикация/пауза/возобновление/завершение, публичная видимость, устаревшая форма, contact IDs/удалённая история, атомарная загрузка изображения, независимый баннер, агрегаты/пустые страницы/границы UTC. Созданный тестовый контейнер и его временные данные удалены после проверки; рабочая БД не использовалась.
- На маленьких disposable-данных EXPLAIN ANALYZE показал использование `partner_stat_daily_day_action_idx` для суточной статистики и `partner_points_viewport_idx` для фильтра города. Общий счётчик дорог агрегирует таблицу и кешируется на минуту. Это не нагрузочный тест production.
- Admin: 8 тестов, JS typecheck, ESLint и production build прошли. Проверены HTTPS URL, память токена, отказ 401, повторный ключ после сетевого сбоя, IANA-время, отсутствие storage/записи просмотров, loopback/Host/CSP.
- Chromium/Playwright: вход, обзор, список, редактор точки с промокодом/условиями/контактом и редактор баннера с предпросмотром проверены на синтетических HTTPS API-ответах. Скриншоты находятся в `output/playwright/admin-overview.png`, `admin-point-editor.png`, `admin-banner-editor.png` и игнорируются Git. Карта использовала перехваченный пустой стиль: реальная загрузка тайлов и подключение к production API здесь не проверялись. CRUD и изображения проверены реальными endpoint-ами на disposable БД отдельно от браузера. Тестовые браузер и локальный сервер после проверки остановлены.
- Поиск credential-паттернов в 44 изменённых/новых файлах не обнаружил ключей или токенов. Это дополнительная проверка, а не гарантия обнаружения любого секрета. Реальные env не читались и не менялись. `git diff --check` прошёл.
- Реальные Telegram и push не вызывались. VPS не использовался. Commit, push и публикация не выполнялись.

Перед будущим выкатом нужны backup, применение новой миграции, сборка backend, отдельное включение `OWNER_ADMIN_ENABLED` и проверка HTTPS/auth/CORS. Срок хранения административного аудита/ledger следует согласовать отдельно. Визуальную полировку таблиц, подтверждений и предпросмотра можно делать следующим этапом.

## Полный список файлов этапа

Исходное дерево было чистым. Все перечисленные изменения относятся к этой задаче. `dist`, node_modules, скриншоты и временные данные браузера игнорируются; реальные env не менялись.

- `.gitignore`
- `backend/.env.example`
- `backend/deploy/vps/backend.env.example`
- `backend/docs/OWNER_ADMIN_LOCAL_RU.md`
- `backend/package.json`
- `backend/prisma/migrations/20261028120000_owner_admin/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/scripts/owner-admin-token.ts`
- `backend/src/app.module.ts`
- `backend/src/cors/http-cors.ts`
- `backend/src/main.ts`
- `backend/src/owner-admin/owner-admin-auth.service.spec.ts`
- `backend/src/owner-admin/owner-admin-auth.service.ts`
- `backend/src/owner-admin/owner-admin.config.ts`
- `backend/src/owner-admin/owner-admin.controller.ts`
- `backend/src/owner-admin/owner-admin.dto.ts`
- `backend/src/owner-admin/owner-admin.guard.ts`
- `backend/src/owner-admin/owner-admin.integration-test.ts`
- `backend/src/owner-admin/owner-admin.module.ts`
- `backend/src/owner-admin/owner-admin.service.ts`
- `backend/src/partner-placements/partner-bot.flow.ts`
- `backend/src/partner-placements/partner-bot.service.spec.ts`
- `backend/src/partner-placements/partner-bot.service.ts`
- `backend/src/partner-placements/partner-management.service.ts`
- `backend/test/jest-owner-admin-integration.json`
- `onmap-admin/.env.example`
- `onmap-admin/.eslintrc.cjs`
- `onmap-admin/.gitignore`
- `onmap-admin/FONT-LICENSE.txt`
- `onmap-admin/README.md`
- `onmap-admin/build.mjs`
- `onmap-admin/package-lock.json`
- `onmap-admin/package.json`
- `onmap-admin/server.mjs`
- `onmap-admin/src/api.js`
- `onmap-admin/src/app.js`
- `onmap-admin/src/golos.woff2`
- `onmap-admin/src/icon.svg`
- `onmap-admin/src/index.html`
- `onmap-admin/src/style.css`
- `onmap-admin/src/types.d.ts`
- `onmap-admin/test/api.test.mjs`
- `onmap-admin/test/server.test.mjs`
- `onmap-admin/tsconfig.json`


## Вход через существующего Telegram-бота

`/admin` или «Вход в админку» → «Получить токен на 20 минут». Перед выдачей показано, что новая сессия отзовёт прежнюю. Раздел и одноразовая action-кнопка используют существующую revision/consumedAt защиту панели. Обработчик повторно проверяет личный чат, совпадение sender/chat и действующий partner allowlist через OwnerAdminAuthService. Moderation-only ID не получает доступа. Сам update атомарно помечается обработанным до выдачи; потеря отправки не воспроизводит секрет, требуется новая кнопка. Ограничение выдачи: три в минуту на владельца в единственном процессе.

Полный bearer передаётся только личным Telegram-сообщением и копируется в локальную панель. Это сообщение остаётся в Telegram до ручного удаления; срок bearer — 20 минут. В DB/audit/update ledger/outbox и логах полный bearer не сохраняется. Только хеш. Автоматического удаления Telegram-сообщения не обещается. Новый unauthenticated HTTP endpoint не добавлен. Env-поля и admin-миграция остаются прежними; дополнительной auth-миграции нет.

Проверки добавления: 71 backend suite / 1079 unit-тестов, 13 реальных disposable PostGIS сценариев, в том числе bot action → выдача → авторизованный HTTP API, отказ постороннему/группе, повтор update/кнопки и отсутствие bearer в DB. Админка: 22 теста, typecheck/lint/build. Проверки не отправляют сообщения в Telegram. После выката требуется ручной вход владельца через бота.
