# OnMap — заметки по release-конфигурации

Первичный аудит: 26 сентября 2026 года. Идентификаторы Android/iOS и Android build обновлены 13 октября 2026 года. Исторические сведения ниже о доступности инструментов и готовности инфраструктуры не заменяют повторную release-проверку.

Android Release и iOS Release сейчас имеют ID `com.onmap.app`. Android Debug имеет ID `com.onmap.app.dev`; `namespace` и классы сохраняют `com.roadradar.app`. Вариантная Firebase-конфигурация Release лежит в игнорируемом Git `android/app/src/release/google-services.json`; Gradle создал `google_app_id`, `gcm_defaultSenderId` и `project_id`. Debug намеренно не имеет Firebase-конфигурации и собирается без FCM-регистрации. Debug APK собран и его package ID проверен как `com.onmap.app.dev`. Release `:app:assembleRelease` прошёл до `:app:packageRelease`, но APK не создан: signing config не получил `storeFile`. Сгенерированный Release manifest содержит `package="com.onmap.app"`. Это подтверждает Gradle variants, но не заменяет проверку ID готового подписанного APK/AAB и получение FCM-токена на устройстве.

## Подтверждённые значения

| Параметр | iOS Release | Android Release |
|---|---|---|
| Отображаемое название | `OnMap` в `Info.plist` | `app_name` из Android resources; проверить итоговый APK перед релизом |
| Идентификатор | `com.onmap.app` в Release build settings | Release `com.onmap.app`, Debug `com.onmap.app.dev`; Kotlin/Java `namespace` остаётся `com.roadradar.app` |
| Версия / build | `1.0` / `1` в `project.pbxproj` | `1.0` / `1` в `android/app/build.gradle` |
| Устройства | iPhone и iPad (`TARGETED_DEVICE_FAMILY = 1,2`) | Android variants, min/target SDK — из root Gradle config |
| Сеть | ATS `NSAllowsArbitraryLoads=false`; локальная сеть разрешена отдельно. Текст локально-сетевого разрешения приведён к назначению приложения, но Release endpoint ещё не настроен | Main manifest включает INTERNET; cleartext разрешён только через debug manifest |
| Геолокация | `NSLocationWhenInUseUsageDescription`; фонового разрешения в проверенном plist нет | coarse и fine location; фонового разрешения в main manifest нет |
| Подпись | В Release нет подтверждённой `DEVELOPMENT_TEAM` и provisioning-настройки. Нужны выбранная команда Apple Developer, App ID/bundle registration, signing certificate и provisioning/automatic signing | Release ссылается на отдельный `signingConfigs.release`; debug signing не используется. Нужны собственный keystore и четыре переменные окружения из `ANDROID_RELEASE_SIGNING.md` |
| Debug flags | В Release `ENABLE_NS_ASSERTIONS=NO`, `COPY_PHASE_STRIP=YES`; схема Archive использует Release | `usesCleartextTraffic=true` находится только в `src/debug/AndroidManifest.xml`; release minification сейчас выключена (`minifyEnabled=false`), само по себе это не доказывает debug-сборку |

Техническое имя проекта остаётся `RoadRadar`; пользовательское имя — `OnMap`. Не менять Bundle ID/applicationId после первой публикации без отдельного решения: это идентификатор приложения в store.

## Endpoint и конфигурация окружения

Мобильный код читает `API_BASE_URL` / platform overrides и `SOCKET_URL` / platform overrides из `react-native-config`. Android `dotenv.gradle` читает `.env` (или `ENVFILE`) и копирует все ключи из выбранного env-файла в `BuildConfig` и Android resources, доступные внутри APK. Xcode scheme запускает `BuildXCConfig.rb`, который также генерирует xcconfig из env.

В проверенном локальном корневом `.env` общие API и Socket URL настроены на HTTP; платформенные fallback URL указывают на локальные адреса разработки. Значения хостов и возможные ключи здесь не записываются. Этот файл игнорируется Git, но попадёт в release-конфигурацию при обычной сборке, если оператор не выберет другое окружение. ATS запрещает произвольные незашифрованные подключения на iOS; Android release также не должен полагаться на debug-only cleartext setting.

