import { common } from './common'
import { shell } from './shell'
import { notifications } from './notifications'
import { home } from './home'
import { atrisk } from './atrisk'
import { analytics } from './analytics'
import { students } from './students'
import { invoices } from './invoices'
import { activity } from './activity'
import { money } from './money'
import { components } from './components'
import { auth } from './auth'
import { attendance } from './attendance'
import { homework } from './homework'
import { exams } from './exams'
import { enrol } from './enrol'
import { centre } from './centre'
import { portal } from './portal'
import { studentPortal } from './studentPortal'
import { grades } from './grades'
import { groups } from './groups'
import { schedule } from './schedule'
import { settings } from './settings'
import { paymentProofs } from './paymentProofs'
import { assistant } from './assistant'
import { feedback } from './feedback'
import { platformAdmin } from './platformAdmin'
import { errorLog } from './errorLog'
import { format } from './format'
import { mascot } from './mascot'

/**
 * قاموس العربية — اللغة الوحيدة حالياً (W7 — R-4/R-5).
 * كل namespace ملف مستقل باسم الميزة، والتجميع هنا `as const` حتى
 * تُشتق أنواع المفاتيح من القيم نفسها (لا مفاتيح وهمية وقت الترجمة).
 */
export const ar = {
  common,
  shell,
  notifications,
  home,
  atrisk,
  analytics,
  students,
  invoices,
  activity,
  money,
  components,
  auth,
  attendance,
  homework,
  exams,
  enrol,
  centre,
  portal,
  studentPortal,
  grades,
  groups,
  schedule,
  settings,
  paymentProofs,
  assistant,
  feedback,
  platformAdmin,
  errorLog,
  format,
  mascot,
} as const
