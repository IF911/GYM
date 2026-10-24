# Проверки зависимостей GYM

Область: `frontend/package.json` и `frontend/package-lock.json`, включая инструменты
сборки, тестирования и native assets. Публикуется локальная PWA, а native tooling
сохраняется для поддерживаемого upstream-маршрута. Данные пользователя для этих
проверок не нужны.

## Исправления от 2026-10-24

Исходный полный `npm audit`: 12 уязвимых пакетов — 6 moderate, 5 high и 1 critical.
Часть записей описывала одну уязвимую цепочку и её зависимые пакеты.

| Цепочка | Исправленная установленная версия |
|---|---|
| Vite | 8.1.6, текущая minor-ветка закреплена `~8.1.6` |
| Vitest, mocker и coverage | 4.1.12, без перехода на Vitest 5 |
| happy-dom | 21.0.4, исправление ESM code injection |
| assets → старый CLI → tar 6 | assets использует CLI 8.5.3 из проекта; tar 7.5.22 |
| assets → sharp/libvips | sharp 0.35.5 |
| CLI и trapezedev → xcode → uuid | uuid 11.1.1, CommonJS API для xcode сохранён |

Обновлены только четыре прямые dev dependencies. Все прямые production dependencies
сохранили версии предыдущего выпуска. Для transitive dependencies без готового
обновления родительского пакета применены scoped npm overrides:

- `@capacitor/assets` использует основной `@capacitor/cli` через `$@capacitor/cli`
  и `sharp@0.35.5`;
- `xcode` использует `uuid@11.1.1`.

Замена только tar 6 на tar 7 внутри CLI 5 несовместима: старый template consumer
вызывает default export, которого у tar 7 нет. Поэтому устаревшая копия CLI 5
удалена из дерева зависимостей, а распаковка проверяется через настоящий CLI 8.
Перенос на uuid 12+ не нужен: xcode использует CommonJS `require` и `v4()`.

При обновлении npm 10.9.9 упала в Arborist `loadPeerSet` с сообщением
`Cannot read properties of null (reading 'edgesOut')`. npm также сохраняла
устаревший nested CLI в прежнем lockfile вопреки override. Чистое разрешение
с фиксированными прежними версиями остальных прямых зависимостей выполнено
отдельно под Node 24/npm 11; затем итог проверен обычной `npm ci`. В итоговый
package.json возвращены исходные диапазоны неизменённых зависимостей.
`--force` и `--legacy-peer-deps` не применялись.

Первичные источники: [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides),
[Vite 8.1.6](https://github.com/vitejs/vite/releases/tag/v8.1.6),
[Vitest 4.1.12](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12),
[happy-dom 21.0.4](https://github.com/capricorn86/happy-dom/releases/tag/v21.0.4).
Конкретные версии и цепочки дополнительно проверяются по установленному дереву npm.

## Обязательная проверка

Под Node 24, из `frontend/` полного Git checkout (проверка xcode использует копию
native-проекта; публичный архив исходников PWA не содержит `frontend/ios/`):

```sh
npm ci
npm run check:security
npm test
node scripts/check-locales.mjs
npm run test:fatigue-probe
npm run build:local
```

`check:security` выполняет полный `npm audit --audit-level=low`, включая dev
dependencies. Audit не фильтруется через `--omit=dev` и не замалчивает ошибку.
Затем `check-security-tooling.mjs` проверяет реальные consumer API:

1. Создание synthetic tar и распаковку настоящим `extractTemplate` из CLI,
   разрешаемого в контексте assets.
2. Parse/write/reparse временной копии Xcode-проекта и генерацию UUID.
3. Загрузку synthetic PNG через `InputAsset` и генерацию иконок через
   `PwaAssetGenerator`, с проверкой формата и размеров каждого PNG.

Файлы теста создаются в отдельном временном каталоге; source native-проектов,
иконки приложения, упражнений и дневник не изменяются. В тесте нет сетевых загрузок.
Проверка закреплена в Pages release и upstream validation. Скрипт и команда
защищены updater от автоматической замены.

happy-dom 21 добавил Web Animations, которые не завершаются синхронным продвижением
Vitest fake timers. Три swipe-теста используют небольшой локальный animation mock с
виртуальным временем. Проверки удаления, Undo и RTL сохранены; анимации не отключены
глобально, production `use-swipe-row.js` не менялся. Реальное поведение PWA отдельно
проверяется браузером, без этого тестового mock.

При следующем обновлении overrides нужно одновременно проверить `npm ls`, полный
audit, эти consumer checks и обязательную проверку PWA upgrade. Нулевой audit
сам по себе не подтверждает совместимость API и сохранность дневника.
