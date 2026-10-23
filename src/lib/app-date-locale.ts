import type { Locale as DateFnsLocale } from "date-fns"
import { zhCN as dateFnsZhCN, zhTW as dateFnsZhTW } from "date-fns/locale"
import { zhCN as dayPickerZhCN, zhTW as dayPickerZhTW } from "react-day-picker/locale"
import type { AppLanguage } from "@/lib/language"
import { useLanguage } from "@/hooks/use-language"

const DATE_FNS_LOCALE: Record<AppLanguage, DateFnsLocale> = {
  "zh-CN": dateFnsZhCN,
  "zh-TW": dateFnsZhTW,
}

const DAY_PICKER_LOCALE: Record<AppLanguage, typeof dayPickerZhCN> = {
  "zh-CN": dayPickerZhCN,
  "zh-TW": dayPickerZhTW,
}

export function dateFnsLocaleForAppLanguage(language: AppLanguage): DateFnsLocale {
  return DATE_FNS_LOCALE[language]
}

export function dayPickerLocaleForAppLanguage(language: AppLanguage) {
  return DAY_PICKER_LOCALE[language]
}

export function useAppDateLocales() {
  const { language } = useLanguage()
  return {
    language,
    dateFns: dateFnsLocaleForAppLanguage(language),
    dayPicker: dayPickerLocaleForAppLanguage(language),
  }
}
