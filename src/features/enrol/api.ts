import { supabase } from '../../lib/supabase'
import { brandLogoUrl, isValidAccent } from '../../lib/brand'
import type { EnrolmentLinkRow } from '../../types/database'
import { generateRawToken, sha256Hex } from '../portal/api'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ===========================================================================
// صفحة الحجز/التسجيل العامة — Phase 5 خطوة 2 (migration ‏0019).
//
// رابط عام واحد لكل سنتر (/book?t=<rawToken>) يملأه ولي الأمر: اسم
// الطالب، موبايله، المجموعة المطلوبة، حصة تجريبية اختيارية، ملاحظات.
// الطلبات تهبط في group_waitlist بمصدر 'booking_page' وتظهر في واجهة
// مجموعة الطلب بقبول/حذف كسائر طلبات الانتظار.
//
// نموذج الرابط: جدول enrolment_links يخزن SHA-256 hash فقط (نمط جداول
// توكنات البوابات/الامتحانات)، صف واحد لكل سنتر، بلا انتهاء زمني —
// التحكم بمفتاح التفعيل وبالتجديد الذي يستبدل الهاش فيبطل القديم فوراً.
// الرمز الخام يظهر للمدرس عند التوليد/التجديد فقط ولا يُحفظ في العميل.
//
// جهة العامة (بلا جلسة — anon key + دالتا RPC فقط):
// enrolment_page_by_token تعيد الهوية البيضاء والمجموعات النشطة فقط
// (لا أسعار، لا أي بيانات طلاب)، وenrolment_submit_by_token تتحقق
// خادمياً من كل شيء (صيغة الموبايل المصري، المجموعة، حدود المعدل،
// honeypot) — لا وصول مباشر لأي جدول من anon إطلاقاً.
// ===========================================================================

const LINK_COLS = 'teacher_id, enabled, last_used_at, created_at, updated_at'

/** رابط الحجز العام: /book?t=<rawToken> — السنتر يُعرَف بالتوكن وحده */
export function buildEnrolLink(origin: string, rawToken: string): string {
  return `${origin}/book?t=${encodeURIComponent(rawToken)}`
}

// ---------------------------------------------------------------------------
// جهة المدرس (جلسة مصادقة — سياسة المالك فقط على enrolment_links)
// ---------------------------------------------------------------------------

/** حالة رابط حجز السنتر الحالي (بلا الهاش) — null إن لم يُولَّد بعد */
export async function fetchEnrolmentLink(teacherId: string): Promise<EnrolmentLinkRow | null> {
  const { data, error } = await db()
    .from('enrolment_links')
    .select(LINK_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as EnrolmentLinkRow | null) ?? null
}

/**
 * توليد رابط الحجز أو تجديده: رمز عشوائي جديد في العميل → هاشه فقط
 * يُخزَّن (upsert على صف السنتر)، فأي رابط قديم يبطل في اللحظة نفسها.
 * يعيد الرابط الكامل بالرمز الخام — يُعرض للمدرس الآن ولا يُحفظ.
 */
