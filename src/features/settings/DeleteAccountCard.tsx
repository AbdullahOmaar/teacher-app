/**
 * بطاقة حذف الحساب (فجوة 32 من تقييم الـ45 — مهمة Phase 2 رقم 3؛
 * تأكيد مكتوب + حذف ناعم منذ مهاجرة 0075 — F1 من اختبار سند).
 *
 * مالك فقط، ومخفية عن الحساب التجريبي العام (الحارس الحقيقي في دالة
 * الحذف نفسها، هجرة 0075). ثلاث خطوات: زر مسلّح ← كتابة بريد الحساب
 * كاملاً للتأكيد ← كلمة السر (إعادة مصادقة). الخادم يطابق حجة التأكيد
 * نفسه، فتخطي الواجهة لا يحذف شيئاً. بعد النجاح: توست تأكيد + انتقال
 * لصفحة الدخول (الجلسة مقطوعة خادمياً أصلاً).
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { useAuth } from '../../lib/useAuth'
import { t } from '../../i18n'
import { deleteMyAccount } from './deleteAccount'

export function DeleteAccountCard() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const accountEmail = user?.email ?? ''
  const [armed, setArmed] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const confirmationMatches =
    accountEmail !== '' &&
    confirmation.trim().toLowerCase() === accountEmail.trim().toLowerCase()

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !password || !confirmationMatches) return
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount(password, confirmation)
      setDone(true)
      toast(t('settings.deleteAccountDone'))
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.deleteAccountFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) return null

  return (
    <Card className="rise-in">
      <h2 className="type-section mt-0 mb-1 flex items-center gap-2">
        <Trash2 size={22} className="text-bad-text" />
        {t('settings.deleteAccountTitle')}
      </h2>
      <p className="text-[13.5px] text-muted mt-0 mb-3">{t('settings.deleteAccountBody')}</p>
      <p className="text-[13.5px] text-muted mt-0 mb-3">
        {t('settings.deleteAccountBackupHint')}{' '}
        <Link to="/backup" className="font-semibold text-primary">
          {t('settings.deleteAccountBackupLink')}
        </Link>
      </p>

      {armed ? (
        <form onSubmit={handleDelete}>
          <Field label={t('settings.deleteAccountConfirmEmailLabel')}>
            <TextInput
              type="email"
              autoComplete="off"
              dir="ltr"
              placeholder={t('settings.deleteAccountConfirmEmailPlaceholder')}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label={t('settings.deleteAccountPasswordLabel')}>
            <TextInput
              type="password"
              autoComplete="current-password"
              dir="ltr"
              placeholder={t('settings.deleteAccountPasswordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </Field>
          <p className="text-[13.5px] text-bad-text font-semibold mt-0 mb-3">
            {t('settings.deleteAccountArmedNote')}
          </p>
          {error && <FormError message={error} />}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="danger"
              className="flex-1"
              disabled={busy || !password || !confirmationMatches}
            >
              {busy ? t('settings.deleteAccountDeleting') : t('settings.deleteAccountConfirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setArmed(false)
                setConfirmation('')
                setPassword('')
                setError(null)
              }}
            >
              {t('settings.deleteAccountCancel')}
            </Button>
          </div>
        </form>
      ) : (
        <Button full variant="danger" onClick={() => setArmed(true)}>
          <Trash2 size={18} />
          {t('settings.deleteAccountStart')}
        </Button>
      )}
    </Card>
  )
}
