import { useEffect, useState } from 'react'
import { Check, CheckCircle2, MessageCircle, Save } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/AuthProvider'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { normalizeEgyptianPhone } from '../../lib/phone'
import { formatDateTimeAr } from '../../lib/format'
import {
  useConfirmPhoneLink,
  useRequestPhoneLink,
  useSendWhatsappTest,
  useSetWhatsappToken,
  useUpsertWhatsappConfig,
  useWhatsappConfig,
} from './hooks'
import { t } from '../../i18n'

/**
 * بطاقة «واتساب» في الإعدادات (3A-300 — النموذج الاختياري per-teacher،
 * migration ‏0026، التصميم: WHATSAPP-OTP-DESIGN.md §٧/§٨).
 *
 * الميزة اختيارية وعلى حساب المدرس: يربط هنا أصول Meta بتاعته هو
 * (phone_number_id ‏/ WABA ID / قالب Authentication) فيفعّل الدخول
 * بالهاتف لحسابه — الكود يصله من رقمه التجاري هو، لا من المنصة.
 * الحقول غير السرية في teacher_whatsapp_config بسياسة مالك فقط.
 * التوكن استثناء صارم: حقل كلمة مرور للكتابة فقط — يُرسل لـ RPC
 * ‏set_teacher_whatsapp_token فيُخزَّن في Supabase Vault، ولا يُقرأ
 * في العميل أبداً (الحالة المعروضة: «محفوظ بتاريخ…» فقط).
 *
 * الترتيب الإرشادي داخل البطاقة هو تسلسل التهيئة نفسه: حقول ← توكن ←
 * تفعيل ← كود تجريبي ← ربط الرقم بالحساب (الكود يصل عبر نفس القناة).
 * القسم كله مالك فقط (يُركَّب من SettingsPage للمالك فقط أصلاً).
 */
