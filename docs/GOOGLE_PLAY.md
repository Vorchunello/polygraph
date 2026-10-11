# Публикация в Google Play

Что уже готово в репозитории и что нужно сделать руками в Play Console. Порядок важен: пункты 1–3 занимают время (проверка личности, 14 дней теста), начинать лучше сразу.

## Уже готово

- **Android 16 (API 36)** — Google Play с 31 августа 2026 принимает новые приложения и обновления только с этим уровнем (Capacitor 8).
- **App Bundle (.aab)** — каждый тег `vX.Y.Z` кладёт в релиз GitHub рядом с APK файл `Polygraph-X.Y.Z.aab`. Play принимает только AAB.
- **Подпись** — AAB подписан тем же ключом, что и APK (`polygraph-release.p12`).
- **Политика конфиденциальности** — [PRIVACY.md](../PRIVACY.md), ссылка для Play: `https://github.com/Vorchunello/polygraph/blob/main/PRIVACY.md`.
- **Тексты страницы** — `fastlane/metadata/android/<язык>/`: название (до 30 символов), короткое описание (до 80), полное, список изменений. Английский, русский, испанский, турецкий, арабский.
- **Жалоба на ответ ИИ** (⚑ у каждого ответа) — этого требует [правило Play о генеративном ИИ](https://support.google.com/googleplay/android-developer/answer/13985936). Нужно только подключить форму — пункт 4.

## 1. Аккаунт разработчика

1. [play.google.com/console/signup](https://play.google.com/console/signup) → **Личный аккаунт** (Personal).
2. Разовый взнос **$25**. Карту принимают не из всех стран; если платёж не проходит — это ограничение страны карты, а не ошибка.
3. Проверка личности по документу и подтверждение телефона и Android-устройства (через приложение Play Console). Обычно от нескольких часов до нескольких дней.
4. Имя разработчика и e-mail будут видны на странице приложения — заведи отдельный адрес, если не хочешь светить основной.

## 2. Создать приложение

Play Console → **Create app**: название `Polygraph`, язык по умолчанию — English (United States), **App**, **Free**. Галочки про правила и экспортные законы — прочитай и подтверди.

## 3. Закрытое тестирование — 12 человек на 14 дней

Для личных аккаунтов, созданных после 13 ноября 2023, выйти в открытый доступ можно только после закрытого теста: **не меньше 12 тестировщиков, 14 дней подряд**. Google проверяет, что приложением действительно пользовались.

1. **Test and release → Testing → Closed testing → Create track**.
2. **Testers**: список e-mail (Google-аккаунты) или Google Group. Друзья, одногруппники, люди из языковых чатов — им нужен Android и согласие по ссылке-приглашению.
3. **Create release** → загрузить `Polygraph-X.Y.Z.aab` из [релизов GitHub](https://github.com/Vorchunello/polygraph/releases).
4. Подпись приложения (Play App Signing) — см. пункт 6, решить **до первой загрузки**.
5. Разослать тестировщикам ссылку «Join on Android/Web». Отсчёт 14 дней идёт, пока 12+ человек остаются в тесте.
6. Через 14 дней: **Dashboard → Apply for production** — ответить на вопросы о тесте. Проверка — обычно до 7 дней.

## 4. Форма для жалоб на ответы ИИ

Play требует, чтобы жалоба отправлялась **не выходя из приложения**. Сервера у Polygraph нет, поэтому жалобы уходят в твою Google Форму (ответы — в таблицу).

1. [forms.google.com](https://forms.google.com) → новая форма «Polygraph — AI reports».
2. Шесть вопросов **в этом порядке**, тип «Текст» или «Абзац», без обязательных полей: *Where*, *Reason*, *Comment*, *AI answer*, *Model*, *App version*.
3. Настройки → **не** требовать входа в аккаунт, не собирать e-mail.
4. «Отправить» → ссылка → скопировать адрес вида `https://docs.google.com/forms/d/e/…/viewform`.
5. `node scripts/report-form.mjs <адрес>` — скрипт сам найдёт id полей и впишет их в `src/storage/report.ts`. (Или пришли адрес — подключу.)
6. Новый релиз — и кнопка ⚑ отправляет жалобы прямо в форму.

## 5. Страница в магазине (Grow → Store presence → Main store listing)

- **Тексты** — скопировать из `fastlane/metadata/android/en-US/`, переводы добавить через **Manage translations** (ru-RU, es-ES, tr-TR, ar).
- **Иконка** 512×512 PNG — `store/icon-512.png`.
- **Графика** 1024×500 и **скриншоты телефона** (минимум 2) — ещё не готовы, следующий шаг (`store/`).
- **Категория**: Education. **Контакты**: e-mail обязателен, сайт — `https://github.com/Vorchunello/polygraph`.

## 6. Подпись: Play App Signing

Play подписывает приложение своим ключом, а ты загружаешь сборки, подписанные «ключом загрузки». Есть важный выбор:

- **Рекомендую: отдать Play наш ключ** (*Use existing app signing key from Java keystore*). Тогда APK с GitHub и версия из Play подписаны одинаково, и пользователь может перейти с одной на другую без удаления приложения и потери данных. Play Console покажет команду с `pepk.jar`; для нашего ключа она выглядит так (пароль — из файла рядом с ключом):

  ```bash
  java -jar pepk.jar --keystore=C:\Users\Muhammed\.polygraph\polygraph-release.p12 --alias=polygraph --output=polygraph-signing.zip --include-cert --rsa-aes-encryption --encryption-key-path=encryption_public_key.pem
  ```

  Получившийся zip загрузить в Play Console. Ключ загрузки — тот же `polygraph-release.p12` (менять в CI ничего не нужно).
- Если позволить Google создать новый ключ — версии из Play и с GitHub станут несовместимы: поверх друг друга не обновятся.

Выбор делается один раз и навсегда — до первой загрузки AAB.

## 7. Раздел «App content» (Policy → App content)

| Пункт | Ответ |
| --- | --- |
| Privacy policy | `https://github.com/Vorchunello/polygraph/blob/main/PRIVACY.md` |
| Ads | No ads |
| App access | All functionality is available without special access (аккаунта нет; ИИ работает бесплатно без ключа) |
| Content rating | Анкета IARC, категория *Reference, News, or Educational*. Насилия, азартных игр и т.п. нет. Пользователи не общаются друг с другом. Генерация текста ИИ есть — отвечать честно |
| Target audience | 13+ (не «для детей» — иначе попадём под правила Families) |
| News app | No |
| Data safety | См. ниже |
| Foreground service | Тип *Special use*: «Floating vocabulary strip shown over other apps while the user watches videos or plays games; started and stopped by the user, with a visible notification». Play попросит видео — запись экрана: включить полоску в разделе «Фон», показать её поверх видео, выключить. Ссылка на видео — YouTube (можно «по ссылке») |
| Government / Financial / Health | No |

### Data safety

Ничего не собирается для рекламы или аналитики, но тексты уходят ИИ-провайдеру и переводчику, когда пользователь пользуется этими функциями. Честные ответы:

- **Does your app collect or share any of the required user data types?** — Yes.
- **Is all of the user data encrypted in transit?** — Yes (HTTPS; исключение — локальный LM Studio/Ollama в домашней сети по выбору пользователя, это не «сбор» разработчиком).
- **Do you provide a way for users to request that their data is deleted?** — Data is not stored by the developer: все данные лежат на устройстве, удаляются вместе с приложением или папкой.
- **Data types** → *App activity → Other user-generated content*: **Collected** and **Shared** (AI and translation providers), **processed ephemerally — No** (мы не контролируем провайдеров), **required — No** (функции можно не использовать), purpose — **App functionality**.
- *App info and performance → Other* (жалобы на ИИ с версией приложения): **Collected**, optional, purpose — **App functionality**.
- Местоположение, контакты, фото, аудио, идентификаторы устройства — **не собираются** (микрофон и фото обрабатываются на устройстве).

## 8. Обновления

Каждый тег `vX.Y.Z` → релиз на GitHub с `.aab` → в Play Console **Create release** на нужной дорожке, загрузить AAB, вставить текст из `fastlane/metadata/android/<язык>/changelogs/<versionCode>.txt`. `versionCode` считается из версии: `X·10000 + Y·100 + Z + 1` (0.6.0 → 601), поэтому он всегда растёт.

Позже загрузку можно автоматизировать (сервисный аккаунт Google Cloud + GitHub Action), но первую публикацию Play требует сделать руками.
