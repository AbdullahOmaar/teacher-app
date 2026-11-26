import { useState } from 'react'
import { CalendarCheck2, Check, Copy, Link2, MessageCircle, RefreshCw } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { copyText } from '../../lib/clipboard'
import { t } from '../../i18n'
import { useTeacherSettings } from '../settings/hooks'
import { buildCentreLink, enrolShareWaUrl } from './api'
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
  const [copiedCentre, setCopiedCentre] = useState(false)

  /** رابط صفحة السنتر العامة مشتق من رابط الحجز الخام (نفس الرمز) */
  const centreLink = rawLink ? buildCentreLink(rawLink) : null

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
      toast(link ? t('enrol.cardRegeneratedToast') : t('enrol.cardCreatedToast'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('enrol.cardCreateError'))
    }
  }

  const copyLink = async () => {
    if (!rawLink) return
    if (await copyText(rawLink)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setError(t('enrol.cardCopyError'))
    }
  }

  const copyCentreLink = async () => {
    if (!centreLink) return
    if (await copyText(centreLink)) {
      setCopiedCentre(true)
      setTimeout(() => setCopiedCentre(false), 2000)
    } else {
      setError(t('enrol.cardCopyError'))
    }
  }

  const toggleEnabled = async (next: boolean) => {
    setError(null)
    try {
      await setEnabled.mutateAsync(next)
      toast(next ? t('enrol.cardEnabledToast') : t('enrol.cardDisabledToast'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('enrol.cardToggleError'))
    }
  }

  return (
    <Card>
      <h2 className="type-section mt-0 mb-1 flex items-center gap-2">
        <CalendarCheck2 size={22} className="text-primary" /> {t('enrol.cardTitle')}
      </h2>
      <p className="text-muted type-secondary mt-0">
        {t('enrol.cardIntro')}
      </p>

      {error && <FormError message={error} />}

      {linkQ.isPending ? (
        <p className="text-muted text-[13.5px]">{t('enrol.cardLoadingLink')}</p>
      ) : !link ? (
        <>
          <p className="text-muted text-[13.5px]">{t('enrol.cardNoLink')}</p>
          <Button onClick={() => void doGenerate()} disabled={generate.isPending}>
            <Link2 size={18} />
            {generate.isPending ? t('enrol.cardCreating') : t('enrol.cardCreateAction')}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border border-border rounded-xl px-3 py-2.5 mb-3">
            <div>
              <div className="font-semibold text-[15px]">
                {link.enabled ? t('enrol.cardEnabled') : t('enrol.cardDisabled')}
              </div>
              <div className="text-muted text-[12.5px]">
                {link.last_used_at
                  ? t('enrol.cardLastVisit', { date: new Date(link.last_used_at).toLocaleDateString('ar-EG') })
                  : t('enrol.cardNeverOpened')}
              </div>
            </div>
            <label className="flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={link.enabled}
                onChange={(e) => void toggleEnabled(e.target.checked)}
                disabled={setEnabled.isPending}
                className="w-6 h-6 accent-primary"
                aria-label={t('enrol.cardToggleAria')}
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
                  {copied ? t('enrol.cardCopied') : t('enrol.cardCopyLink')}
                </Button>
                <a
                  href={enrolShareWaUrl(rawLink, centreName)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold bg-soft text-primary hover:opacity-90"
                >
                  <MessageCircle size={17} />
                  {t('enrol.cardShareWhatsapp')}
                </a>
              </div>
              {centreLink && (
                <>
                  <p className="text-muted text-[13.5px] mt-0 mb-2">
                    {t('enrol.cardCentreLinkNote')}
                  </p>
                  <div
                    className="border border-border rounded-xl px-3 py-2.5 mb-2 text-[13.5px] break-all bg-soft"
                    dir="ltr"
                  >
                    {centreLink}
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Button variant="soft" onClick={() => void copyCentreLink()}>
                      {copiedCentre ? <Check size={17} /> : <Copy size={17} />}
                      {copiedCentre ? t('enrol.cardCopied') : t('enrol.cardCopyCentreLink')}
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-muted text-[13.5px] border border-border rounded-xl px-3 py-2.5 bg-soft">
              {t('enrol.cardRawLinkNote')}
            </p>
          )}

          {confirmRegen ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13.5px] font-semibold text-bad-text">
                {t('enrol.cardRegenWarning')}
              </span>
              <Button
                variant="danger"
                className="min-h-[40px] text-[13.5px] px-3"
                onClick={() => void doGenerate()}
                disabled={generate.isPending}
              >
                {generate.isPending ? t('enrol.cardRegenerating') : t('enrol.cardRegenConfirm')}
              </Button>
              <Button
                variant="ghost"
                className="min-h-[40px] text-[13.5px] px-3"
                onClick={() => setConfirmRegen(false)}
              >
                {t('enrol.cardCancel')}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="min-h-[40px] text-[13.5px] px-3"
              onClick={() => setConfirmRegen(true)}
            >
              <RefreshCw size={15} />
              {t('enrol.cardRegenAction')}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
