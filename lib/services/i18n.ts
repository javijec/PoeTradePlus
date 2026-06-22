import { writable } from "svelte/store"
import { englishTranslations } from "./i18n/en"
import { spanishTranslations } from "./i18n/es"
import { portugueseTranslations } from "./i18n/pt"
import { germanTranslations } from "./i18n/de"
import { frenchTranslations } from "./i18n/fr"
import { russianTranslations } from "./i18n/ru"
import { thaiTranslations } from "./i18n/th"
import { japaneseTranslations } from "./i18n/ja"
import { koreanTranslations } from "./i18n/ko"
import type { TranslationParams, TranslationValue } from "./i18n/types"

export type AppLanguage =
  | "en"
  | "es"
  | "pt"
  | "ru"
  | "th"
  | "de"
  | "fr"
  | "ja"
  | "ko"

const translations = {
  en: englishTranslations,
  es: spanishTranslations
} as Record<"en" | "es", Record<string, TranslationValue>>

const englishFallback = englishTranslations

const extendedTranslations: Record<
  AppLanguage,
  Record<string, TranslationValue>
> = {
  ...translations,
  pt: { ...englishFallback, ...portugueseTranslations },
  ru: { ...englishFallback, ...russianTranslations },
  th: { ...englishFallback, ...thaiTranslations },
  de: { ...englishFallback, ...germanTranslations },
  fr: { ...englishFallback, ...frenchTranslations },
  ja: { ...englishFallback, ...japaneseTranslations },
  ko: { ...englishFallback, ...koreanTranslations }
}

export const languageStore = writable<AppLanguage>("en")

export const setLanguage = (language: AppLanguage) => {
  languageStore.set(language)
}

export const translate = (
  language: AppLanguage,
  key: string,
  params?: TranslationParams
) => {
  const dictionary = extendedTranslations[language] || extendedTranslations.en
  const fallback = extendedTranslations.en[key]
  const value = dictionary[key] ?? fallback ?? key

  if (typeof value === "function") {
    return value(params ?? {})
  }

  return value
}
