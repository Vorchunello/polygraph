# Translating the interface

The interface strings live in `src/i18n/`. `en.ts` is the source of truth; every other locale must contain the same keys — TypeScript refuses to build if one is missing.

To add a language, for example Turkish:

1. Copy `src/i18n/ru.ts` to `src/i18n/tr.ts` and rename the export to `tr`.
2. Translate the values. Keep `{placeholders}` as they are.
3. Register it in `src/i18n/index.ts`:

   ```ts
   import { tr } from "./tr";
   export const LOCALES: Record<string, Messages> = { en, ru, tr };
   ```

4. Run `npm run build` to check that nothing is missing, then open a pull request.

Language names (in the language pickers and tables) come from the platform's `Intl.DisplayNames`, so they are already localized for almost every language.

Wanted first: Spanish, Turkish, Arabic, Chinese, Hindi, French, Portuguese, German, Japanese, Korean, Italian, Indonesian, Bengali.
