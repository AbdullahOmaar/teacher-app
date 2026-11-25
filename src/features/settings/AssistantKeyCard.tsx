import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, KeyRound, Save, Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatDateTimeAr } from '../../lib/format'
import { t, type I18nKey } from '../../i18n'
import {
  PROVIDER_DEFAULT_MODELS,
  deleteProviderKey,
  fetchProviderKeyStatus,
  saveProviderKey,
  type AssistantProviderId,
} from '../assistant/apiAssistant'

const PROVIDER_OPTIONS: { id: AssistantProviderId; labelKey: I18nKey }[] = [
  { id: 'openai', labelKey: 'assistant.keyProviderOpenai' },
  { id: 'anthropic', labelKey: 'assistant.keyProviderAnthropic' },
  { id: 'gemini', labelKey: 'assistant.keyProviderGemini' },
  { id: 'openai_compatible', labelKey: 'assistant.keyProviderCompatible' },
]

function isProviderId(v: string): v is AssistantProviderId {
  return PROVIDER_OPTIONS.some((o) => o.id === v)
}

/**
 * بطاقة «مفتاح مزوّد الذكاء» في الإعدادات (Phase 2 T6 — ق5 ‏BYOK،
 * مهاجرة 0049). مالك الحساب فقط — نفس مستوى الإعدادات المالية.
 *
 * المفتاح حقل كلمة مرور للكتابة فقط: يُرسل لدالة assistant-chat
 * فيُشفَّر خادمياً (AES-GCM بمفتاح تشفير المنصة) ويُخزَّن مشفّراً في
 * teacher_ai_keys — ولا توجد أي قراءة راجعة له في العميل إطلاقاً
 * (الحالة المعروضة: «محفوظ بتاريخ…» + المزوّد + النموذج فقط).
 * إدخال جديد يستبدل القديم، والإزالة بخطوتي تأكيد كتوكن واتساب.
 */
export function AssistantKeyCard() {
  const teacher = useCurrentTeacher()
  const qc = useQueryClient()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'

  const statusQ = useQuery({
    queryKey: ['assistant-key-status', teacherId],
    queryFn: () => fetchProviderKeyStatus(teacherId),
    enabled: isOwner && Boolean(teacherId),
    retry: false,
  })

  const [provider, setProvider] = useState<AssistantProviderId>('gemini')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  // المفتاح: قيمة عابرة في الذاكرة فقط — تُمسح بعد الحفظ ولا تُعاد قراءتها
  const [keyInput, setKeyInput] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  if (!isOwner || !teacherId) return null

  const status = statusQ.data ?? null
  const isSet = Boolean(status?.is_set)
  const defaultModel = PROVIDER_DEFAULT_MODELS[provider]
  const savedProviderLabel = status?.provider
    ? (PROVIDER_OPTIONS.find((o) => o.id === status.provider)?.labelKey ?? null)
    : null

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['assistant-key-status', teacherId] })

  const handleSave = async () => {
    setMsg(null)
    setFormError(null)
    const candidate = keyInput.trim()
    if (candidate.length < 8) {
      setFormError(t('assistant.keySaveFailed'))
      return
    }
    if (provider === 'openai_compatible') {
      if (!baseUrl.trim().startsWith('https://') || !model.trim()) {
        setFormError(t('assistant.keySaveFailed'))
        return
      }
    }
    setSaving(true)
    try {
      await saveProviderKey(teacherId, {
        provider,
        model: model.trim() ? model.trim() : null,
        baseUrl: provider === 'openai_compatible' ? baseUrl.trim() : null,
        keyValue: candidate,
      })
      setKeyInput('')
      setConfirmRemove(false)
      await refresh()
      setMsg(t('assistant.keySavedMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('assistant.keySaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setMsg(null)
    setFormError(null)
    setRemoving(true)
    try {
      await deleteProviderKey(teacherId)
      setConfirmRemove(false)
      await refresh()
      setMsg(t('assistant.keyRemovedMsg'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('assistant.keySaveFailed'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
        <KeyRound size={22} className="text-primary" /> {t('assistant.keyTitle')}
      </h2>
      <p className="text-muted text-[13.5px] mt-0 mb-3">{t('assistant.keyIntro')}</p>

      <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
        {isSet && <CheckCircle2 size={16} className="text-primary shrink-0" />}
        <span>
          {t('assistant.keyStatusLabel')}:{' '}
          <strong>{isSet ? t('assistant.keyStatusSet') : t('assistant.keyStatusUnset')}</strong>
          {isSet && savedProviderLabel && (
            <>
              {' — '}
              {t(savedProviderLabel)}
              {status?.model ? ` · ${status.model}` : ''}
            </>
          )}
        </span>
      </p>
      {isSet && status?.updated_at && (
        <p className="text-muted text-[12.5px] mt-0 mb-3">
          {t('assistant.keySavedAt', { date: formatDateTimeAr(status.updated_at) })}
          {' — '}
          {t('assistant.keyWriteOnlyNote')}
        </p>
      )}

      {formError && <FormError message={formError} />}
      {msg && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3" role="status">
          {msg}
        </p>
      )}

      {statusQ.isLoading ? (
        <p className="text-muted text-[13.5px] mb-0">{t('assistant.keyLoading')}</p>
      ) : (
        <>
          <div className="grid gap-3 mb-3">
            <Field label={t('assistant.keyProviderLabel')}>
              <Select
                value={provider}
                onChange={(e) => {
                  if (isProviderId(e.target.value)) setProvider(e.target.value)
                }}
              >
                {PROVIDER_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </Select>
            </Field>
            {provider === 'openai_compatible' && (
              <Field label={t('assistant.keyBaseUrlLabel')}>
                <TextInput
                  dir="ltr"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://…/v1"
                  autoComplete="off"
                />
              </Field>
            )}
            <Field label={t('assistant.keyModelLabel')}>
              <TextInput
                dir="ltr"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={defaultModel ?? ''}
                autoComplete="off"
              />
            </Field>
            <p className="text-muted text-[12.5px] mt-0 mb-0">
              {defaultModel
                ? t('assistant.keyModelHint', { model: defaultModel })
                : t('assistant.keyModelRequiredHint')}
            </p>
            <Field label={t('assistant.keyValueLabel')}>
              <TextInput
                type="password"
                dir="ltr"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                placeholder="sk-…"
              />
            </Field>
            {!isSet && (
              <p className="text-muted text-[12.5px] mt-0 mb-0">
                {t('assistant.keyWriteOnlyNote')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSave()} disabled={!keyInput.trim() || saving}>
              <Save size={18} />
              {saving ? t('assistant.keySaving') : t('assistant.keySave')}
            </Button>
            {isSet && (
              <Button
                variant="ghost"
                onClick={() => void handleRemove()}
                disabled={removing || saving}
              >
                <Trash2 size={16} />
                {confirmRemove ? t('assistant.keyRemoveConfirm') : t('assistant.keyRemove')}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
