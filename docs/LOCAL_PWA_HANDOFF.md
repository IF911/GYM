# GYM PWA: передача результата

Дата актуализации: 2026-10-26. Source: `IF911/GYM`, `main`; upstream
`DuarteSantos8/openGym@08eabf4f480f43fd789592577463cca1b504976e` (1.4.2).
История upstream сохранена. Рабочая копия: `work/gym`.

## Исправление календарной зависимости автопроверки: 2026-10-26

Пользователь разрешил оценить новые изменения и добавить полезное с сохранением локальных
доработок. Три новых коммита автора меняют только issue/PR templates, CONTRIBUTING и FAQ.
Они приняты отдельным merge `7e9adadf` с обоими родителями; новых функций приложения в них нет.
Шесть открытых Dependabot PR оценены и не применялись: API/Docker не участвуют в LOCAL PWA,
переход Vitest на major 5 и групповое обновление React/Vite не решают подтверждённой задачи
этого выпуска. Чистая установка прежнего lockfile и полный security check показывают 0 уязвимостей.

Основание исправления — [issue #13](https://github.com/IF911/GYM/issues/13) и
[run 40288058463](https://github.com/IF911/GYM/actions/runs/40288058463): сборка, security и
frontend suite прошли, но browser upgrade smoke остановился до `promote`. Ошибка локально
воспроизведена на двух одинаковых сборках: `locator.waitFor: Timeout 30000ms exceeded`,
ожидание checkbox `Set 1 done` после выбора Full Body A. По понедельникам название находится
в неинтерактивной карточке Today's plan, где нужна кнопка Start Full Body A; в остальные дни
программу можно запустить через строку Other routines. Приложение работало штатно, ошибался
выбор fixture в тестовом скрипте.

`startFixtureWorkout` выбирает точную кнопку запуска или единственную строку другой программы.
Он используется для обеих тренировок в smoke. `GYM_UPGRADE_TEST_DATE` позволяет повторить
конкретный день через browser clock, не останавливая таймеры. Workflow теперь выполняет полный
smoke для понедельника и вторника при каждом запуске. Ни одна проверка сохранности данных,
сети или ошибок страницы не убрана и не ослаблена.

| Поведение / проверка | Подтверждение перед публикацией |
|---|---|
| Тест запускает выбранную программу в обоих разделах | Browser smoke PASS на всех 7 днях: 26.10–01.11.2026 |
| Сохранённая и активная тренировки переживают reload | PASS во всех 7 сценариях |
| Программы, вес, custom exercise, IndexedDB media | PASS; 3 программы и 8 bytes synthetic media сохранены |
| Калории, Health duplicate guards и выбранный язык | PASS во всех 7 сценариях |
| JSON export и import без сети | PASS во всех 7 сценариях |
| Privacy / page errors | 0 external/API/write requests, 0 page errors |
| Полный frontend suite | 463 files / 5656 tests PASS под Node 24.22.1 |
| Security / реальные consumers overrides | 0 vulnerabilities; tar/Xcode/PNG consumers PASS |
| Updater / Health integrity / locales | 11 tests / 7 tests / 18 locales × 2413 keys PASS |
| Fatigue/history probes | 108000 + 1800 comparisons PASS |
| Local build / source archive | PASS; 6554 stills + 6554 animations; все 7646 source files проверены |
| Переход с предыдущего выпуска | PASS; HTML/JS/CSS/SW совпадают, все данные сохранены |
| Реальная смена worker в отдельной QA-копии | PASS; controllerchange получен, незаконченный ввод и активная тренировка сохранены |
| Синтаксис workflow и скрипта | Все 10 YAML разобраны; node --check и git diff --check PASS |

Production paths `frontend/src`, `frontend/public`, package/lockfile, Vite config и `catalogue`
побайтно сохранены относительно `2430052b`. Локальные guards, русские тексты, backup,
защищённые ссылки, калории и Health v2 не менялись. Тесты используют только отдельный
искусственный дневник; реальные данные телефона не читались. В полном unit suite было
предупреждение Node `MaxListenersExceededWarning`, без failed tests или unhandled errors.

Исправление `83887d32a8c3b56483cb92734c48fb4970ae1601` отправлено обычным push в `main`.
[Pages 40297589221](https://github.com/IF911/GYM/actions/runs/40297589221) — success:
build и deploy прошли. [Upstream verification 40297589199](https://github.com/IF911/GYM/actions/runs/40297589199)
— success: prepare, validate с обеими датами и report прошли; promote корректно пропущен
для verify без новых изменений автора. Автоматика закрыла issue #13 как completed.

После deploy 30 статических файлов live побайтно совпали с проверенным выпуском, весь
публичный архив прочитан: 7646 уникальных source files, SHA-256 каждого совпал с release.
HTML/JS/CSS/SW совпадают и с предыдущим выпуском. Live mobile smoke в отдельном чистом
Chromium подтвердил сохранение тренировки и активной сессии, 3 программ, веса, custom exercise,
8 bytes media, калорий, Health markers и языка; JSON export и offline import прошли,
0 external/API/write requests и page errors. Реальные данные телефона не использовались.

Обязательных незавершённых этапов нет. Последующий documentation commit фиксирует delivery;
опубликованный source archive и исправление соответствуют `83887d32`. Для отката исправления
— `git revert 83887d32`; для документационного merge — `git revert -m 1 7e9adadf`.
Откат кода не очищает хранилище телефона. Опционально остаются рассмотренные Dependabot PR,
проверка физического iPhone/Safari и реальное выполнение Health v2.
Новые credentials не создавались, признаков компрометации нет; ротация не требуется.

## Исправление 12 npm-уязвимостей: 2026-10-24

Пользователь разрешил исправление всех 12 npm-уязвимостей, проверки и публикацию с
сохранением локального режима, переводов, доработок и дневника. База — `1dd0ed8c`.
Полный audit: **12 → 0** (critical 1 → 0, high 5 → 0, moderate 6 → 0).
Runtime audit `--omit=dev`: также 0. Оба результата получены после чистой `npm ci`.
Уязвимые пакеты не исключались из audit, инструменты native/тестирования не удалялись.

Четыре прямые dev dependencies обновлены: Vite 8.1.6, Vitest/coverage 4.1.12,
happy-dom 21.0.4. Scoped overrides переводят assets на root CLI 8.5.3 и sharp 0.35.5,
xcode — на uuid 11.1.1. В дереве больше нет вложенного CLI 5/tar 6; CLI использует tar
7.5.22. Все прямые production dependencies сохранили прежние версии. Подробности,
первичные источники и причины разрешения зависимостей: [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md).

`check:security` закреплён в обоих workflows: полный audit и проверки реальных consumers
на synthetic tar/Xcode/PNG fixtures. Новый скрипт и команда защищены updater от замены.
Проверены extraction, UUID, parse/write/reparse проекта и размеры PNG. Никакие source assets
или native проекты при smoke не изменяются.

happy-dom 21 реализует Web Animations, которые не следуют синхронному продвижению Vitest
fake timers. Первый полный прогон показал 8 неуспешных проверок и 8 AbortError в трёх swipe
suites. Исправлено только их тестовое управление анимациями: локальный virtual-time mock
сохранён в `src/test/swipe-animation.js`. Assertions удаления/Undo/RTL не ослаблены.
Production `use-swipe-row.js`, остальной исполняемый код `frontend/src`, хранилище и privacy
не менялись. Русские packs/review/UI translations и оба подписанных Health v2 файла
побайтно совпадают с предыдущим выпуском.

| Проверка | Результат перед выпуском |
|---|---|
| Чистая установка и полный audit | npm ci PASS; 0 во всех severity |
| Реальные consumers overrides | PASS под Node 24.22.1 / npm 11.21.1 |
| Полный frontend suite | 463 files / 5656 tests PASS, 0 unhandled errors |
| Updater guard, включая security script/command | 11 tests PASS |
| Health shortcut builder/integrity | 7 tests PASS |
| Переводы | 18 locales / 2413 keys PASS; 5632 exercise packs и 92 notes сохранены |
| Fatigue/history probes | 108000 + 1800 comparisons PASS |

Local build под Node 24 прошла: 6554 stills / 6554 animations. Исполняемые HTML/JS/CSS/SW
совпадают с предыдущим выпуском, поэтому browser upgrade принял ту же сборку без нового
controllerchange или баннера. Проверка reload/deploy сохранила историю, активную тренировку,
3 программы, вес, собственное упражнение, 8 bytes IndexedDB media, калории, Health markers и язык.
JSON export и offline import прошли, 0 external/API/write requests и page errors.
Отдельный mobile smoke подтвердил русский default, описание и 5 шагов техники после offline
reload, PlanLink offline, LOCAL settings/updater и Health v2. Реальный Chrome без test mock
удалил искусственную программу жестом и восстановил её через Undo, 0 page errors/API/external writes.
Все 10 workflow YAML разобраны, `git diff --check` пройден.

Security commit `f4b89cc669569628b8015a31855ef983d5e5502f` отправлен обычным push в main.
[Pages 40094079147](https://github.com/IF911/GYM/actions/runs/40094079147) — success:
чистая установка, полный audit/native consumers, полный suite, shortcut/locales/fatigue,
сборка и deploy под Node 24. [Upstream verification 40094079139](https://github.com/IF911/GYM/actions/runs/40094079139)
— success: prepare/validate/report прошли, promote корректно пропущен для verify.
Новая security gate прошла и на Linux runner, без исключения dev dependencies.

Live проверен после deploy: 27 статических файлов побайтно совпадают с проверенными,
весь опубликованный source archive — 7645 уникальных файлов, каждый hash совпал с релизом.
В чистом mobile browser на рабочем HTTPS origin подтверждены ru default, русские описание
и шаги после offline reload, PlanLink offline, LOCAL settings/updater, offline калории и Health v2;
0 external/API/write requests и page errors. HTML/JS/CSS/SW остались теми же, что до исправления
инструментов, поэтому отдельный restart/новая миграция дневника не требуются.

Обязательных незавершённых этапов этого security-выпуска нет. Последующий documentation
commit фиксирует результаты; опубликованные исходники и код соответствуют `f4b89cc6`.
Откат — `git revert f4b89cc6` и штатный Pages release; он вернёт старые tooling
зависимости, поэтому не является устранением уязвимостей. Origin и ключи дневника не меняются.
Реальные тренировки и данные телефона не читались; проверки используют искусственный дневник.
Физический iPhone/Safari, выполнение Health и полный native archive остаются отдельной проверкой;
этот выпуск публикует статическую PWA. Признаков компрометации credentials не обнаружено,
новые credentials не создавались, ротация не требуется.

## Ручное совмещение openGym 1.4.2: 2026-10-24

Пользователь явно разрешил ручное совмещение, проверки и публикацию с сохранением дневника,
локального режима и всех переводов. Основание — issue #9 / upstream-sync run 40073579115:
изменены 9 защищённых путей; до merge и публикации автоматизация не дошла.
Сохранены оба родителя истории: GYM `4bae34fe` и upstream `7a3ace53`; force push не используется.
Ручные конфликты App/main/sheets/Settings/settings-pages совмещают upstream UI и наши LOCAL guards.
Новый iOS workflow ограничен `DuarteSantos8/openGym` во всех jobs, как остальные native workflows.

Все 5632 русских названия, описания и наборы шагов, 30709 шагов техники и файл review с 92
uncertain source entries побайтно сохранены. 155 новых UI-ключей upstream уже переведены на русский;
прежние 2258 значений не изменены. Русский default, осознанный выбор другого языка и offline packs
сохранены. PlanLink, exercise-tools, локальный updater, калории, source archive и shortcut v2 сохранены.

В новой upstream-ветке объединения локального backup найден и исправлен сброс полей GYM:
`localEnergy`/`localHealth` отсутствуют в общем sync merger. Regression сначала получила
`localEnergy === undefined`, затем прошла после сохранения полей в device merge. Карты калорий
объединяются с приоритетом импортных значений, exports Health — с приоритетом текущих markers.
Обычная осознанная замена backup не изменена. Установленная команда Health и дневник не мигрируют.

| Сохраняемое поведение | Проверка |
|---|---|
| Полная русская библиотека, старые формулировки и примечания | byte comparison с GYM base, `ru-catalogue.test.js`, locale check |
| LOCAL без аккаунта/AI/синхронизации, source/licensing, PlanLink и exercise-tools | local/store/Settings/plan-link/exercise-tools suites |
| Объединение старого backup без потери калорий и Health markers | две новые регрессии `useStore.local.test.js` |
| История, активная тренировка, программы, вес, медиа, prefs/Health и язык при обновлении | расширенный `check-local-upgrade.mjs` на предыдущей и новой сборке |
| Отложенный restart по кнопке без потери ввода, offline import | тот же browser upgrade check |
| Shortcut v2 без пересоздания, отсутствие внешних запросов | 7 builder tests, integrity и browser smoke |

Локально пройдены: 463 frontend files / 5655 tests, 11 updater tests, 7 shortcut tests,
18 locales / 2413 keys, 108000 fatigue и 1800 history comparisons. Node локальной проверки —
22.23.4; обязательные workflows выполняют полный suite и сборку под Node 24.
Предыдущая сборка `4bae34fe` сохранена отдельно для upgrade проверки; реальные дневники не читались.
Browser upgrade на 390×844 сохранил все проверяемые данные, 0 external/API/write requests и page errors.

Финальный mobile smoke подтвердил русский default, русские описание и 5 шагов выбранного
упражнения после полного offline reload, offline форму PlanLink, отсутствие native Watch/AI/server
в локальных настройках, локальный update row, offline калории и ссылку shortcut v2.
0 external/API/write requests и page errors. Source archive: 7642 уникальных пути, содержимое
каждого файла совпало с worktree, private/data/.env отсутствуют. SHA-256 обеих копий команды
сохранён: `36f673aaf6e979db91370ea6eee6c6b960675c5b905c9c8befd113f0be951925`.
Все 10 workflow YAML разобраны; лишние пустые строки в новых upstream-файлах удалены для
прохождения `git diff --check`, без изменения поведения.

Релиз `344452d58760fdcc4fbe3f7740d73606e226f264` отправлен обычным push в main.
[Pages 40091405759](https://github.com/IF911/GYM/actions/runs/40091405759) — success,
включая полный suite, shortcut/locales/fatigue, build и deploy под Node 24.
[Upstream verification 40091405751](https://github.com/IF911/GYM/actions/runs/40091405751)
— success: prepare/validate/report прошли, promote пропущен для verify без новых upstream commits.
[Issue #9](https://github.com/IF911/GYM/issues/9) закрыта автоматически с reason completed.
Все upstream native/server jobs, в том числе новый iOS, пропущены в форке.

Live `https://if911.github.io/GYM/` отдаёт точные 27 проверенных файлов выпуска: HTML,
`index-sSVrhLvs.js`, CSS, связанные модули, SW, manifest, лицензии и обе копии shortcut v2.
Публичный source archive проверен целиком: 7642 уникальных файла, SHA-256 каждого совпал с
проверенными исходниками релиза. Live mobile smoke на новом synthetic профиле подтвердил ru default,
русское описание и шаги после offline reload, PlanLink offline, LOCAL settings/updater,
offline калории и Health v2. 0 внешних/API/write requests и page errors.

Обязательных незавершённых этапов этого выпуска нет. Документационный commit после релиза
фиксирует live результат; исполняемый код сайта соответствует `344452d5`.
Данные телефона не используются и не передаются GitHub; проверки используют искусственный дневник.
Откат: `git revert -m 1 344452d5` и штатный Pages release, без очистки Safari или смены origin.
Откат кода не восстанавливает удалённое хранилище телефона; обычный JSON/ZIP backup остаётся полезен.

Опциональный backlog: физический iPhone/Safari и реальное выполнение Health v2 требуют проверки
владельцем. На момент того выпуска npm audit сообщал 12 проблем build/test/native-tooling (6 moderate / 5 high / 1 critical),
включая tar в Capacitor CLI; все отмеченные пакеты — dev dependencies и не входят в статическую PWA.
Автоматический audit fix/major update не выполнялся в том merge; все 12 проблем устранены
последующим security update, описанным выше. Уязвимости не считаются устранёнными прохождением тестов.
Новые credentials не создавались, признаков компрометации не обнаружено; ротация не требуется.

## Исправление неизвестных переменных команды Health: 2026-10-21

Владелец проверил первоначальный файл на iPhone. После выдачи разрешений в редакторе видны
красные «Неизвестная переменная» в длительности и калориях; поле даты пустое. Это несовместимость
сериализации самого файла. Прежние пять проверок структуры повторяли ошибочное предположение
генератора и не подтверждали распознавание полей iPhone. Общая ошибка Shortcuts не доказывала
причину; скрин редактора дал конкретное наблюдение на границе импорта.

Для `WFQuantityFieldValue.Value.Magnitude` нужен прямой словарь `ActionOutput`, без вложенных
`Value`/`WFSerializationType`. Это сверено с независимым сериализатором Cherri
`makeQuantityFieldValue` → `variableValueWithSerialization(..., "")`. `WFWorkoutDate` теперь
содержит inline `WFTextTokenString` с одним U+FFFC и `attachmentsByRange`, как native date-field
exports. Дата по-прежнему ссылается на исходное начало тренировки, а не на время импорта.
Дистанция не задана: «10 км» — placeholder из определения Apple action, не значение в файле.
Две новые регрессии формата падали на старом генераторе и проходят после исправления; проверяются
также producer UUID и соответствие исходным ключам `minutes`/`activeKcal`. Это контракт формата,
а не подтверждение исполнения Apple Health runtime.

Файл переподписан штатным CLI без запуска команды/Health. Новая ссылка —
`shortcuts/v2/GYM-Health.shortcut`; basename и имя команды сохранены. Корневой старый файл содержит
те же байты для совместимости. SHA-256 source/alias/v2 проверены по integrity metadata.
Versioned path защищает повторную установку от старого файла в Safari cache; worker кэширует
новый файл, UI использует единую константу пути, updater защищает его от замены upstream.

Прежний флаг установки без `shortcutRevision: 2` требует повторной ручной отметки установки.
В recovery показана инструкция замены, «Передать повторно» недоступна до этой отметки.
Подтверждение установки само передачу не запускает и pending record не удаляет. Веса, подходы,
программы, дневник, media и прежние отметки не мигрируют и не очищаются. Payload/локальный расчёт
и ограничения сети не менялись. Сообщение при ручном запуске без входных данных переведено на русский.
Явный retry теперь заменяет marker одним сохранением вместо удаления и последующей вставки.
Read-back проверяет также номер попытки и timestamp: одинаковый payload id прежней попытки не
маскирует ошибку сохранения. Регрессия с теми же данными и тем же временем была red до проверки
attempt и проходит после неё; при отказе storage native URL не открывается, прежняя запись остаётся.

Доступ к native редактору Shortcuts на Mac не разрешён (`Computer Use was not approved to use
Shortcuts`); ограничение не обходилось через другую UI-автоматизацию. Подпись статического общего
файла — отдельная операция, без установки/запуска и без тренировочных данных. На физическом iPhone
нужно ещё подтвердить исчезновение красных полей и реальную запись исправленной команды.
Локально пройдены 7 проверок source/signature/формата команды, targeted UI/bridge/store/SW,
11 upstream sync tests, 18 locales / 2258 keys, 108000 fatigue и 1800 history comparisons.
Build local успешен: 6554 stills / 6554 animations. Mobile smoke 390×844 с iPhone UA проверил
реальный download нового пути с ожидаемым SHA, замену старого setup-флага без очистки pending,
честный статус, offline калории и JSON backup round-trip. Upgrade smoke сохранил историю,
активную тренировку, незаконченный ввод до перезапуска, программы, вес, custom exercise и media.
Во всех browser сценариях 0 внешних/API/write requests и page errors. Health native action не запускался.
Полный suite: 417 файлов / 5152 теста — PASS. Исправление опубликовано из
`9902e0969172bee95e355897f854c4e25243b7d3`; Pages
[39630565228](https://github.com/IF911/GYM/actions/runs/39630565228) — success.
Live отдаёт точный `index-B1Wx0y8_.js`, SW, source plist, metadata и оба подписанных файла;
SHA-256 v2 — `36f673aaf6e979db91370ea6eee6c6b960675c5b905c9c8befd113f0be951925`.
Все 7574 файла source archive прочитаны и совпадают с опубликованными исходниками. Live mobile
smoke повторно прошёл: download v2, ручная замена старого setup-флага, сохранение pending,
offline расчёт/backup round-trip и summary; 0 внешних/API/write requests и page errors.
Открытый этап: владелец переустанавливает v2 на iPhone и подтверждает нативную запись.
Новых credentials нет, признаков компрометации нет, ротация не требуется.
Откат web-кода — revert `9902e096` и штатный Pages release. Он не очищает дневник; установленную команду iPhone обновляет
сам владелец. Старый файл первого выпуска возвращать не рекомендуется из-за подтверждённой ошибки.

## Оценка расхода и передача в Apple Health: 2026-10-21

Для завершённой силовой тренировки добавлена карточка «Примерный расход» в итоговом экране
и истории. Активные калории считаются на устройстве по массе тела, всей длительности сессии
с паузами и выбранной интенсивности: `(MET - 1) × 3.5 × кг / 200 × минуты`, MET 3 / 3.5 / 6,
округление до 10 ккал. Рабочие веса и повторы не используются как множитель расхода.
Без веса или корректной длительности число не подставляется; чистые cardio-записи не оцениваются.
Уточнение веса не создаёт взвешивание и не изменяет подходы. `localEnergy` и `localHealth` —
необязательные поля обычного локального состояния, включённые в JSON/ZIP backup.

Подписанная команда `GYM-Health.shortcut` устанавливается один раз на iPhone под именем
`GYM-Health`. Кнопка «Добавить в Здоровье» открывает её через native URL scheme с минимальным
JSON: версия/id/начало/конец/минуты/активные ккал. Упражнения, заметки и масса тела не передаются.
Нет HTTP endpoint, clipboard, callback URL или автоматического экспорта. До запуска на телефоне
сохраняется pending marker; ошибка сохранения запрещает запуск. Обычный повтор заблокирован,
восстановление требует явного retry с предупреждением о дубле. Открытие URL не выдается за запись:
пользователь отмечает наличие тренировки после проверки в «Здоровье». Правка/удаление в GYM
не меняет уже созданную запись Apple Health. Команда показывает отдельное подтверждение с отменой
и предупреждением о записи той же тренировки часами/другим приложением.

У команды только локальная обработка и `Log Workout` типа Traditional Strength Training с
динамическими датой, минутами и active kcal. Отдельный Health sample калорий не создаётся.
Источник plist воспроизводим; macOS `shortcuts sign --mode anyone` успешно подписал общий код
без тренировок. SHA-256 source/signed проверяются по integrity metadata. Файл включён в offline
shell; новые файлы защищены от автоматической замены upstream. Синхронизация Apple Health
через iCloud остаётся выбором владельца; пользователь явно разрешил её.

Локальные проверки: 417 frontend files / 5149 tests, 5 shortcut structure/integrity tests,
11 upstream sync tests, 18 locales / 2258 keys, 108000 fatigue и 1800 history comparisons — PASS.
Local build успешен: 6554 stills / 6554 animations. Полный набор тестов выдаёт
`MaxListenersExceededWarning`; ошибок тестов нет. Реальная установка и запись на физическом
iPhone не проверялись: доступ к устройству отсутствует. Структурные тесты и подпись не заменяют
проверку выполнения Health action на телефоне.

Upgrade smoke прошёл в viewport 390×844: новая версия применена кнопкой обновления, незаконченный
ввод сохранился до перезапуска, активная тренировка, история, 3 программы, вес, custom exercise
и 8 bytes IndexedDB media не изменились, JSON export и offline restore успешны; 0 внешних/API/write
requests и page errors. Сценарий smoke исправлен: явное открытие chooser не зависит от того,
запускает ли кнопка Start сегодняшнюю программу в конкретный день недели.
Отдельная регрессия worker воспроизвела возврат HTML вместо файла команды при navigation click.
Теперь только корневой документ использует fallback на index, а файл получает свои байты из кэша;
проверка проходит также без сети. Уточнено доступное имя переключателя интенсивности.

Мобильный UI smoke с iPhone UA, viewport 390×844 прошёл: точная подсказка отсутствующего веса,
ввод 80 кг без создания взвешивания/правки истории, изменение интенсивности (210 → 420 ккал),
реальный click по установочной ссылке и скачивание AEA1 с ожидаемым SHA-256, ручная отметка
установки, synthetic pending/confirmed/retry-warning без запуска native Health. Без сети
оценка меняется до 170 ккал, JSON экспорт и восстановление `localEnergy`/`localHealth` сохраняют
историю; обычное завершение сессии показывает карточку в summary. 0 внешних/API/write requests,
query-параметров с данными и page errors. Визуально проверены карточка, настройки и установка;
лицензированные media скрыты при снимке.

| Поведение | Проверка |
|---|---|
| MET, активные калории, единицы, legacy timestamps и неполные записи | `workout-calories.test.js` |
| Минимальный native payload, save-before-open и запрет обычного повтора | `health-shortcut.test.js`, `useStore.local.test.js` |
| Уточнение веса, setup, pending/confirmed и backup | `WorkoutEnergy.test.jsx`, `useStore.local.test.js`, mobile runtime smoke |
| Navigation по файлу и безопасное offline обновление | `sw-local.test.js`, `check-local-upgrade.mjs` |
| Воспроизводимый plist, поля Health, отсутствие сетевых действий и SHA-256 | `build-health-shortcut.test.py` |

Функциональный commit `2997399ff18324d54777ad54da2a72c754b6a285` отправлен в `main`.
Pages [39599182668](https://github.com/IF911/GYM/actions/runs/39599182668) завершился success,
включая повторные обязательные проверки. Live отдаёт ожидаемый `index-BMtCy1ke.js`, точный SW,
подписанную команду и лицензии. Все 7573 файла публичного source archive прочитаны и совпадают
с опубликованными исходниками; личных файлов в них нет. Повторный mobile runtime smoke на live
успешен: реальное скачивание файла, local preferences, честные статусы передачи, offline расчёт,
JSON round-trip и finish summary; 0 внешних/API/write requests и page errors.

Обязательных незавершённых этапов нет. Опциональная проверка владельцем — один импорт и реальная
запись на физическом iPhone с разрешением Health: её нельзя подтвердить desktop-тестом. Новых
credentials нет, признаков компрометации нет, ротация не требуется. Для отката — revert `2997399f`
и штатный Pages release; данные дневника и существующие записи Apple Health откат кода не удаляет.

## Обновление уже открытой PWA: 2026-10-20

На присланном iPhone-скрине отсутствовали новая кнопка импорта и более ранний пункт личной ссылки.
Live Pages при этом отдавал ожидаемый выпуск `4b4497b3`. В изолированном мобильном браузере
воспроизведён механизм: новый worker установлен и получил управление через `controllerchange`,
но документ продолжил старый bundle и не показал кнопку. Прежний upgrade smoke сам делал reload,
поэтому не проверял наличие понятного действия для уже открытого клиента.

Добавлены lifecycle checks local worker на старте/resume/online, ручная проверка в «О приложении
и обновления», баннер готового обновления и явный перезапуск по кнопке. MessageChannel передаёт
только публичные URL JS/CSS установленного shell; первый claim той же версии не вызывает баннер.
Обновление только CSS также распознаётся. Сохранены атомарная установка shell и cache-first offline
navigation. Нет автоматического reload/navigate, чтения дневника обновлятором или изменения схемы.
Старый клиент без нового listener требует одного полного перезапуска после установки worker:
без этого заменить загруженный React-код, сохранив незаконченный ввод, невозможно.

| Поведение | Проверка |
|---|---|
| Stale shell, первый claim, CSS-only, resume throttle, timeout и гонка lifecycle | `local-pwa-update.test.js` |
| Ответ worker только своему scope и публичные URL shell | `sw-local.test.js` |
| Баннер/ручная проверка/error copy, reload только по клику, ввод не меняется | `LocalPwaUpdate.test.jsx` |
| Legacy restart, future CSS-only update через UI, активная тренировка и незаконченный ввод | `check-local-upgrade.mjs` |
| История, программы, вес, custom exercise, IndexedDB и backup после обновления | тот же browser smoke |

Пройдены 414 frontend test files / 5126 tests, 11 sync tests, parity 18 locales / 2258 keys,
108000 fatigue и 1800 history comparisons. Build local успешен (6554 stills / 6554 animations).
Оба upgrade сценария прошли в mobile viewport 390×844: одна сохранённая и одна активная тренировка,
3 программы, вес, custom exercise и 8 bytes IndexedDB media сохранены; JSON export и offline restore
успешны, незаконченный ввод оставался до явного restart. Future update проверен настоящей сменой
worker и нажатием баннера; synthetic CSS release не публиковался. Tools/import smoke также прошёл:
кнопка плана, понятное поле, скрытие неподходящих инструментов и приватный импорт офлайн сохранили
дневник и overrides. Во всех сценариях 0 внешних/API/write requests и page errors.
Проверка physical iPhone/Safari остаётся за владельцем: доступ к телефону отсутствует.

Первый выпуск опубликован из `8b6e8a0d62bab2f8c015e5d59264dc6f385818f9`;
Pages [39483545538](https://github.com/IF911/GYM/actions/runs/39483545538) завершился success.
Live tools/import smoke и публичный архив (7562 файла) проверены: текущий JS/SW совпадают,
личного плана, ссылки и кода в архиве нет. Дополнительный live check выявил неверный статус
ручной проверки в offline режиме. Исправление явно учитывает `navigator.onLine`, сохраняет
готовое обновление при ошибке и допускает повтор после восстановления сети. Новый регрессионный
тест и local mobile check ручной проверки/offline прошли; повторный upgrade через баннер сохранил
активную тренировку, дневник, media и незаконченный ввод, backup восстановлен офлайн.
Финальное offline-дополнение опубликовано из `13b6f710ad49f470f06699adeff65ae573cbf224`;
Pages [39484917065](https://github.com/IF911/GYM/actions/runs/39484917065) завершился success.
Live отдаёт ожидаемый `index-Bn2r--Au.js` и точный SW. Повторные live mobile checks прошли:
ручная проверка, первый claim без ложного баннера, понятный offline-статус, проверка после reconnect,
видимая кнопка плана, карточки упражнений и приватный импорт офлайн. Дневник и старые overrides
не изменились; 0 внешних/API/write requests и page errors. Все 7562 файла публичного архива
прочитаны, updater/UI/SW/LICENSE/NOTICE совпадают с source; личной ссылки и кода нет.
Обязательных незавершённых этапов нет. Физический iPhone/Safari не проверялся.
Откат offline-дополнения — revert `13b6f710`; полный откат updater — затем revert `8b6e8a0d`
и штатный Pages release. Опциональная проверка владельцем — получение обновления с домашней иконки.
Формат данных/backup не менялся; дневник не откатывается. Личные материалы остались вне Git,
новых credentials нет, признаков компрометации нет, ротация не требуется.

## Понятные инструменты нагрузки и видимый импорт: 2026-10-20

Воспроизведены оба исходных симптома в мобильном браузере: у упражнения `4209` (прыжок)
показаны блины и калькулятор максимума, в «План» нет видимой кнопки вставки ссылки — импорт
спрятан за иконкой share с доступным именем «Параметры плана».

Добавлена видимая кнопка импорта над переключателем видов плана. Форма объясняет вставку
на iPhone и называет поле «Ссылка на программу». Общая политика видимости инструментов
убирает их из неподходящих упражнений во всех связанных экранах, сохраняет нужные инструменты
для силовой работы и явный выбор тренажёра с блинами в настройках упражнения.
Калькулятор без истории не подставляет `20 × 5`. Русские подписи и пояснения уточнены.

| Поведение | Проверка |
|---|---|
| Импорт виден без меню в обоих видах, с пустым и заполненным планом | `Plan.link-import.test.jsx` |
| Категории/оборудование/режим, старые overrides и подходящая силовая работа | `exercise-tools.test.js` |
| Настоящая карточка прыжка/core/удержания, штанга, cable, настройки тренажёра | `sheets.exercise-tools.test.jsx` |
| Приватная расшифровка и preview не меняют дневник до подтверждения | `PlanLink.test.jsx`, browser smoke |

Локально пройдены 412 test files / 5109 tests, 11 upstream sync tests, locale check,
108000 fatigue comparisons и 1800 history comparisons. Local build успешен: 6554 stills,
6554 animations, source archive из 7558 файлов полностью прочитан, личного плана/ссылки/кода нет,
LICENSE/NOTICE сохранены. Мобильный browser smoke проверил кнопку без меню, поле вставки,
прыжок/core/удержание без лишних инструментов, историю прыжка без максимума, cable без блинов,
штангу с нужными инструментами и пустой калькулятор без истории. Личный импорт офлайн сохранил
старые программы, историю, расписание, вес, custom exercises и даже старые loadKind overrides.
Upgrade smoke принял новый SW: сохранены дневник, 3 программы, вес, custom exercise и 8 bytes
IndexedDB media, JSON экспорт и восстановление офлайн прошли. 0 внешних/API/write requests
и page errors. Новый «План» и форма проверены визуально при ширине 390 px; упражнение на
снимке замаскировано, лицензированные изображения не использовались как AI input.

Выпуск опубликован из `4b4497b369e9442e968463e08d476a03c6deb522`, push в `main` выполнен.
Pages [39478443105](https://github.com/IF911/GYM/actions/runs/39478443105) завершился `success`.
Публичный сайт отдаёт ожидаемый module `index-DgEwsoCY.js`. Live mobile smoke подтвердил
видимую кнопку, понятное поле вставки, скрытие инструментов у jump/core/hold и в истории прыжка,
cable без блинов, штангу с нужными инструментами, пустой калькулятор без истории и приватный
импорт офлайн с сохранением прежнего дневника/overrides. 0 внешних/API/write requests и page errors.
Все 7558 файлов публичного архива прочитаны; policy, sheets, Plan, PlanLink и RU copy совпадают
с опубликованным source, личных материалов в архиве нет. Обязательных незавершённых этапов нет.
Физический iPhone/Safari не проверялся.
Личные программы/коды не публикуются; схема дневника и формат backup не меняются.
Откат — revert функционального commit и обычная публикация Pages; записи дневника сохраняются.

## Личная ссылка и исправление языка: 2026-10-20

Симптом: уже установленная PWA показывает английские описания после публикации русского
каталога. Воспроизведено на старом состоянии `lang: en, langAuto: false`: boot сохранял `en`.
Перевод был в сборке; прежняя проверка en → ru вручную не проверяла этот путь.
Добавлена однократная локальная миграция отображения в русский и RU-only названия по умолчанию;
уже настроенные предпочтения названий сохраняются. Ошибки хранилища не останавливают boot,
маркер перехода записывается только после проверки сохранённого языка.
Новые пользователи также получают русский по умолчанию; последующий ручной выбор сохраняется.

Добавлен local-only маршрут личного плана по зашифрованному fragment и отдельному коду.
Вставка внутри установленного приложения позволяет не зависеть от перехода Safari → PWA.
Никаких личных планов, кодов или ссылок в source/build нет. Формат и ограничения описаны
в `LOCAL_PWA.md`; общая ссылка без кода не раскрывает содержимое, ссылка с кодом даёт доступ.

| Поведение | Проверка |
|---|---|
| Старое English состояние становится RU, записи сохранены, последующий выбор языка не сбрасывается | `useStore.local.test.js` |
| Unicode roundtrip, неверный код, tamper, ограничения, gzip bomb, неподдерживаемые API | `plan-link.test.js` |
| Очистка адреса, отказ без изменения дневника, preview и отмена pending decode | `PlanLink.test.jsx` |
| Личные ссылки и local overlay защищены от будущей автоматической замены | `upstream-sync.test.mjs` |

Локально пройдены 409 test files / 5095 tests, 11 upstream sync tests, locale check,
108000 fatigue comparisons и 1800 history comparisons. Финальная сборка содержит 6554 stills
и 6554 animations. В мобильном browser smoke старое English состояние автоматически стало RU;
description/steps проверены без ручного выбора языка, личный план добавлен офлайн по коду,
preview/неверный код/отмена не изменяли дневник, сохранены старые программы и история.
В upgrade smoke принят новый SW и сохранены 1 тренировка, 3 программы, вес, custom exercise,
8 bytes IndexedDB media; JSON export и восстановление офлайн прошли. Оба сценария: 0 внешних,
API или write requests, 0 page errors. Архив исходников проверен на отсутствие личного плана,
ссылки и кода; LICENSE/NOTICE сохранены. Форма проверена визуально при ширине 390 px.

Выпуск опубликован из `98887193780b65485e672ea3ae789210e053878d`, push в `main` выполнен.
Pages [39472897975](https://github.com/IF911/GYM/actions/runs/39472897975) и upstream compatibility
[39472897969](https://github.com/IF911/GYM/actions/runs/39472897969) завершились `success` на этом SHA.
Live mobile smoke повторил сценарий без ручной смены языка: RU description/steps, неверный код,
preview, офлайн-импорт 2 программ / 12 позиций с сохранением прежнего дневника, прямой переход,
очистка адреса и отмена. 0 внешних/API/write requests и page errors. HTTP 200 для оболочки,
manifest, LICENSE, NOTICE и source archive. Все 7554 файла публичного архива прочитаны,
новый codec/view/store совпадают с source, личного плана/ссылки/кода нет.
Обязательных незавершённых этапов нет. Физический iPhone/Safari не проверялся.
Личные материалы находятся вне Git. Откат — revert функционального commit и штатный Pages workflow;
язык после отката можно выбрать вручную. Схема данных не меняется, дневник не откатывается.

## Русская библиотека: обновление 2026-10-20

Все 5632 canonical упражнения получили русские названия, описания и 30709 шагов техники.
922 `variantOf` — рисунки тех же движений, они наследуют основной текст. ID, структура
дневника и формат резервных копий не менялись. Перевод выполнен субагентами Luna;
проверены полнота, числовые параметры и оборудование, отдельно разобраны 165 кандидатов
с ошибками перевода или противоречиями источника. В 92 случаях исходник остаётся
неоднозначным: в карточке есть конкретное примечание и, где нужно, указание сначала
уточнить вариант с тренером. Решения сохранены в `catalogue/ru-review.json`.
Это текстовая проверка; лицензированные изображения не использовались как AI input.

| Поведение | Проверка |
|---|---|
| RU name/description/instructions для каждого canonical ID | `ru-catalogue.test.js` |
| Сохранение инвентаря и устранение буквального «согните штангу» | `ru-catalogue.test.js`, отдельный content QA |
| Сохранение qualifiers и генерация name packs | `exercise-names.test.js`, catalogue `--check` |
| RU UI/names/instructions в установочном кэше | `sw-lazy.test.js`, изолированный browser smoke |
| Переключение en → ru без сети, описание и техника, reload | реальный SW в headless browser, IDs `7583` и `1000` |
| Добавление файла плана без замены дневника и расписания | `plan-share.test.js`, импорт через UI офлайн |

Личная программа и пояснения подготовлены отдельными локальными файлами вне repository.
В public source/archive нет персонального плана или профиля здоровья. Для добавления программы
использовать «План → Импортировать файл плана», а не импорт backup. На искусственном дневнике
подтверждено добавление 2 программ / 12 позиций с сохранением прежних программ, истории,
расписания, веса, custom exercises и языка. Диапазоны повторов проверены, включая 6–8 на сторону.

Русская библиотека опубликована из `6d70dd0bf3c0f060198eaede4f102483073e6356`.
Workflow **GYM local PWA** [39455957195](https://github.com/IF911/GYM/actions/runs/39455957195)
завершился `success`: build и deploy пройдены. На публичном сайте повторно проверены
переключение en → ru без сети, RU descriptions/steps для `7583` и `1000`, офлайн-reload;
0 внешних/API/write requests и 0 page errors. Публичный архив (7550 файлов) полностью
прочитан: RU JSON совпадает с source commit, LICENSE/NOTICE сохранены, личного плана нет.
Обязательных незавершённых этапов этого выпуска нет. Физический iPhone/Safari не проверялся.
Личная PDF-инструкция проверена рендером всех пяти страниц; она и JSON остались вне Git.

## Реализовано

| Поведение | Проверка |
|---|---|
| Пустой локальный дневник без demo seed, аккаунта и API | `useStore.local.test.js` |
| Сохранение и повторная загрузка дневника, восстановление JSON | `useStore.local.test.js` |
| API, pairing, upload и beacon заблокированы до отправки | `useStore.local.test.js` |
| Только статические same-origin GET/HEAD, без cookies/referrer | `local.test.js` |
| В настройках доступны backup/import, серверные функции скрыты | `Settings.local.test.jsx` |
| Офлайн-запуск с `/GYM/`, изоляция кэшей, MP4 Range для Safari | `sw-local.test.js` |
| Предпочтительный исходный код без данных пользователя | проверка состава и целостности готового архива |
| Обновления через GitHub Pages, каталог с того же origin | `local-pwa.yml`, `build:local` |
| Ежедневный sync, merge без force, конфликт и защита local overlay | `scripts/upstream-sync.test.mjs` |
| Точный проверенный SHA, защита от гонки main, один issue без спама | `scripts/upstream-sync.test.mjs` |
| Дневник, вес, custom exercise, media и JSON backup после обновления | `frontend/scripts/check-local-upgrade.mjs` |

Настройки, программы, записи тренировок и вес сохраняются в localStorage. Фото/видео
пользователя — в IndexedDB; для полного переноса с медиа нужен ZIP backup. JSON backup
не переносит сами фото/видео. Файлы экспорта не загружаются в Git или на сервер.
GitHub получает запросы статических ресурсов и IP, но не содержимое дневника.
`IF911/GYM` публичный; код, лицензии и материалы сайта доступны всем. Дневник в repository
не хранится. Приложение опубликовано: [if911.github.io/GYM](https://if911.github.io/GYM/).

## Проверки

- Полный frontend suite: 407 файлов, 5080 тестов успешно.
- Финальный targeted проход после текстовых правок: 83 теста (RU coverage/терминология и все name packs) успешно.
- Локали: 18 packs, 2258 ключей, синхронны.
- Fatigue probe: 108000 сравнений, максимальный рост 0; history-edit probe: 1800 сравнений, PASS.
- `npm run build:local`: успешно, 6554 stills и 6554 анимации, около 227 MiB суммарного размера файлов.
- Runtime npm audit (`--omit=dev`): 0 уязвимостей.
- Все workflow YAML проверены, включая отсутствие повторных ключей и guards для upstream jobs.
- Исходный архив проверен на состав и целостность перед push.
- Перед публичной публикацией повторно прошли 15 targeted проверок local API/store/settings/service
  worker и полная локальная сборка. Архив из 7543 исходных файлов полностью прочитан; `LICENSE`
  и `NOTICE.md` в сборке совпадают с файлами repository.
- Автоматический smoke в отдельном headless Chromium, viewport 390×844: создана Full Body программа,
  записан подход 60 кг × 8, тренировка сохранилась после reload; JSON скачан через UI;
  дневник очищен в изолированном тестовом контексте и полностью восстановлен из файла без сети.
  Восстановлены 1 тренировка и 3 программы; 0 внешних запросов, 0 page errors.
- Повторный smoke на опубликованном `https://if911.github.io/GYM/` прошёл тот же сценарий:
  сохранение 60 кг × 8, reload, скачивание JSON, офлайн-запуск и восстановление 1 тренировки
  и 3 программ; 0 внешних запросов, 0 page errors.
- На публичном сайте HTTP 200 для приложения, manifest, обоих media/root notices, LICENSE
  и `source.tar.gz`; manifest задаёт `GYM`, standalone, start/scope `./`.
- Для русского выпуска повторно пройдены 11 sync-тестов, catalogue validation/генератор,
  locales и оба fatigue/history probes. Архив из 7550 исходных файлов полностью прочитан;
  русский JSON совпадает с актуальным source, LICENSE/NOTICE сохранены, личных файлов в нём нет.
- Browser check перехода со старой сборки на русскую: новый SW принят через controllerchange;
  сохранены тренировка, 3 программы, вес, custom exercise и 8 bytes тестового IndexedDB media;
  JSON экспорт и восстановление офлайн успешны. Переключение en → ru и ранее не открытые
  RU descriptions/steps доступны офлайн. В трёх сценариях — 0 внешних/API/write requests и 0 page errors.

## Delivery

Автообновления настроены и проверены. Локально прошли 11 sync-тестов и browser smoke
для одинаковых сборок и для worker с изменившимся содержимым при неизменном URL.
Ежедневное расписание — 02:17 UTC / 05:17 Москва; workflow зарегистрирован `active`.
GitHub run [39445530036](https://github.com/IF911/GYM/actions/runs/39445530036)
на `806b47dc8b99f4a48de5956371389bfebf16672e` завершился успешно: prepare, полный frontend
suite, locales/fatigue, обе сборки, browser compatibility check и закрытие issue после проверки.
Новых коммитов upstream на момент настройки нет (`e348fc17`), поэтому promote корректно пропущен.
Push и dispatch точного SHA проверены fixture-тестами; реальная первая поставка нового upstream
ещё не происходила. Совместимость критических
изменений хранения, backup, local mode, workflow и лицензий автоматически не предполагается:
они останавливаются как конфликт защитных условий и создают один issue.

- Обязательные этапы реализации, тестирования, push, публикации и настройки автообновлений завершены.
- Текущий функциональный выпуск опубликован из `4b4497b369e9442e968463e08d476a03c6deb522` в `main`;
  история upstream сохранена. Отдельный documentation commit фиксирует результат публикации.
- GitHub Actions [run 39478443105](https://github.com/IF911/GYM/actions/runs/39478443105):
  build и deploy завершены `success`, включая полный frontend suite, locales и fatigue probe.
- Лицензия и уведомления сохранены; local build публикует собственные `LICENSE`, `NOTICE.md`
  и архив исходников. README обозначает некоммерческую производную версию и дату изменений.
- Public и Pages → Source: GitHub Actions включены владельцем; это подтверждено публичным
  GitHub API и успешным deployment. Вход GitHub CLI отменён; использован существующий SSH-доступ.
- Установка на iPhone: открыть сайт в Safari → Поделиться → На экран «Домой».
  Проверка на физическом iPhone остаётся за владельцем устройства; мобильный viewport
  в тестовом Chromium не подтверждает поведение Safari на устройстве.

## Откат

Чтобы остановить будущие автоматические обновления, выбрать Actions → GYM upstream sync →
Disable workflow. Уже опубликованный сайт и локальные данные продолжат работать.
Отменить конкретный проблемный commit через `git revert`, отправить новый commit в `main`
и дождаться workflow. Старый app cache удаляется только после успешной установки нового shell;
media cache переживает обновления. Данные дневника при обновлении не очищаются.
Для merge commit, созданного updater, использовать `git revert -m 1 <merge-SHA>`.
Перед изменением формата состояния сохранять JSON/ZIP backup. Удалённые данные Safari или
потерянный телефон восстанавливаются только из сделанной пользователем резервной копии.

## Необязательный backlog и ограничения

- Upstream dev/build dependencies: npm сообщает 7 уязвимостей (3 moderate, 3 high, 1 critical).
  В runtime dependencies их нет; автоматический массовый upgrade в этой задаче не выполнялся.
- Нет синхронизации между устройствами. Для переноса использовать backup.
- Нет фоновых push-уведомлений. Таймер в открытом приложении остаётся штатным.
- Хранилище браузера может быть очищено; запрос persistent storage не гарантирует разрешение.
- Сохранение backup в iCloud Drive или другой облачный сервис передаст файл выбранному сервису.
  Для полностью локальной копии выбрать «На моём iPhone» или свой компьютер.
- Другие сайты в том же origin GitHub Pages контролируются тем же владельцем; отдельный
  custom domain можно использовать для изоляции origin, если позже появится такая потребность.

Credentials не скомпрометированы, значения ключей/токенов не выводились и не сохранялись.
Ротация credentials не требуется. Использован существующий SSH-доступ к указанному владельцем repo.