Перед любым archive/APK для тестирования в store необходимо:

1. После настройки hosting подготовить отдельный production env-файл вне Git с HTTPS API и Socket URL и проверить, что именно он используется обеими release-сборками.
2. Проверить обязательные клиентские map keys и их ограничения у поставщика. Клиентские ключи не считать секретом; ограничить их по bundle/package и API, если провайдер это поддерживает.
3. Проверить собранный `.app`/APK и build logs: адреса должны быть production HTTPS; там не должно быть секретов backend, Telegram, DB или Android signing.
4. Убедиться, что review backend доступен из внешней сети и не зависит от локального компьютера.

Наличие HTTP в локальном `.env` — доказанный риск для release-сборки из текущего checkout. Его исправление зависит от production-хостинга, поэтому локальные URL не заменялись придуманным адресом.

## Требования для iOS Archive и подписи

После предоставления владельцем доступа к Apple Developer:

1. Подтвердить bundle ID `com.onmap.app`, App Store Connect app record, владельца/Seller name и права команды.
2. Решить, какую Apple Developer team использовать для Release. Сейчас единственный явно указанный Team ID стоит в Debug; переносить его в Release автоматически нельзя.
3. Настроить automatic signing либо release certificate и provisioning profile для выбранной команды. Подписывать archive именно Release-конфигурацией.
4. Согласовать новую marketing version/build number вместо шаблонных `1.0`/`1`.
5. На машине с аккаунтом выполнить archive для `generic/platform=iOS`, проверить подпись, entitlements, embedded provisioning, privacy report и фактический Info.plist. Затем установить на физический iPhone, проверить разрешение геолокации, запуск, сеть и отсутствие debug адресов.
6. Загрузить в TestFlight только после проверки production-like окружения и подготовить ответы App Review.

Локально установлен Xcode 26.3, но проверка `xcodebuild -showBuildSettings` в текущем sandbox не завершилась из-за недоступности CoreSimulator/Xcode service. Archive, подпись сертификатом, App Store Connect запись и TestFlight без аккаунта не подтверждены.

## Требования для Android Release APK

После установки совместимых JDK и Android SDK:

1. Передать keystore-путь, пароль keystore, alias и пароль ключа только через секретное окружение процесса сборки; не помещать их в `.env`, Gradle properties, командную строку или репозиторий. Для FCM Release использует `android/app/src/release/google-services.json` с Firebase Android app `com.onmap.app`; Debug намеренно остаётся без FCM, пока не появится отдельный `src/debug/google-services.json` для `com.onmap.app.dev`.
2. Выполнить `cd android && ./gradlew :app:assembleRelease` на отдельной release-конфигурации.
3. Убедиться, что команда завершилась ошибкой при отсутствии signing config и что Release не подписан debug сертификатом.
4. Проверить `apksigner verify --print-certs <apk>`, сравнить отпечаток с доверенным release keystore и исследовать APK/логи на отсутствие signing secrets и локальных endpoint.
5. Безопасно сохранить backup keystore и проверить установку/обновление подписанного APK на физическом Android устройстве.

В текущем окружении Android SDK отсутствует, а JVM не обнаружена (`java -version` сообщает, что runtime недоступен). Gradle wrapper есть, но assemble/signature validation запустить нельзя. Release keystore/credentials не создавались.

## Что проверено по plist и privacy manifest

`plutil -lint` прошёл для `Info.plist`, `PrivacyInfo.xcprivacy` и `project.pbxproj`. В `PrivacyInfo.xcprivacy` перечислены Precise Location, User ID, Other User Content и Product Interaction как linked, без tracking; указаны required-reason API File Timestamp, UserDefaults и System Boot Time. Это не заменяет App Store Connect Privacy Details и не подтверждает privacy declarations всех транзитивных SDK. Нужны archive privacy report и сверка поставщиков перед отправкой.

## Выполненные точечные изменения

