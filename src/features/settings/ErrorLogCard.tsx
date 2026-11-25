import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bug, TriangleAlert } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toast'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { t } from '../../i18n'
import { db } from '../../lib/supabase'
import { ERROR_ALERT_THRESHOLD, reportClientError } from '../../lib/errorReporter'
import { addDaysStr, toDateStr, todayStr } from '../home/api'
import { formatDateLabel } from '../schedule/api'

interface ErrorDayBucket {
  date: string
  count: number
}

/** تجميع صفوف آخر 7 أيام في عدّادات يومية بالتاريخ المحلي — دالة نقية */
export function bucketErrorDays(
  rows: { created_at: string }[],
  today: string,
): ErrorDayBucket[] {
  const buckets: ErrorDayBucket[] = []
  for (let i = 6; i >= 0; i--) buckets.push({ date: addDaysStr(today, -i), count: 0 })
  const byDate = new Map(buckets.map((b) => [b.date, b]))
  for (const row of rows) {
    const day = toDateStr(new Date(row.created_at))
    const bucket = byDate.get(day)
    if (bucket) bucket.count += 1
  }
  return buckets
}

/**
 * بطاقة «سجل أخطاء التطبيق» في الإعدادات (مهمة 11 — 0053 / فجوة 21).
 * مالك الحساب فقط (القراءة RLS مالك فقط أصلاً). تعرض: عدّاد اليوم +
 * تنبيه عند بلوغ العتبة الموثقة (ERROR_ALERT_THRESHOLD = ‏10/يوم) +
 * عدّادات آخر 7 أيام + أحدث رسالة. حتى تُطبَّق 0053 عند بوابة التجميد
 * يفشل الاستعلام فتظهر ملحوظة «سيبدأ مع التحديث القادم» الصريحة —
 * لا عدّادات وهمية ولا حالة خطأ مخيفة لميزة غير مفعّلة بعد.
 */
export function ErrorLogCard() {
  const teacher = useCurrentTeacher()
  const qc = useQueryClient()
  const toast = useToast()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'

  const errorsQ = useQuery({
    queryKey: ['error-log', teacherId],
    queryFn: async () => {
      const since = `${addDaysStr(todayStr(), -6)}T00:00:00`
      const { data, error } = await db()
        .from('error_reports')
        .select('created_at, kind, message')
        .eq('teacher_id', teacherId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
    enabled: isOwner && Boolean(teacherId),
    retry: false,
  })

  if (!isOwner || !teacherId) return null

  const rows = errorsQ.data ?? []
  const buckets = bucketErrorDays(rows, todayStr())
  const todayCount = buckets[buckets.length - 1]?.count ?? 0
  const alerting = todayCount >= ERROR_ALERT_THRESHOLD
  const latest = rows[0] ?? null

  const onTestReport = () => {
    reportClientError('unhandled', new Error(t('errorLog.testMessage')))
    toast(t('errorLog.testSent'))
    // البلاغ يصل خلال ثوانٍ — إعادة جلب العدّاد بعد مهلة قصيرة ليراه المالك
    setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ['error-log', teacherId] })
    }, 2500)
  }

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-[15px] font-bold mt-0 mb-2">
        <Bug size={19} className="text-primary" />
        {t('settings.sectionErrors')}
      </h3>
      <p className="text-muted text-[13.5px] leading-[1.8] mt-0 mb-3">{t('errorLog.intro')}</p>

      {errorsQ.isPending ? (
        <p className="text-muted text-[13.5px] mt-0 mb-3">…</p>
      ) : errorsQ.error ? (
        <p className="text-muted text-[13.5px] leading-[1.8] mt-0 mb-3">
          {t('errorLog.notActiveYet')}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13.5px] text-muted font-semibold">{t('errorLog.todayLabel')}</span>
            <span
              className={`text-[15px] font-extrabold rounded-full px-2.5 py-0.5 ${
                alerting ? 'bg-bad-soft text-bad-text' : 'bg-soft text-text'
              }`}
            >
              {todayCount}
            </span>
          </div>

          {alerting ? (
            <p className="flex items-start gap-2 bg-bad-soft text-bad-text rounded-xl px-3 py-2 text-[13.5px] leading-[1.8] font-semibold mt-0 mb-3">
              <TriangleAlert size={17} className="shrink-0 mt-1" />
              {t('errorLog.alert', { count: todayCount })}
            </p>
          ) : null}

          {rows.length === 0 ? (
            <p className="text-muted text-[13.5px] leading-[1.8] mt-0 mb-3">{t('errorLog.none')}</p>
          ) : (
            <>
              <p className="text-[13.5px] font-bold mt-0 mb-2">{t('errorLog.last7Title')}</p>
              <div className="flex flex-col gap-1 mb-3">
                {buckets.map((b) => (
                  <div key={b.date} className="flex items-center gap-2 text-[13.5px]">
                    <span className="text-muted">{formatDateLabel(b.date)}</span>
                    <span className="flex-1 border-b border-dashed border-border" />
                    <span className="font-bold">{b.count}</span>
                  </div>
                ))}
              </div>
              {latest ? (
                <p className="text-[13.5px] leading-[1.8] mt-0 mb-3">
                  <span className="text-muted font-semibold">{t('errorLog.latestLabel')}: </span>
                  <span className="break-words">{latest.message}</span>
                </p>
              ) : null}
            </>
          )}
        </>
      )}

      <div className="flex">
        <Button size="sm" variant="soft" onClick={onTestReport}>
          {t('errorLog.testButton')}
        </Button>
      </div>
    </Card>
  )
}
