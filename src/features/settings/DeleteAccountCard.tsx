/**
 * بطاقة حذف الحساب (فجوة 32 من تقييم الـ45 — مهمة Phase 2 رقم 3).
 *
 * مالك فقط، ومخفية عن الحساب التجريبي العام (الحارس الحقيقي في دالة
 * الحذف نفسها، هجرة 0046). خطوتان: زر مسلّح ← كلمة سر + تأكيد ثانٍ.
 * بعد النجاح: توست تأكيد + انتقال لصفحة الدخول (الجلسة ميتة أصلاً).
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { t } from '../../i18n'
import { deleteMyAccount } from './deleteAccount'

export function DeleteAccountCard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [armed, setArmed] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount(password)
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
              disabled={busy || !password}
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
