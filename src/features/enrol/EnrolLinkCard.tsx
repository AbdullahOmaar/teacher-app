import { useState } from 'react'
import { CalendarCheck2, Check, Copy, MessageCircle, RefreshCw } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useTeacherSettings } from '../settings/hooks'
import { enrolShareWaUrl } from './api'
import {
  useEnrolmentLink,
  useGenerateEnrolmentLink,
  useSetEnrolmentEnabled,
} from './hooks'

/**
 * بطاقة «صفحة الحجز العامة» في الإعدادات (Phase 5 — خطوة 2، migration
 * ‏0019). رابط عام واحد للسنتر النشط بهويته البيضاء يملأه ولي الأمر
 * فتهبط طلباته في قوائم انتظار المجموعات بمصدر «صفحة الحجز».
 *
 * القاعدة تخزن هاش الرمز فقط، فالرابط الكامل بالرمز الخام يظهر هنا عند
 * الإنشاء/التجديد فقط ولا يمكن استرجاعه بعدها — من فقده يجدد الرابط
 * (التجديد يبطل القديم فوراً). الإدارة للمالك فقط (سياسة enrolment_links
 * مالك فقط)، والبطاقة نفسها لا تظهر إلا في مساحة مالك.
 */
export function EnrolLinkCard() {
  const teacher = useCurrentTeacher()
  const toast = useToast()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const linkQ = useEnrolmentLink(teacherId, isOwner)
  const settingsQ = useTeacherSettings(teacherId, isOwner)
  const generate = useGenerateEnrolmentLink(teacherId ?? '')
  const setEnabled = useSetEnrolmentEnabled(teacherId ?? '')

  /** الرابط الكامل بالرمز الخام — موجود فقط بعد إنشاء/تجديد في هذه الجلسة */
  const [rawLink, setRawLink] = useState<string | null>(null)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isOwner || !teacherId) return null

  const link = linkQ.data ?? null
  const centreName =
    settingsQ.data?.brand_name?.trim() ||
    (teacher.status === 'ready' ? (teacher.teacher?.display_name ?? null) : null)

  const doGenerate = async () => {
    setError(null)
    try {
      const url = await generate.mutateAsync()
      setRawLink(url)
      setConfirmRegen(false)
      toast(link ? 'تم تجديد رابط الحجز — الرابط القديم توقف' : 'تم إنشاء رابط الحجز العام')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء إنشاء الرابط')
    }
  }

  const copyLink = async () => {
    if (!rawLink) return
    try {
      await navigator.clipboard.writeText(rawLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('المتصفح منع النسخ التلقائي — انسخ الرابط يدوياً من الحقل')
    }
  }

  const toggleEnabled = async (next: boolean) => {
    setError(null)
    try {
      await setEnabled.mutateAsync(next)
      toast(next ? 'تم تفعيل صفحة الحجز' : 'تم إيقاف صفحة الحجز مؤقتاً')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء تغيير الحالة')
    }
  }

  return (
    <Card>
      <h2 className="type-section mt-0 mb-1 flex items-center gap-2">
        <CalendarCheck2 size={22} className="text-primary" /> صفحة الحجز العامة
      </h2>
      <p className="text-muted type-secondary mt-0">
        رابط واحد بهوية سنترك تنشره في فيسبوك وواتساب: ولي الأمر يملأ اسم الطالب وموبايله
        والمجموعة المطلوبة، والطلب يوصلك في قائمة انتظار المجموعة بمصدر «صفحة الحجز»
        فتقبله من هناك بضغطة.
      </p>

      {error && <FormError message={error} />}

      {linkQ.isPending ? (
        <p className="text-muted text-[13.5px]">بنحمّل حالة الرابط…</p>
      ) : !link ? (
        <>
          <p className="text-muted text-[13.5px]">لا يوجد رابط حجز بعد لهذا السنتر.</p>
          <Button onClick={() => void doGenerate()} disabled={generate.isPending}>
            {generate.isPending ? 'بننشئ الرابط…' : 'إنشاء رابط الحجز'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border border-border rounded-xl px-3 py-2.5 mb-3">
            <div>
              <div className="font-semibold text-[15px]">
                {link.enabled ? 'الحجز مفعّل' : 'الحجز موقوف مؤقتاً'}
              </div>
              <div className="text-muted text-[12.5px]">
                {link.last_used_at
                  ? `آخر زيارة للصفحة: ${new Date(link.last_used_at).toLocaleDateString('ar-EG')}`
                  : 'لم تُفتح الصفحة بعد'}
              </div>
            </div>
            <label className="flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={link.enabled}
                onChange={(e) => void toggleEnabled(e.target.checked)}
                disabled={setEnabled.isPending}
                className="w-6 h-6 accent-primary"
                aria-label="تفعيل صفحة الحجز"
              />
            </label>
          </div>

          {rawLink ? (
            <>
              <div
                className="border border-border rounded-xl px-3 py-2.5 mb-2 text-[13.5px] break-all bg-soft"
                dir="ltr"
              >
                {rawLink}
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                <Button variant="soft" onClick={() => void copyLink()}>
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? 'اتنسخ' : 'نسخ الرابط'}
                </Button>
                <a
                  href={enrolShareWaUrl(rawLink, centreName)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold bg-soft text-primary hover:opacity-90"
                >
                  <MessageCircle size={17} />
                  مشاركة واتساب
                </a>
              </div>
            </>
          ) : (
            <p className="text-muted text-[13.5px] border border-border rounded-xl px-3 py-2.5 bg-soft">
              الرابط الكامل ظهر مرة واحدة عند إنشائه (القاعدة تخزن بصمته فقط لحمايته).
              لو فقدته، جدّد الرابط وهيظهر لك الجديد — القديم هيتوقف فوراً.
            </p>
          )}

          {confirmRegen ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13.5px] font-semibold text-bad-text">
                التجديد هيوقف الرابط الحالي المنشور فوراً. متأكد؟
              </span>
              <Button
                variant="danger"
                className="min-h-[40px] text-[13.5px] px-3"
                onClick={() => void doGenerate()}
                disabled={generate.isPending}
              >
                {generate.isPending ? 'بنجدد…' : 'أيوه، جدّد الرابط'}
              </Button>
              <Button
                variant="ghost"
                className="min-h-[40px] text-[13.5px] px-3"
                onClick={() => setConfirmRegen(false)}
              >
                إلغاء
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="min-h-[40px] text-[13.5px] px-3"
              onClick={() => setConfirmRegen(true)}
            >
              <RefreshCw size={15} />
              تجديد الرابط
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
