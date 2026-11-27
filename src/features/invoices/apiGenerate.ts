// ===========================================================================
// الفواتير — الإصدار: حساب البند الأساسي بحسب نظام فوترة المجموعة وتوليد
// فواتير الشهر جماعياً بلا تكرار. (فُصل من api.ts — برنامج الكود النظيف
// 2026-11-27، نمط COD-2)
// ===========================================================================

import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { friendlyDbError } from '../../lib/supabaseErrors'
import type { GroupRow } from '../../types/database'
import { monthEndStr, monthStartStr, todayStr } from '../home/api'
import { ensureSessionsGenerated, periodLabel } from '../schedule/api'
import { fetchGroups } from '../groups/api'
import { logActivity } from '../activity/api'
import { periodYm } from './apiHelpers'

// ---------------------------------------------------------------------------
// إصدار الفواتير — المرجع §5.1 + جدول الأنظمة §2.3.
// لا توجد دالة توليد فواتير في المخطط، فالتوليد هنا على العميل فوق جداول
// المخطط، ومنع التكرار مضمون بقيد المخطط الفريد
// (teacher_id, student_id, group_id, period_month) + فحص مسبق + تجاهل 23505،
// فإعادة التشغيل لنفس الشهر آمنة تماماً (idempotent).
// ---------------------------------------------------------------------------

export interface IssueOptions {
  /** أول يوم في الشهر المطلوب 'YYYY-MM-01' */
  periodMonth: string
  /** خصم عام اختياري لكل فاتورة (ج) — يُقصّ عند قيمة البند الأساسي */
  discount: number
  discountNote: string | null
  /** عند التوليد من ملف طالب: يقتصر على هذا الطالب */
  studentId?: string
}

export interface IssueResult {
  created: number
  skipped: number
  total: number
}

/** عدد أيام الشهر المطابقة لأيام جدول المجموعة (بديل عند غياب صفوف الحصص) */
export function calendarSessionsInMonth(group: Pick<GroupRow, 'days'>, periodMonth: string): number {
  const [y, m] = periodMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (group.days.includes(new Date(y, m - 1, d).getDay())) count += 1
  }
  return count
}

export interface BaseChargeInput {
  billingType: GroupRow['billing_type']
  /** السعر الفعّال: السعر الخاص في التسجيل وإلا سعر المجموعة (المرجع §5.1) */
  price: number
  /** صيغة الفترة 'YYYY-MM' — تدخل في نصوص البنود */
  ym: string
  /** كمية «مدفوعة مسبقاً» بعد حلّها (تسجيل ← حصص الشهر ← بديل تقويمي) */
  prepaidQty: number
  /** عدد مرات الحضور الفعلي (p/l/m) — لنظام per_session_attended */
  attendedCount: number
}

export interface BaseCharge {
  amount: number
  desc: string
}

/**
 * البند الأساسي لفاتورة (طالب × مجموعة × شهر) بحسب نظام فوترة المجموعة —
 * جدول الأنظمة §2.3. دالة نقية مستخرجة حرفياً من generateInvoices (موجة
 * W2) حتى تُختبَر الأنظمة الأربعة بلا قاعدة بيانات؛ المدخلات المحسوبة من
 * الجداول (الكمية/الحضور) تُمرَّر جاهزة.
 */
export function baseChargeFor(input: BaseChargeInput): BaseCharge {
  const { price, ym } = input
  switch (input.billingType) {
    case 'monthly_fixed':
      return { amount: price, desc: t('invoices.apiChargeMonthly', { ym }) }
    case 'weekly_package':
      return { amount: 4 * price, desc: t('invoices.apiChargeWeekly', { ym }) }
    case 'per_session_prepaid':
      return {
        amount: input.prepaidQty * price,
        desc: t('invoices.apiChargePrepaid', { qty: input.prepaidQty }),
      }
    case 'per_session_attended':
      return {
        amount: input.attendedCount * price,
        desc: t('invoices.apiChargeAttended', { count: input.attendedCount }),
      }
  }
}

/** مبلغ الخصم الفعلي: لا يتجاوز قيمة البند الأساسي أبداً ولا ينزل تحت صفر */
export function clampedDiscount(discount: number, baseAmount: number): number {
  return Math.min(discount, Math.max(baseAmount, 0))
}