- Исправлен текст `NSLocalNetworkUsageDescription`: он больше не обещает пользователю, что локальная сеть нужна для dev server. Сетевые разрешения и ATS поведение не менялись.
- В `ANDROID_RELEASE_SIGNING.md` уточнено, что release signing credentials нельзя помещать в `.env`: React Native Config встраивает все значения `.env` в BuildConfig/resources APK.
- В текущих локальных env-файлах имена четырёх Android signing-переменных не обнаружены; env-файлы не tracked Git.

## Актуальный путь к первой App Review отправке

Проверка локального состояния 26 сентября 2026 года:

- Xcode 26.3 и CocoaPods 1.17 доступны; `Info.plist`, `PrivacyInfo.xcprivacy` и Xcode project проходят `plutil -lint`. App Store icon — PNG 1024×1024 без alpha.
- Mobile Jest suite: 38 suites / 182 tests проходят после test-only mock для ESM BlurView; mobile typecheck и ESLint `jest.setup.js` проходят.
- `xcodebuild -list` не завершился: в sandbox недоступны CoreSimulator/Xcode services и SwiftPM/Clang cache вне workspace. Поэтому успешный Release archive здесь не подтверждён.
- В текущем локальном `.env` API и Socket endpoints имеют HTTP scheme; `MAPTILER_API_KEY` не задан. Xcode scheme генерирует `ios/tmp.xcconfig` из env, а React Native Config использует выбранный env при сборке. Не архивировать с текущим dev env: production HTTPS API/Socket и map provider configuration появятся только после hosting.
- Release bundle ID — `com.onmap.app`, версия/build пока шаблонные `1.0`/`1`. Этот исторический аудит не подтверждает актуальную подпись или App Store Connect запись; их нужно сверять отдельно перед archive.
- Пользовательские дорожные события являются UGC. Текущая кнопка жалобы только открывает ручной Telegram draft; защищённой очереди обработки, блокировки автора и процедуры снятия события нет. Apple Guideline 1.2 требует фильтрацию UGC, жалобы с своевременной реакцией, возможность блокировки нарушителей и опубликованный контакт: [App Review Guidelines, 1.2](https://developer.apple.com/app-store/review/guidelines/). Поэтому соответствие этому пункту и принятие приложения App Review сейчас не подтверждены.
- В Privacy Policy и Terms ещё остаются незаполненные публичные URL и юридические поля. Не отправлять placeholder-документы как опубликованные ссылки.

Короткий порядок, чтобы не тратить время на повторные сборки:

1. Завершить решение по модерации UGC: назначить реального оператора/процесс и реализовать минимальные фильтрацию, report handling, hide/block; не заявлять ручной Telegram draft как очередь.
2. Подтвердить seller identity, App Store Connect запись и владение `com.onmap.app`.
3. После этого поднять чистый backend на HTTPS, включить согласованные production secrets/integrations, затем подготовить отдельный release env с HTTPS API/Socket и проверенной картой.
4. Заполнить/опубликовать Privacy Policy и Terms, сверить App Store Connect Privacy Details и App Review Notes.
5. Выполнить подписанный Release archive, privacy report и smoke на физическом iPhone; загрузить в TestFlight, исправить замечания и только затем отправлять на App Review.

## Остаток

- **Данные/решение владельца:** Apple Developer team, Seller/legal identity, окончательные версия/build, категории и возрастной рейтинг, Privacy Policy/Terms URLs, подтверждение реального канала `@onMapSupport`, регионы выпуска.
- **Нужны аккаунт/ключи:** App Store Connect record, certificates/provisioning и archive/TestFlight; Android release keystore и signing validation.
- **После hosting:** production HTTPS API/Socket endpoints, конфигурация release env для iOS и Android, production secrets, backup/monitoring и проверка доступности backend извне.
- **Перед публикацией:** закрыть UGC/reporting вопросы из `MODERATION_AND_APP_PRIVACY_READINESS.md`, провести privacy SDK report и финальную проверку политики/ASC disclosures.
