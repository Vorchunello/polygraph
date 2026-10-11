# Polygraph — Privacy Policy

*Last updated: 11 October 2026. Русская версия — ниже.*

Polygraph is a free, open-source language-learning app for Windows, Linux and Android ([source code](https://github.com/Vorchunello/polygraph)). It has no accounts, no advertising, no analytics and no tracking. The developers run no server that receives your data.

## Data that stays on your device

- **Your learning data** — profile (languages, levels, goal), words, notes, books, playlists and progress — is stored as Markdown files in a folder on your device (on Android: `Documents/Polygraph` or the app's private storage). You can open, copy or delete it at any time.
- **Settings and API keys** you enter for AI or translation services are stored only on the device and never written to the data folder.
- **Microphone** (pronunciation practice): audio is recorded only while you press the button and is recognised on the device. It is never uploaded.
- **Camera, photos and screenshots** (text recognition): images are processed on the device and never uploaded.
- **Offline dictionaries** are stored on the device.

## Data that leaves your device — only when you use a feature that needs it

| Feature | What is sent | Where |
| --- | --- | --- |
| AI features (word drafts, explanations, stories, translation of book pages, picking words from a text, notes) | The text of the request: the words or text you are working on, your languages, levels and learning goal | The AI provider selected in Settings → AI. By default Pollinations (text.pollinations.ai); alternatively OpenRouter, Groq, OpenAI, DeepSeek, Google Gemini, Anthropic, or a model on your own computer (LM Studio, Ollama) |
| Translation without AI | The word or text to translate (and an e-mail address only if you enter one for MyMemory) | The translator selected in Settings → Translator: MyMemory (default), DeepL or a LibreTranslate server you specify |
| Wiktionary lookups | The word you look up | en.wiktionary.org |
| Web articles in the reader | The address you enter | That website |
| Downloads | Nothing about you — only the file request | github.com (offline dictionaries), cdn.jsdelivr.net and huggingface.co (speech-recognition and text-recognition models) |
| Reporting an AI answer | Your comment, the reported answer (if you choose to attach it), the AI provider and model name, the app version and platform | The Polygraph developers (a Google Form), or a pre-filled GitHub issue that you submit yourself |

These services process your requests under their own privacy policies. Polygraph does not send them any identifier of you or your device. If you want nothing to leave your device, use a local AI model (LM Studio or Ollama) and offline dictionaries.

## Android permissions

- **Internet** — for the features above.
- **Display over other apps** and **foreground service** — only for the optional background word strip (ADHD mode), started and stopped by you.
- **Microphone** — only for pronunciation practice.
- **Storage** (Android 9 and older only) — to keep your data folder in Documents.

## Children

Polygraph is not directed at children under 13 and does not knowingly collect any personal data from anyone.

## Changes and contact

Changes to this policy are published in this file, with the history visible on GitHub. Questions: open an issue at https://github.com/Vorchunello/polygraph/issues.

---

# Polygraph — Политика конфиденциальности

*Обновлено 11 октября 2026.*

Polygraph — бесплатное приложение с открытым кодом для изучения языков (Windows, Linux, Android). В нём нет аккаунтов, рекламы, аналитики и слежки. У разработчиков нет сервера, на который уходили бы твои данные.

**Остаётся на устройстве:** профиль, слова, заметки, книги, прогресс (md-файлы в папке на устройстве); настройки и API-ключи; запись с микрофона (распознаётся на устройстве и никуда не отправляется); фото и снимки экрана для распознавания текста; офлайн-словари.

**Уходит с устройства — только когда ты пользуешься функцией, которой это нужно:**

- **ИИ-функции** — текст запроса (слова и тексты, с которыми работаешь, языки, уровни, цель) уходит выбранному в настройках ИИ-провайдеру: по умолчанию Pollinations, либо OpenRouter, Groq, OpenAI, DeepSeek, Google Gemini, Anthropic, либо локальная модель на твоём компьютере.
- **Перевод без ИИ** — слово или текст уходит выбранному переводчику (MyMemory, DeepL или твой сервер LibreTranslate).
- **Викисловарь** — искомое слово уходит на en.wiktionary.org; **статьи по ссылке** — адрес уходит на сайт статьи.
- **Загрузки** (словари, модели распознавания речи и текста) — с github.com, cdn.jsdelivr.net и huggingface.co; о тебе ничего не передаётся.
- **Жалоба на ответ ИИ** — комментарий, ответ (если приложишь), название провайдера и модели, версия приложения — разработчикам Polygraph (Google Форма) или в виде заполненного issue на GitHub, которое ты отправляешь сам.

Эти сервисы обрабатывают запросы по своим правилам; Polygraph не передаёт им идентификаторов тебя или устройства. Чтобы ничего не уходило с устройства, используй локальную модель (LM Studio, Ollama) и офлайн-словари.

**Разрешения Android:** интернет; показ поверх других приложений и фоновый сервис — только для полоски слов (режим СДВГ), которую ты сам включаешь и выключаешь; микрофон — только для тренировки произношения; память — только на Android 9 и старше.

Приложение не предназначено для детей младше 13 лет. Вопросы — https://github.com/Vorchunello/polygraph/issues.