export async function generateEnrolmentLink(teacherId: string): Promise<string> {
  const rawToken = generateRawToken()
  const tokenHash = await sha256Hex(rawToken)
  const { error } = await db()
    .from('enrolment_links')
    .upsert(
      {
        teacher_id: teacherId,
        token_hash: tokenHash,
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error
  return buildEnrolLink(window.location.origin, rawToken)
}

/** تفعيل/تعطيل صفحة الحجز (الرابط نفسه يبقى صالحاً عند إعادة التفعيل) */
export async function setEnrolmentEnabled(teacherId: string, enabled: boolean): Promise<void> {
  const { error } = await db()
    .from('enrolment_links')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
  if (error) throw error
}

/** رسالة مشاركة الرابط على واتساب (اختيار الرقم من واتساب نفسه) */
export function enrolShareWaUrl(link: string, centreName: string | null): string {
  const name = centreName?.trim() ? ` في ${centreName.trim()}` : ''
  const msg = `احجز مكانك${name} من صفحة الحجز دي: ${link} — املأ البيانات وهنأكد معاك الحجز.`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// جهة العامة (بلا جلسة — anon key + RPC مقيدة الحقول فقط)
// ---------------------------------------------------------------------------

export interface EnrolBrand {
  name: string | null
  logo_url: string | null
  accent: string | null
}

export interface EnrolGroupOption {
  id: string
  name: string
  days: number[]
  start_time: string
  duration_minutes: number
}

export interface EnrolPageData {
  brand: EnrolBrand
  groups: EnrolGroupOption[]
}

/** بيانات الصفحة العامة بالرمز الخام — الهوية والمجموعات النشطة فقط */
export async function fetchEnrolPage(rawToken: string): Promise<EnrolPageData> {
  const { data, error } = await db().rpc('enrolment_page_by_token', { p_token: rawToken })
  if (error) throw error
  if (!data) throw new Error('invalid or disabled link')
  const raw = data as unknown as {
    brand?: {
      name?: string | null
      teacher_name?: string | null
      logo_path?: string | null
      accent?: string | null
    } | null
    groups?: {
      id: string
      name: string
      days: number[]
      start_time: string
      duration_minutes: number
    }[]
  }
  return {
    brand: {
      name: raw.brand?.name?.trim() || raw.brand?.teacher_name?.trim() || null,
      logo_url: brandLogoUrl(raw.brand?.logo_path),
      accent: isValidAccent(raw.brand?.accent) ? raw.brand.accent.toLowerCase() : null,
    },
    groups: (raw.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      days: (g.days ?? []).map((d) => Number(d)),
      start_time: g.start_time,
      duration_minutes: Number(g.duration_minutes) || 0,
    })),
  }
}

export interface BookingInput {
  studentName: string
  guardianPhone: string
  groupId: string
  wantsTrial: boolean
  note: string | null
  /** حقل honeypot الخفي — يبقى فارغاً من البشر دائماً */
  honeypot: string
}

/** صيغة الموبايل المصري — نفس قاعدة الخادم (0019) للتحقق الفوري في النموذج */
export const EG_MOBILE_RE = /^01[0125][0-9]{8}$/

export function normalizeEgPhone(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

/** إرسال طلب حجز عبر الـ RPC — التحقق الخادمي هو الحاكم النهائي */
export async function submitBooking(rawToken: string, input: BookingInput): Promise<void> {
  const { error } = await db().rpc('enrolment_submit_by_token', {
    p_token: rawToken,
    p_student_name: input.studentName,
    p_guardian_phone: input.guardianPhone,
    p_group_id: input.groupId,
    p_wants_trial: input.wantsTrial,
    p_note: input.note,
    p_honeypot: input.honeypot,
  })
  if (error) throw error
}

/** رسالة مهذبة لولي الأمر من خطأ الـ RPC — بلا أي تفاصيل داخلية */
export function enrolErrorInfo(error: unknown): { title: string; hint: string } {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or disabled')) {
    return {
      title: 'الحجز متوقف حالياً',
      hint: 'رابط الحجز ده غير صالح أو السنتر موقّف الحجز مؤقتاً. تواصل مع السنتر مباشرة وهيحجزولك.',
    }
  }
  if (msg.includes('too many requests')) {
    return {
      title: 'طلبات كتير في وقت قصير',
      hint: 'وصلنا طلبات كتير من الرقم ده. استنى شوية وحاول تاني، أو تواصل مع السنتر مباشرة.',
    }
  }
  if (msg.includes('invalid phone')) {
    return {
      title: 'رقم الموبايل غير صحيح',
      hint: 'اكتب رقم موبايل مصري صحيح من 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015.',
    }
  }
  if (msg.includes('invalid group')) {
    return {
      title: 'المجموعة لم تعد متاحة',
      hint: 'المجموعة اللي اخترتها اتقفل حجزها. حدّث الصفحة واختر مجموعة تانية.',
    }
  }
  if (msg.includes('invalid name') || msg.includes('invalid note')) {
    return {
      title: 'فيه بيانات ناقصة',
      hint: 'راجع الاسم والملاحظات وحاول تاني.',
    }
  }
  return {
    title: 'حصلت مشكلة',
    hint: 'ماقدرناش نكمل الطلب دلوقتي. اتأكد من النت وحاول تاني بعد شوية.',
  }
}
