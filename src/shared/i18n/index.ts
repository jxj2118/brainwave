import { en, type Dictionary } from "./en";
import { zhCN } from "./zh-CN";
import type { Locale } from "../../platform/contracts";
export function dictionary(locale: Locale): Dictionary {
  return locale === "zh-CN" ? zhCN : en;
}
