import { common } from './common'
import { shell } from './shell'

/**
 * قاموس العربية — اللغة الوحيدة حالياً (W7 — R-4/R-5).
 * كل namespace ملف مستقل باسم الميزة، والتجميع هنا `as const` حتى
 * تُشتق أنواع المفاتيح من القيم نفسها (لا مفاتيح وهمية وقت الترجمة).
 */
export const ar = {
  common,
  shell,
} as const