export function WhatsAppSettingsCard() {
  const { user } = useAuth()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'

  const configQ = useWhatsappConfig(teacherId || undefined, isOwner && Boolean(teacherId))
  const upsert = useUpsertWhatsappConfig(teacherId)
  const setToken = useSetWhatsappToken(teacherId)
  const sendTest = useSendWhatsappTest(teacherId)
  const requestLink = useRequestPhoneLink()
  const confirmLink = useConfirmPhoneLink()

  // حقول النموذج — تُملأ من الصف المحفوظ مرة عند وصوله (أو عند تبديل السنتر)
  const [enabled, setEnabled] = useState(false)
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [templateName, setTemplateName] = useState('otp_code')
  const [templateLang, setTemplateLang] = useState('ar')
  const [hydratedFor, setHydratedFor] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // التوكن: قيمة عابرة في الذاكرة فقط — تُمسح بعد الحفظ ولا تُعاد قراءتها
  const [tokenInput, setTokenInput] = useState('')
  const [confirmClearToken, setConfirmClearToken] = useState(false)

  // ربط الهاتف: خطوتان (طلب الكود ثم تأكيده)
  const [linkPhone, setLinkPhone] = useState('')
  const [linkCode, setLinkCode] = useState('')
  const [linkStep, setLinkStep] = useState<'phone' | 'code'>('phone')
  const [linkE164, setLinkE164] = useState('')

  const config = configQ.data ?? null

  useEffect(() => {
    if (!configQ.data || hydratedFor === teacherId) return
    setEnabled(configQ.data.enabled)
    setPhoneNumberId(configQ.data.phone_number_id)
    setWabaId(configQ.data.waba_id)
    setTemplateName(configQ.data.template_name || 'otp_code')
    setTemplateLang(configQ.data.template_language || 'ar')
    setHydratedFor(teacherId)
  }, [configQ.data, hydratedFor, teacherId])

  if (!isOwner || !teacherId) return null

  const tokenSaved = Boolean(config?.token_updated_at)
  const configComplete = Boolean(config?.enabled && config?.phone_number_id && tokenSaved)
  const statusText = !config
    ? t('settings.waStatusNotConfigured')
    : configComplete
      ? t('settings.waStatusActive')
      : t('settings.waStatusIncomplete')

  const handleSave = async () => {
    setMsg(null)
    setFormError(null)
    try {
      await upsert.mutateAsync({
        enabled,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        template_name: templateName,
        template_language: templateLang,
      })
      setMsg(t('settings.waSavedMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waSaveFailed'))
    }
  }

  const handleSaveToken = async () => {
    setMsg(null)
    setFormError(null)
    try {
      await setToken.mutateAsync(tokenInput)
      setTokenInput('')
      setConfirmClearToken(false)
      setMsg(t('settings.waTokenSavedMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waTokenSaveFailed'))
    }
  }

  const handleClearToken = async () => {
    if (!confirmClearToken) {
      setConfirmClearToken(true)
      return
    }
    setMsg(null)
    setFormError(null)
    try {
      await setToken.mutateAsync('')
      setConfirmClearToken(false)
      setMsg(t('settings.waTokenClearedMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waTokenSaveFailed'))
    }
  }

  const handleSendTest = async () => {
    setMsg(null)
    setFormError(null)
    try {
      await sendTest.mutateAsync()
      setMsg(t('settings.waTestSentMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waTestFailed'))
    }
  }

  const handleRequestLink = async () => {
    setMsg(null)
    setFormError(null)
    const e164 = normalizeEgyptianPhone(linkPhone)
    if (!e164) {
      setFormError(t('settings.waLinkInvalidPhone'))
      return
    }
    try {
      await requestLink.mutateAsync(e164)
      setLinkE164(e164)
      setLinkStep('code')
      setMsg(t('settings.waLinkCodeSentMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waLinkFailed'))
    }
  }

  const handleConfirmLink = async () => {
    setMsg(null)
    setFormError(null)
    try {
      await confirmLink.mutateAsync({ phoneE164: linkE164, code: linkCode })
      setLinkStep('phone')
      setLinkCode('')
      setMsg(t('settings.waLinkDoneMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waLinkFailed'))
    }
  }

  const linkedPhone = user?.phone ? `+${user.phone}` : null

  return (
    <Card>
      <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
        <MessageCircle size={22} className="text-primary" /> {t('settings.waTitle')}
      </h2>
      <p className="text-muted text-[13.5px] mt-0 mb-3">{t('settings.waIntro')}</p>

      <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
        {configComplete && <CheckCircle2 size={16} className="text-primary shrink-0" />}
        <span>
          {t('settings.waStatusLabel')}: <strong>{statusText}</strong>
        </span>
      </p>

      {formError && <FormError message={formError} />}
      {msg && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3" role="status">
          {msg}
        </p>
      )}

      {configQ.isLoading ? (
        <p className="text-muted text-[13.5px] mb-0">{t('settings.waLoading')}</p>
      ) : (
        <>
          {/* ١+٣) الحقول غير السرية + مفتاح التفعيل — حفظ واحد صريح */}
          <div className="grid gap-3 mb-3">
            <Field label={t('settings.waPhoneNumberIdLabel')}>
              <TextInput
                dir="ltr"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="123456789012345"
                autoComplete="off"
              />
            </Field>
            <Field label={t('settings.waWabaIdLabel')}>
              <TextInput
                dir="ltr"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="123456789012345"
                autoComplete="off"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.waTemplateNameLabel')}>
                <TextInput
                  dir="ltr"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label={t('settings.waTemplateLangLabel')}>
                <TextInput
                  dir="ltr"
                  value={templateLang}
                  onChange={(e) => setTemplateLang(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-6 h-6 accent-primary"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="text-[14.5px] font-semibold">{t('settings.waEnabledLabel')}</span>
            </label>
            <p className="text-muted text-[12.5px] mt-0 mb-0">{t('settings.waEnabledHint')}</p>
          </div>
          <Button onClick={handleSave} disabled={upsert.isPending} className="mb-5">
            <Save size={18} />
            {upsert.isPending ? t('settings.waSaving') : t('settings.waSave')}
          </Button>

          {/* ٢) التوكن — كتابة فقط إلى Vault، لا قراءة أبداً */}
          <h3 className="type-section mt-0 mb-2 text-[15px]">{t('settings.waTokenTitle')}</h3>
          <p className="text-muted text-[13px] mt-0 mb-3">
            {tokenSaved && config?.token_updated_at
              ? t('settings.waTokenSavedAt', { date: formatDateTimeAr(config.token_updated_at) })
              : t('settings.waTokenNotSaved')}
            {' — '}
            {t('settings.waTokenWriteOnlyNote')}
          </p>
          <div className="flex flex-wrap items-end gap-2 mb-5">
            <div className="grow min-w-[220px]">
              <Field label={t('settings.waTokenLabel')}>
                <TextInput
                  type="password"
                  dir="ltr"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  autoComplete="off"
                  placeholder="EAA…"
                />
              </Field>
            </div>
            <Button
              variant="soft"
              onClick={handleSaveToken}
              disabled={!tokenInput.trim() || setToken.isPending}
            >
              {t('settings.waTokenSave')}
            </Button>
            {tokenSaved && (
              <Button
                variant="ghost"
                onClick={handleClearToken}
                disabled={setToken.isPending}
              >
                {confirmClearToken ? t('settings.waTokenClearConfirm') : t('settings.waTokenClear')}
              </Button>
            )}
          </div>

          {/* ٤) كود تجريبي — يثبت سلسلة Meta كاملة قبل الربط */}
          <h3 className="type-section mt-0 mb-2 text-[15px]">{t('settings.waTestTitle')}</h3>
          <p className="text-muted text-[13px] mt-0 mb-3">{t('settings.waTestHint')}</p>
          <Button
            variant="soft"
            onClick={handleSendTest}
            disabled={!configComplete || sendTest.isPending}
            className="mb-5"
          >
            {sendTest.isPending ? t('settings.waTestSending') : t('settings.waTestSend')}
          </Button>

          {/* ٥) ربط الرقم بالحساب — بعده يعمل الدخول بالهاتف */}
          <h3 className="type-section mt-0 mb-2 text-[15px]">{t('settings.waLinkTitle')}</h3>
          {linkedPhone ? (
            <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-primary shrink-0" />
              {t('settings.waLinkLinked', { phone: linkedPhone })}
            </p>
          ) : (
            <>
              <p className="text-muted text-[13px] mt-0 mb-3">{t('settings.waLinkHint')}</p>
              {linkStep === 'phone' ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grow min-w-[200px]">
                    <Field label={t('settings.waLinkPhoneLabel')}>
                      <TextInput
                        dir="ltr"
                        inputMode="tel"
                        value={linkPhone}
                        onChange={(e) => setLinkPhone(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        autoComplete="tel"
                      />
                    </Field>
                  </div>
                  <Button
                    variant="soft"
                    onClick={handleRequestLink}
                    disabled={!configComplete || requestLink.isPending}
                  >
                    {requestLink.isPending ? t('settings.waLinkSending') : t('settings.waLinkSendCode')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grow min-w-[160px]">
                    <Field label={t('settings.waLinkCodeLabel')}>
                      <TextInput
                        dir="ltr"
                        inputMode="numeric"
                        value={linkCode}
                        onChange={(e) => setLinkCode(e.target.value)}
                        autoComplete="one-time-code"
                      />
                    </Field>
                  </div>
                  <Button
                    onClick={handleConfirmLink}
                    disabled={linkCode.trim().length < 4 || confirmLink.isPending}
                  >
                    <Check size={18} />
                    {confirmLink.isPending ? t('settings.waLinkConfirming') : t('settings.waLinkConfirm')}
                  </Button>
                </div>
              )}
              {!configComplete && (
                <p className="text-muted text-[12.5px] mt-2 mb-0">{t('settings.waLinkNeedsConfig')}</p>
              )}
            </>
          )}
        </>
      )}
    </Card>
  )
}