export async function generateInvoices(
  teacherId: string,
  opts: IssueOptions,
): Promise<IssueResult> {
  const period = monthStartStr(opts.periodMonth)
  const periodEnd = monthEndStr(period)
  const ym = periodYm(period)
  const today = todayStr()
  const supa = db()

  const groups = await fetchGroups(teacherId)
  const groupById = new Map(groups.map((g) => [g.id, g]))

  // نضمن حصص الشهر مولّدة (لازمة لعدّ حصص «مدفوعة مسبقاً» و«حسب الحضور»)؛
  // فشل التوليد لا يوقف الإصدار — نكمل بما في الجداول مع بديل تقويمي للباقات.
  try {
    await ensureSessionsGenerated(teacherId, groups, [period])
  } catch {
    // نتابع: العدّادات أدناه لها بدائل آمنة
  }

  // التسجيلات الفعّالة: طالب غير موقوف ومسجل في المجموعة (studentsOf في المرجع)
  let enrQuery = supa
    .from('enrollments')
    .select(
      'student_id, group_id, price_override, prepaid_sessions, students!inner(paused)',
    )
    .eq('teacher_id', teacherId)
    .eq('students.paused', false)
  if (opts.studentId) enrQuery = enrQuery.eq('student_id', opts.studentId)
  const { data: enrData, error: enrErr } = await enrQuery
  if (enrErr) throw enrErr
  const enrollments = enrData ?? []

  // الفحص المسبق لمنع التكرار: فواتير الفترة القائمة
  const { data: existing, error: exErr } = await supa
    .from('invoices')
    .select('student_id, group_id')
    .eq('teacher_id', teacherId)
    .eq('period_month', period)
  if (exErr) throw exErr
  const existingKeys = new Set(
    ((existing ?? []) as { student_id: string; group_id: string }[]).map(
      (r) => `${r.student_id}|${r.group_id}`,
    ),
  )

  // عدّاد الحضور الفعلي (p/l/m) لحصص الشهر حتى اليوم — لنظام per_session_attended
  const attendedCount = new Map<string, number>()
  if (enrollments.some((e) => groupById.get(e.group_id)?.billing_type === 'per_session_attended')) {
    const upper = periodEnd < today ? periodEnd : today
    if (upper >= period) {
      const { data, error } = await supa
        .from('attendance')
        .select('student_id, sessions!inner(group_id, session_date)')
        .eq('teacher_id', teacherId)
        .in('status', ['p', 'l', 'm'])
        .gte('sessions.session_date', period)
        .lte('sessions.session_date', upper)
      if (error) throw error
      for (const row of data ?? []) {
        const key = `${row.student_id}|${row.sessions.group_id}`
        attendedCount.set(key, (attendedCount.get(key) ?? 0) + 1)
      }
    }
  }

  // عدّاد حصص الشهر المجدولة لكل مجموعة — لنظام per_session_prepaid عند غياب
  // prepaid_sessions على التسجيل (qty = عدد حصص الشهر في المرجع §2.3)
  const monthSessionCount = new Map<string, number>()
  const prepaidGroupIds = [
    ...new Set(
      enrollments
        .filter(
          (e) =>
            groupById.get(e.group_id)?.billing_type === 'per_session_prepaid' &&
            e.prepaid_sessions == null,
        )
        .map((e) => e.group_id),
    ),
  ]
  if (prepaidGroupIds.length > 0) {
    const { data, error } = await supa
      .from('sessions')
      .select('group_id')
      .eq('teacher_id', teacherId)
      .in('group_id', prepaidGroupIds)
      .gte('session_date', period)
      .lte('session_date', periodEnd)
      .eq('status', 'scheduled')
    if (error) throw error
    for (const row of (data ?? []) as { group_id: string }[]) {
      monthSessionCount.set(row.group_id, (monthSessionCount.get(row.group_id) ?? 0) + 1)
    }
  }

  let skipped = 0

  // بناء كل الفواتير وبنودها محلياً أولاً — لا أي طلب شبكة داخل الحلقة
  // (أداء 3A-296: كان الإصدار يرسل طلبين لكل تسجيل: فاتورة ثم بنودها).
  interface PlannedLine {
    line_type: 'base' | 'discount'
    description: string
    amount: number
    reason: string | null
  }
  interface PlannedInvoice {
    studentId: string
    groupId: string
    lines: PlannedLine[]
  }
  const planned: PlannedInvoice[] = []

  for (const e of enrollments) {
    const group = groupById.get(e.group_id)
    if (!group) continue
    const key = `${e.student_id}|${e.group_id}`
    if (existingKeys.has(key)) {
      skipped += 1
      continue
    }

    // السعر الفعّال: السعر الخاص في التسجيل وإلا سعر المجموعة (المرجع §5.1)
    const price = e.price_override ?? group.price
    // كمية «مدفوعة مسبقاً»: من التسجيل، وإلا عدد حصص الشهر المجدولة،
    // وإلا البديل التقويمي — بنفس ترتيب الحلّ الأصلي حرفياً
    const prepaidQty =
      e.prepaid_sessions ??
      (monthSessionCount.get(e.group_id) || calendarSessionsInMonth(group, period))
    const { amount: baseAmount, desc: baseDesc } = baseChargeFor({
      billingType: group.billing_type,
      price,
      ym,
      prepaidQty,
      attendedCount: attendedCount.get(key) ?? 0,
    })

    const lines: PlannedLine[] = [
      { line_type: 'base', description: baseDesc, amount: baseAmount, reason: null },
    ]
    // الخصم العام (المرجع §5.1): بند سالب لا يتجاوز قيمة البند الأساسي أبداً
    if (opts.discount > 0) {
      const discAmt = clampedDiscount(opts.discount, baseAmount)
      if (discAmt > 0) {
        lines.push({
          line_type: 'discount',
          description: t('invoices.apiDiscountDesc', { note: opts.discountNote?.trim() ? opts.discountNote.trim() : t('invoices.apiDiscountFallback') }),
          amount: -discAmt,
          reason: opts.discountNote?.trim() ? opts.discountNote.trim() : null,
        })
      }
    }
    planned.push({ studentId: e.student_id, groupId: e.group_id, lines })
  }

  // الإدراج الجماعي: طلب واحد للفواتير + طلب واحد لكل البنود.
  // فشل البنود يعوّض بحذف الفواتير المدرجة (لا فاتورة بلا بنود)، وفشل
  // القيد الفريد (سباق نادر: فاتورة أُنشئت بين الفحص والإدراج) يهبط بنا
  // للمسار الفردي لعزل المتعارض وعدّه متخطّى — نفس الدلالات الأصلية.
  let created = 0
  if (planned.length > 0) {
    const insertLinesFor = async (invoiceIdByKey: Map<string, string>) => {
      const allLines = planned.flatMap((p) =>
        p.lines.map((l) => ({
          teacher_id: teacherId,
          invoice_id: invoiceIdByKey.get(`${p.studentId}|${p.groupId}`)!,
          line_type: l.line_type,
          description: l.description,
          amount: l.amount,
          reason: l.reason,
        })),
      )
      const { error } = await supa.from('invoice_lines').insert(allLines)
      if (error) {
        const friendly = friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
        // ملاحظة مراجعة #11 (3A-377): friendlyDbError يبني Error جديداً
        // فيسقط كود بوستجرس الأصلي، والملتقط الخارجي يفرّع على 23505
        // (سباق القيد الفريد) للهبوط للمسار الفردي — أعد ربط الكود
        // بالخطأ الودّي حتى يبقى التفريع صحيحاً لخطأ البنود أيضاً.
        ;(friendly as { code?: string }).code = (error as { code?: string }).code
        throw friendly
      }
    }
    try {
      const { data: inserted, error: bulkErr } = await supa
        .from('invoices')
        .insert(
          planned.map((p) => ({
            teacher_id: teacherId,
            student_id: p.studentId,
            group_id: p.groupId,
            period_month: period,
          })),
        )
        .select('id, student_id, group_id')
      if (bulkErr) throw bulkErr
      const idByKey = new Map(
        (inserted ?? []).map(
          (r) => [`${r.student_id}|${r.group_id}`, r.id] as const,
        ),
      )
      try {
        await insertLinesFor(idByKey)
      } catch (lineErr) {
        await supa
          .from('invoices')
          .delete()
          .eq('teacher_id', teacherId)
          .in('id', [...idByKey.values()])
        throw lineErr
      }
      created = planned.length
    } catch (bulkFailure) {
      if ((bulkFailure as { code?: string }).code !== '23505') throw bulkFailure
      // مسار فردي احتياطي عند سباق القيد الفريد فقط
      for (const p of planned) {
        const { data: inv, error: invErr } = await supa
          .from('invoices')
          .insert({
            teacher_id: teacherId,
            student_id: p.studentId,
            group_id: p.groupId,
            period_month: period,
          })
          .select('id')
          .single()
        if (invErr) {
          if ((invErr as { code?: string }).code === '23505') {
            skipped += 1
            continue
          }
          throw invErr
        }
        const invoiceId = inv.id
        const { error: lineErr } = await supa.from('invoice_lines').insert(
          p.lines.map((l) => ({
            teacher_id: teacherId,
            invoice_id: invoiceId,
            line_type: l.line_type,
            description: l.description,
            amount: l.amount,
            reason: l.reason,
          })),
        )
        if (lineErr) {
          await supa.from('invoices').delete().eq('teacher_id', teacherId).eq('id', invoiceId)
          throw lineErr
        }
        created += 1
      }
    }
  }

  // سجل النشاط: حدث واحد للتوليد كله (أو فاتورة فردية عند استهداف طالب
  // واحد) — لا يُسجَّل توليد لم ينشئ شيئاً. Fail-safe: لا يكسر الإصدار.
  if (created > 0) {
    void logActivity(teacherId, {
      event_type: opts.studentId ? 'invoice_created' : 'invoices_generated',
      entity_type: 'invoice_batch',
      entity_label: periodLabel(period),
      details: {
        period,
        period_label: periodLabel(period),
        created,
        skipped,
        total: enrollments.length,
        ...(opts.studentId ? { student_id: opts.studentId } : {}),
      },
    })
  }

  return { created, skipped, total: enrollments.length }
}

