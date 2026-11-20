/**
 * أنواع المجال الأساسية — مشتقة من نموذج البيانات في المواصفات (§2)
 * ومن تصميم قاعدة البيانات (DATABASE-DESIGN.md). ستُستبدل/تُستكمل بأنواع
 * مولّدة من Supabase (`supabase gen types`) عند ربط المشروع فعلياً.
 */

export type BillingType =
  | 'monthly_fixed'
  | 'per_session_prepaid'
  | 'per_session_attended'
  | 'weekly_package'

export type AttendanceStatus = 'p' | 'a' | 'l' | 'm'

export type UserRole = 'teacher' | 'assistant'

export interface Teacher {
  id: string
  name: string
  phone?: string
  avatarUrl?: string
}

export interface Group {
  id: string
  teacherId: string
  name: string
  billing: BillingType
  price: number
  days: number[] // 0 = الأحد ... 6 = السبت
  time: string // "HH:MM"
  duration: number // بالدقائق
  room?: string
  cap?: number
  assistant?: string
  links: string[]
}

export interface Enrollment {
  groupId: string
  price: number | null // سعر خاص للطالب، null = سعر المجموعة
  prepaid: number | null
}

export interface Student {
  id: string
  teacherId: string
  code: string // كود عشوائي غير تسلسلي في النسخة الجديدة
  name: string
  grade?: string
  school?: string
  phone?: string
  guardian?: string
  guardianPhone?: string
  level?: string
  paused: boolean
  enrollments: Enrollment[]
}

export interface InvoiceLine {
  desc: string
  amount: number
}

export interface Invoice {
  id: string
  teacherId: string
  studentId: string
  groupId: string
  period: string // YYYY-MM
  lines: InvoiceLine[]
}

export interface Payment {
  id: string
  teacherId: string
  invoiceId: string
  amount: number // سالب = دفعة عكسية (تصحيح)
  method: string
  date: string // YYYY-MM-DD
  receiptNo: number
}
