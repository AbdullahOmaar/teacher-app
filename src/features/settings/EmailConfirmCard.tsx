import { useEffect, useState } from 'react'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import {
  confirmSignUpWithCode,
  fetchAuthUser,
  isEmailUnconfirmed,
  resendConfirmation,
  type AuthUserSnapshot,
} from '../auth/api'
import { CodeEntry } from '../auth/CodeEntry'
import { t } from '../../i18n'

/**
 * بطاقة «تأكيد البريد الإلكتروني» في الإعدادات (3A-904): مسار إكمال
 * التحقق المطلوب لأي حساب بريده غير مؤكَّد — ذاتية الإخفاء تماماً
 * (لا تُرسم أصلاً لبريد مؤكَّد)، وبلا أي إخفاء/تخطٍّ من المستخدم:
 * إما يدخل الكود فيتأكد البريد، أو يبقى الحساب غير مؤكَّد والبطاقة
 * ظاهرة. الحالة تُقرأ طازجة من الخادم (getUser) لا من نسخة الجلسة
 * وحدها — التأكيد قد يحدث من جهاز آخر فتكذب النسخة المحلية.
 * نجاح التحقق هنا لا يغيّر الجلسة (قائمة أصلاً) — يعلّم البريد
 * مؤكَّداً عند GoTrue فتختفي البطاقة من الزيارة التالية، ونعرض
 * حالة النجاح داخل البطاقة نفسها تأكيداً فورياً للمستخدم.
 */
export function EmailConfirmCard() {
  const { user } = useAuth()
  // undefined = لسه بنقرأ الطازج؛ null = فشلت القراءة (سقوط لنسخة الجلسة)
  const [fresh, setFresh] = useState<AuthUserSnapshot | null | undefined>(undefined)
  const [showEntry, setShowEntry] = useState(false)
  const [verified, setVerified] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [sendMsg, setSendMsg] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const snap = await fetchAuthUser()
      if (alive) setFresh(snap)
    })()
    return () => {
      alive = false
    }
  }, [])

  // المعروض: الطازج إن وصل، وإلا نسخة الجلسة (شكل الحقلين متوافق)
  const shown: { email?: string | null; email_confirmed_at?: string | null } | null =
    fresh ?? user

  if (verified) {
    return (
      <Card className="rise-in">
        <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
          <MailCheck size={22} className="text-primary" /> {t('settings.emailConfirmTitle')}
        </h2>
        <p className="text-[13.5px] bg-ok-soft text-ok-text rounded-xl px-3 py-2 mb-0 mt-0 flex items-center gap-2 font-semibold">
          <CheckCircle2 size={18} className="shrink-0" />
          {t('settings.emailConfirmDone')}
        </p>
      </Card>
    )
  }

  if (!isEmailUnconfirmed(shown) || !shown?.email) return null
  const email = shown.email

  const handleSendNew = async () => {
    setSendBusy(true)
    setSendMsg(null)
    setSendError(null)
    try {
      await resendConfirmation(email)
      setSendMsg(t('settings.emailConfirmSent'))
      setShowEntry(true)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t('settings.emailConfirmSendFailed'))
    } finally {
      setSendBusy(false)
    }
  }

  return (
    <Card className="rise-in">
      <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
        <MailCheck size={22} className="text-primary" /> {t('settings.emailConfirmTitle')}
      </h2>
      {showEntry ? (
        <CodeEntry
          email={email}
          hint={t('settings.emailConfirmCodeHint')}
          verifyLabel={t('auth.verifyCode')}
          onVerify={async (token) => {
            await confirmSignUpWithCode(email, token)
            setVerified(true)
          }}
          onResend={() => resendConfirmation(email)}
          onBack={() => setShowEntry(false)}
          backLabel={t('settings.emailConfirmBack')}
        />
      ) : (
        <>
          <p className="text-muted text-[13.5px] mt-0 mb-2">{t('settings.emailConfirmHint')}</p>
          <p className="text-[13.5px] font-semibold mb-3 break-all" dir="ltr" style={{ textAlign: 'start' }}>
            {email}
          </p>
          {sendMsg && (
            <p className="bg-soft text-primary text-[13.5px] rounded-xl px-3 py-2 mb-3 mt-0">{sendMsg}</p>
          )}
          {sendError && (
            <p className="bg-bad-soft text-bad-text text-[13.5px] font-semibold rounded-xl px-3 py-2 mb-3 mt-0" role="alert">
              {sendError}
            </p>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setShowEntry(true)}>
              {t('auth.enterConfirmationCode')}
            </Button>
            <Button
              className="flex-1"
              variant="soft"
              onClick={handleSendNew}
              disabled={sendBusy}
            >
              {sendBusy ? t('settings.emailConfirmSending') : t('settings.emailConfirmSendNew')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
