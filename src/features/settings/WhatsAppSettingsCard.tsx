import { useEffect, useState } from 'react'
import { Check, CheckCircle2, MessageCircle, Save } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/useAuth'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import {
  WHATSAPP_VERIFICATION_CHANNEL_ENABLED,
  normalizeEgyptianPhone,
} from '../../lib/phone'
import { useUpdateOwnProfile } from '../auth/hooks'
import { formatDateTimeAr } from '../../lib/format'
import {
  useConfirmPhoneLink,
  useRequestPhoneLink,
  useSendWhatsappMessage,
  useSendWhatsappTest,
  useSetWhatsappToken,
  useUpsertWhatsappConfig,
  useUpsertWhatsappTemplate,
  useWhatsappConfig,
  useWhatsappMessageLog,
  useWhatsappTemplates,
} from './hooks'
import {
  MESSAGE_STATUS_KEYS,
  OPT_IN_PIECE_KEYS,
  TEMPLATE_STATUS_KEYS,
  WHATSAPP_TEMPLATE_CATALOG,
  isWhatsappMessageKind,
  isWhatsappMessageStatus,
  isWhatsappTemplateStatus,
  missingOptInPieces,
  templateDef,
  type WhatsappMessageKind,
  type WhatsappMessageStatus,
  type WhatsappTemplateStatus,
} from './whatsappTemplates'
import { t } from '../../i18n'

interface TemplateForm {
  name: string
  lang: string
  status: WhatsappTemplateStatus
}

/** إخفاء رقم المستلم في سجل الرسائل (نفس قاعدة دوال Edge: آخر رقمين) */
function maskPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 2) return '**'
  return '*'.repeat(digits.length - 2) + digits.slice(-2)
}

