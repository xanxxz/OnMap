# Изображения раздела OnMap

Созданы встроенным `image_gen` для текущей переработки раздела. Генерация не содержит интерфейс приложения, текст, пины или логотипы.

## Карта

- Финальный файл: `public/art/onmap/city-map.webp`.
- 1536 × 1024 px, WebP quality 85, 609 080 bytes.
- Исходник: `city-map-generated.png` в этой папке.
- Визуальные источники: собственный `public/art/crossroads-atlas.webp` и утверждённый пользователем макет `codex-clipboard-b1a42e42-a4c6-40af-9b4f-366a4f486a07.png`.

Промпт: standalone website map illustration, horizontal 1536×1024. High bird's-eye isometric Russian small-city neighborhood. Warm cream 3–4 storey apartment blocks, terracotta/light gray roofs, mature deep green trees, gardens, courtyard paths, broad gray roads and spacious crossroads in the lower center. Blue canal along upper edge, light gray road bridge toward upper right. Fine architectural watercolor/pencil illustration, subtle paper texture, calm warm daylight. Edge-to-edge artwork. No webpage, type, UI, pins, controls, logos, blank area or fades.

## Рамка Android

- Финальный файл: `public/art/onmap/android-frame.webp`.
- 918 × 1850 px, lossless WebP с прозрачным внешним фоном и прозрачным дисплеем, 176 826 bytes.
- Исходник генерации: `android-frame-generated.png`, 850 × 1850 px.
- При подготовке для 941:2048 дисплея рамка по горизонтали увеличена на 8%; интерфейс приложения не изменялся.
- Примерная внутренняя область: `x=86, y=112, width=744, height=1615`, радиус скругления около 75 px.
- Относительно всего файла: `left=9.37%`, `top=6.05%`, `width=81.05%`, `height=87.30%`.
- Камера: центр `x≈458, y≈148`, радиус около 20 px. Это непрозрачный элемент рамки над изображением экрана.
- Корпус находится приблизительно в `(42,74)—(892,1826)`.
- Визуальный источник: утверждённый пользователем макет `codex-clipboard-6f1cf0c9-8f1f-4f01-8e5c-f7ef84bed42c.png`.

Промпт: one neutral black graphite Android smartphone hardware frame, exactly front-on and upright, no perspective or tilt, modest transparent margin. Tall 941:2048 rounded display, thin restrained bezels, rounded graphite metal corners, subtle realistic rim highlights, small centered punch camera. Genuine alpha outside phone and throughout empty display aperture. No screen content, wallpaper, app, logo, brand, lettering, stand, hand, background or ground. Restrained natural product lighting. Tall portrait bitmap.