function logStatusOf(status: string): WhatsappMessageStatus {
  return isWhatsappMessageStatus(status) ? status : 'queued'
}

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
  // رقم التأكيد عبر واتساب (3A-905 — تجهيز فقط): يكتب رقم الموبايل
  // في الملف الشخصي نفسه (teachers.phone)، فلا مصدر ثانٍ للرقم.
  const updateOwnProfile = useUpdateOwnProfile(teacherId)
  const templatesQ = useWhatsappTemplates(teacherId || undefined, isOwner && Boolean(teacherId))
  const upsertTemplate = useUpsertWhatsappTemplate(teacherId)
  const messageLogQ = useWhatsappMessageLog(teacherId || undefined, isOwner && Boolean(teacherId))
  const sendMessage = useSendWhatsappMessage(teacherId)

  // حقول النموذج — تُملأ من الصف المحفوظ مرة عند وصوله (أو عند تبديل السنتر)
  const [enabled, setEnabled] = useState(false)
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [templateName, setTemplateName] = useState('otp_code')
  const [templateLang, setTemplateLang] = useState('ar')
  // استعداد الإرسال الآلي (0073 — المهمة 24): opt-in + حصة يومية،
  // يُحفظان مع نفس نموذج الإعداد؛ لا أثر لهما قبل فتح المنصة للإرسال
  const [autoSendEnabled, setAutoSendEnabled] = useState(false)
  const [autoSendQuota, setAutoSendQuota] = useState('100')
  const [hydratedFor, setHydratedFor] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // التوكن: قيمة عابرة في الذاكرة فقط — تُمسح بعد الحفظ ولا تُعاد قراءتها
  const [tokenInput, setTokenInput] = useState('')
  const [confirmClearToken, setConfirmClearToken] = useState(false)

  // رقم التأكيد عبر واتساب: يُملأ من رقم الملف الشخصي مرة عند وصوله
  const [verifyPhone, setVerifyPhone] = useState('')
  const [verifyPhoneHydratedFor, setVerifyPhoneHydratedFor] = useState('')

  // ربط الهاتف: خطوتان (طلب الكود ثم تأكيده)
  const [linkPhone, setLinkPhone] = useState('')
  const [linkCode, setLinkCode] = useState('')
  const [linkStep, setLinkStep] = useState<'phone' | 'code'>('phone')
  const [linkE164, setLinkE164] = useState('')

  // قوالب الرسائل (0045): تعديلات محلية فوق قيم السجل المحفوظة —
  // القيم الفعالة تُشتق وقت العرض (لا مزامنة حالة داخل effect)،
  // والتعديلات مربوطة بمعرّف السنتر حتى لا تتسرب بين السناتر
  const [templateEdits, setTemplateEdits] = useState<{
    forTeacher: string
    map: Partial<Record<WhatsappMessageKind, Partial<TemplateForm>>>
  }>({ forTeacher: '', map: {} })
  const [testKind, setTestKind] = useState<WhatsappMessageKind>('arrival_notice')

  const config = configQ.data ?? null
  const teacherPhone = teacher.status === 'ready' ? (teacher.teacher?.phone ?? '') : ''

  useEffect(() => {
    if (!configQ.data || hydratedFor === teacherId) return
    setEnabled(configQ.data.enabled)
    setPhoneNumberId(configQ.data.phone_number_id)
    setWabaId(configQ.data.waba_id)
    setTemplateName(configQ.data.template_name || 'otp_code')
    setTemplateLang(configQ.data.template_language || 'ar')
    setAutoSendEnabled(configQ.data.auto_send_enabled ?? false)
    setAutoSendQuota(String(configQ.data.auto_send_daily_quota ?? 100))
    setHydratedFor(teacherId)
  }, [configQ.data, hydratedFor, teacherId])

  useEffect(() => {
    if (
      teacher.status !== 'ready' ||
      !teacherId ||
      verifyPhoneHydratedFor === teacherId
    )
      return
    setVerifyPhone(teacherPhone)
    setVerifyPhoneHydratedFor(teacherId)
  }, [teacher.status, teacherId, teacherPhone, verifyPhoneHydratedFor])

  const savedTemplateForm = (
    def: (typeof WHATSAPP_TEMPLATE_CATALOG)[number],
  ): TemplateForm => {
    const row = templatesQ.data?.find((r) => r.kind === def.kind)
    return {
      name: row?.template_name || def.defaultName,
      lang: row?.language || 'ar',
      status: row && isWhatsappTemplateStatus(row.status) ? row.status : 'unknown',
    }
  }
  const templateFormFor = (
    def: (typeof WHATSAPP_TEMPLATE_CATALOG)[number],
  ): TemplateForm => ({
    ...savedTemplateForm(def),
    ...(templateEdits.forTeacher === teacherId ? (templateEdits.map[def.kind] ?? {}) : {}),
  })

  if (!isOwner || !teacherId) return null

  const tokenSaved = Boolean(config?.token_updated_at)
  const configComplete = Boolean(config?.enabled && config?.phone_number_id && tokenSaved)
  // قطع التفعيل الناقصة من حالة النموذج الحالية (بوابة opt-in الصريحة)
  const missingPieces = missingOptInPieces({ phoneNumberId, tokenSaved })
  const statusText = !config
    ? t('settings.waStatusNotConfigured')
    : configComplete
      ? t('settings.waStatusActive')
      : t('settings.waStatusIncomplete')

  const handleSave = async () => {
    setMsg(null)
    setFormError(null)
    // حصة الإرسال الآلي: عدد صحيح موجب — أي إدخال فاسد يرجع للافتراضي
    const autoQuota = Math.max(1, Math.floor(Number(autoSendQuota)) || 100)
    try {
      if (enabled && missingPieces.length > 0) {
        // تفعيل بلا تهيئة مكتملة: تُحفَظ الحقول وحدها ويبقى التفعيل
        // مطفأً مع شرح الناقص — لا حالة «مفعّل» كاذبة تُحفَظ صامتاً
        await upsert.mutateAsync({
          enabled: false,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          template_name: templateName,
          template_language: templateLang,
          auto_send_enabled: autoSendEnabled,
          auto_send_daily_quota: autoQuota,
        })
        setEnabled(false)
        setMsg(t('settings.waEnableNotSaved'))
        return
      }
      await upsert.mutateAsync({
        enabled,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        template_name: templateName,
        template_language: templateLang,
        auto_send_enabled: autoSendEnabled,
        auto_send_daily_quota: autoQuota,
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

  const setTemplateForm = (kind: WhatsappMessageKind, patch: Partial<TemplateForm>) => {
    setTemplateEdits((prev) => {
      const base = prev.forTeacher === teacherId ? prev.map : {}
      return {
        forTeacher: teacherId,
        map: { ...base, [kind]: { ...(base[kind] ?? {}), ...patch } },
      }
    })
  }

  const handleSaveTemplates = async () => {
    setMsg(null)
    setFormError(null)
    try {
      // حفظ الأنواع المعدّلة فقط — الأنواع البكر لا تُنشئ صفوفاً عبثاً
      for (const def of WHATSAPP_TEMPLATE_CATALOG) {
        const form = templateFormFor(def)
        const saved = savedTemplateForm(def)
        if (form.name === saved.name && form.lang === saved.lang && form.status === saved.status) {
          continue
        }
        await upsertTemplate.mutateAsync({
          kind: def.kind,
          data: { template_name: form.name, language: form.lang, status: form.status },
        })
      }
      setTemplateEdits({ forTeacher: teacherId, map: {} })
      setMsg(t('settings.waMsgSavedMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waSaveFailed'))
    }
  }

  const handleSendMessageTest = async () => {
    setMsg(null)
    setFormError(null)
    const def = templateDef(testKind)
    try {
      await sendMessage.mutateAsync({
        kind: testKind,
        toPhone: teacherPhone,
        params: def.paramSampleKeys.map((k) => t(k)),
      })
      setMsg(t('settings.waMsgTestSentMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.waMsgTestFailed'))
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

  // حفظ رقم التأكيد: نفس مسار حفظ الملف الشخصي في SettingsPage —
  // الاسم والصورة يُحملان كما هما، والرقم وحده يتغيّر (E.164).
  const handleSaveVerifyPhone = async () => {
    setMsg(null)
    setFormError(null)
    const e164 = normalizeEgyptianPhone(verifyPhone)
    if (!e164) {
      setFormError(t('settings.waVerifyInvalidPhone'))
      return
    }
    const displayName =
      teacher.status === 'ready'
        ? (teacher.teacher?.display_name ?? '').trim()
        : ''
    if (!displayName) {
      setFormError(t('settings.waVerifySaveFailed'))
      return
    }
    try {
      await updateOwnProfile.mutateAsync({
        display_name: displayName,
        phone: e164,
        avatar_url:
          teacher.status === 'ready'
            ? (teacher.teacher?.avatar_url ?? null)
            : null,
      })
      setMsg(t('settings.waVerifySavedMsg'))
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t('settings.waVerifySaveFailed'),
      )
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
            {enabled && missingPieces.length > 0 && (
              <div className="text-[13px] bg-soft rounded-xl px-3 py-2">
                <p className="mt-0 mb-1 font-semibold">{t('settings.waEnableMissingTitle')}</p>
                <ul className="list-disc ps-5 mt-0 mb-0">
                  {missingPieces.map((piece) => (
                    <li key={piece}>{t(OPT_IN_PIECE_KEYS[piece])}</li>
                  ))}
                </ul>
              </div>
            )}
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

          {/* ٥ب) رقم التأكيد عبر واتساب (3A-905 — تجهيز فقط، يظهر
              بعلم البناء وحده): الرقم المحفوظ هنا هو رقم الملف
              الشخصي نفسه — لا إرسال ولا تفعيل من هذه البطاقة؛ التفعيل
              بيد أدمن المنصة عبر الاستحقاق (0060) بعد اكتمال أصول Meta. */}
          {WHATSAPP_VERIFICATION_CHANNEL_ENABLED && (
            <>
              <h3 className="type-section mt-6 mb-2 text-[15px]">
                {t('settings.waVerifyTitle')}
              </h3>
              <p className="text-muted text-[13px] mt-0 mb-3">
                {t('settings.waVerifyIntro')}
              </p>
              <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3">
                {teacherPhone
                  ? t('settings.waVerifyCurrent', { phone: teacherPhone })
                  : t('settings.waVerifyNoPhone')}
              </p>
              <div className="flex flex-wrap items-end gap-2 mb-5">
                <div className="grow min-w-[200px]">
                  <Field label={t('settings.waVerifyPhoneLabel')}>
                    <TextInput
                      dir="ltr"
                      inputMode="tel"
                      value={verifyPhone}
                      onChange={(e) => setVerifyPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      autoComplete="tel"
                    />
                  </Field>
                </div>
                <Button
                  variant="soft"
                  onClick={handleSaveVerifyPhone}
                  disabled={updateOwnProfile.isPending}
                >
                  {updateOwnProfile.isPending
                    ? t('settings.waVerifySaving')
                    : t('settings.waVerifySave')}
                </Button>
              </div>
            </>
          )}

          {/* ٦) إشعارات أولياء الأمور — قوالب Utility + سجل الرسائل (0045) */}
          <h3 className="type-section mt-6 mb-2 text-[15px]">{t('settings.waMsgTitle')}</h3>
          <p className="text-muted text-[13px] mt-0 mb-2">{t('settings.waMsgIntro')}</p>
          <p className="text-muted text-[12.5px] mt-0 mb-3">{t('settings.waMsgVarsNote')}</p>
          {templatesQ.isLoading ? (
            <p className="text-muted text-[13.5px] mb-0">{t('settings.waLoading')}</p>
          ) : (
            <>
              <div className="grid gap-3 mb-3">
                {WHATSAPP_TEMPLATE_CATALOG.map((def) => {
                  const form = templateFormFor(def)
                  return (
                    <div key={def.kind} className="border border-border rounded-xl p-3">
                      <p className="mt-0 mb-1 font-semibold text-[14px]">{t(def.labelKey)}</p>
                      <p className="text-[13px] bg-soft rounded-lg px-2 py-1.5 mt-0 mb-2">
                        {t(def.bodyKey)}
                      </p>
                      <p className="text-muted text-[12px] mt-0 mb-2">
                        {def.paramLabelKeys.map((k, i) => `${i + 1}- ${t(k)}`).join(' · ')}
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Field label={t('settings.waMsgNameLabel')}>
                          <TextInput
                            dir="ltr"
                            value={form.name}
                            onChange={(e) => setTemplateForm(def.kind, { name: e.target.value })}
                            autoComplete="off"
                          />
                        </Field>
                        <Field label={t('settings.waMsgLangLabel')}>
                          <TextInput
                            dir="ltr"
                            value={form.lang}
                            onChange={(e) => setTemplateForm(def.kind, { lang: e.target.value })}
                            autoComplete="off"
                          />
                        </Field>
                      </div>
                      <Field label={t('settings.waMsgStatusLabel')}>
                        <Select
                          value={form.status}
                          onChange={(e) => {
                            if (isWhatsappTemplateStatus(e.target.value)) {
                              setTemplateForm(def.kind, { status: e.target.value })
                            }
                          }}
                        >
                          {(Object.keys(TEMPLATE_STATUS_KEYS) as WhatsappTemplateStatus[]).map(
                            (s) => (
                              <option key={s} value={s}>
                                {t(TEMPLATE_STATUS_KEYS[s])}
                              </option>
                            ),
                          )}
                        </Select>
                      </Field>
                    </div>
                  )
                })}
              </div>
              <Button
                variant="soft"
                onClick={handleSaveTemplates}
                disabled={upsertTemplate.isPending}
                className="mb-5"
              >
                {upsertTemplate.isPending ? t('settings.waMsgSaving') : t('settings.waMsgSave')}
              </Button>

              <div className="flex flex-wrap items-end gap-2 mb-5">
                <div className="grow min-w-[180px]">
                  <Field label={t('settings.waMsgTestKindLabel')}>
                    <Select
                      value={testKind}
                      onChange={(e) => {
                        if (isWhatsappMessageKind(e.target.value)) setTestKind(e.target.value)
                      }}
                    >
                      {WHATSAPP_TEMPLATE_CATALOG.map((def) => (
                        <option key={def.kind} value={def.kind}>
                          {t(def.labelKey)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button
                  variant="soft"
                  onClick={handleSendMessageTest}
                  disabled={
                    !configComplete ||
                    !teacherPhone ||
                    templateFormFor(templateDef(testKind)).status !== 'ready' ||
                    sendMessage.isPending
                  }
                >
                  {sendMessage.isPending ? t('settings.waMsgTestSending') : t('settings.waMsgTestSend')}
                </Button>
              </div>

              {/* الإرسال الآلي (0073 — المهمة 24): استعداد يُحفظ مع
                  نموذج الإعداد نفسه؛ لا إرسال قبل فتح المنصة (ق4) */}
              <h3 className="type-section mt-0 mb-2 text-[15px]">{t('settings.waAutoTitle')}</h3>
              <p className="text-muted text-[13px] mt-0 mb-3">{t('settings.waAutoIntro')}</p>
              <div className="grid gap-3 mb-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-6 h-6 accent-primary"
                    checked={autoSendEnabled}
                    onChange={(e) => setAutoSendEnabled(e.target.checked)}
                  />
                  <span className="text-[14.5px] font-semibold">
                    {t('settings.waAutoEnabledLabel')}
                  </span>
                </label>
                <p className="text-muted text-[12.5px] mt-0 mb-0">
                  {t('settings.waAutoEnabledHint')}
                </p>
                <Field label={t('settings.waAutoQuotaLabel')}>
                  <TextInput
                    dir="ltr"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={autoSendQuota}
                    onChange={(e) => setAutoSendQuota(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <p className="text-muted text-[12.5px] mt-0 mb-0">{t('settings.waAutoQuotaHint')}</p>
              </div>
              <Button
                variant="soft"
                onClick={handleSave}
                disabled={upsert.isPending}
                className="mb-5"
              >
                {upsert.isPending ? t('settings.waSaving') : t('settings.waSave')}
              </Button>

              <h3 className="type-section mt-0 mb-2 text-[15px]">{t('settings.waLogTitle')}</h3>
              {messageLogQ.data && messageLogQ.data.length === 0 && (
                <p className="text-muted text-[13px] mt-0 mb-0">{t('settings.waLogEmpty')}</p>
              )}
              <div className="grid gap-2">
                {messageLogQ.data?.map((row) => (
                  <div key={row.id} className="text-[13px] bg-soft rounded-xl px-3 py-2">
                    <span className="font-semibold">
                      {isWhatsappMessageKind(row.kind)
                        ? t(templateDef(row.kind).labelKey)
                        : row.template_name}
                    </span>
                    {' — '}
                    <span dir="ltr">{maskPhoneDisplay(row.recipient_phone)}</span>
                    {' — '}
                    <span>{t(MESSAGE_STATUS_KEYS[logStatusOf(row.status)])}</span>
                    {' — '}
                    <span>
                      {row.source === 'auto'
                        ? t('settings.waLogSourceAuto')
                        : t('settings.waLogSourceManual')}
                    </span>
                    {' — '}
                    <span className="text-muted">{formatDateTimeAr(row.created_at)}</span>
                    {row.status === 'failed' && (row.error_message || row.error_code) && (
                      <p className="text-muted text-[12.5px] mt-1 mb-0">
                        {t('settings.waLogErrorLabel')}:{' '}
                        <span dir="ltr">{row.error_message ?? row.error_code}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}
