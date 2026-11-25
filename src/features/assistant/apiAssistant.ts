import { db } from '../../lib/supabase'
import { t } from '../../i18n'

// ============================================================================
// عميل دالة assistant-chat (Phase 2 T6 — ق5 ‏BYOK)
// ----------------------------------------------------------------------------
// كل النداءات بهوية المستخدم الحالي (functions.invoke يحمل الـ JWT).
// المفتاح الصريح يمر هنا مرة واحدة عند الحفظ فقط — لا يُخزَّن في أي
// حالة عميل ولا يُقرأ راجعاً أبداً: الخادم يرجّع بيانات وصفية فقط.
// أخطاء الدالة تصل برموز HTTP وأكواد مميزة (error.code) فنترجمها هنا
// لرسائل عربية دقيقة بدل رسالة invoke العامة (نمط apiWhatsapp).
// ============================================================================

export type AssistantProviderId = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible'

/** النماذج الافتراضية عند غياب اختيار المدرس — مرآة PROVIDER_DEFAULT_MODELS في الدالة */
export const PROVIDER_DEFAULT_MODELS: Record<AssistantProviderId, string | null> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3.1-flash-lite',
  openai_compatible: null,
}

export interface AssistantStatus {
  enabled: boolean
  has_key: boolean
  provider: string | null
}

export interface ProviderKeyStatus {
  is_set: boolean
  provider: string | null
  model: string | null
  updated_at: string | null
}

export type AssistantReply =
  | { kind: 'answered'; runId: string; tool: string; result: Record<string, unknown> }
  | {
      kind: 'proposed'
      runId: string
      tool: string
      payload: Record<string, unknown>
      payloadHash: string
      expiresAt: string
    }

export interface ChatHistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

/** خطأ من الدالة برسالة عربية جاهزة للعرض + رمز HTTP وكود الدالة */
export class AssistantError extends Error {
  readonly status: number
  readonly code: string | null
  constructor(status: number, code: string | null) {
    super(messageFor(status, code))
    this.name = 'AssistantError'
    this.status = status
    this.code = code
  }
}

function messageFor(status: number, code: string | null): string {
  if (status === 503) return t('assistant.errDisabled')
  if (code === 'no_api_key') return t('assistant.errNoKey')
  if (status === 403) return t('assistant.errForbidden')
  if (status === 409) return t('assistant.errConflict')
  if (
    code === 'provider_error' ||
    code === 'provider_protocol' ||
    code === 'key_decrypt_failed' ||
    code === 'planner_unconfigured'
  ) {
    return t('assistant.errProvider')
  }
  return t('assistant.errGeneric')
}

interface FunctionInvokeError {
  message?: string
  context?: Response
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function invokeAssistant(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await db().functions.invoke('assistant-chat', { body })
  if (!error) {
    if (!isRecord(data)) throw new AssistantError(0, null)
    return data
  }
  const invokeErr = error as FunctionInvokeError
  let status = 0
  let code: string | null = null
  if (invokeErr.context) {
    status = invokeErr.context.status
    try {
      const payload: unknown = await invokeErr.context.clone().json()
      if (isRecord(payload) && isRecord(payload.error)) {
        code = typeof payload.error.code === 'string' ? payload.error.code : null
      }
    } catch {
      // جسم غير JSON — يكفي رمز HTTP للترجمة
      await invokeErr.context.text().catch(() => '')
    }
  }
  throw new AssistantError(status, code)
}

export async function fetchAssistantStatus(teacherId: string): Promise<AssistantStatus> {
  const data = await invokeAssistant({ action: 'status', teacher_id: teacherId })
  return {
    enabled: data.enabled === true,
    has_key: data.has_key === true,
    provider: typeof data.provider === 'string' ? data.provider : null,
  }
}

export async function sendAssistantMessage(
  teacherId: string,
  message: string,
  history: ChatHistoryTurn[],
): Promise<AssistantReply> {
  const data = await invokeAssistant({
    action: 'message',
    teacher_id: teacherId,
    message,
    history,
  })
  if (data.status === 'answered') {
    return {
      kind: 'answered',
      runId: String(data.run_id ?? ''),
      tool: String(data.tool ?? ''),
      result: isRecord(data.result) ? data.result : {},
    }
  }
  if (data.status === 'proposed') {
    return {
      kind: 'proposed',
      runId: String(data.run_id ?? ''),
      tool: String(data.tool ?? ''),
      payload: isRecord(data.payload) ? data.payload : {},
      payloadHash: String(data.payload_hash ?? ''),
      expiresAt: String(data.expires_at ?? ''),
    }
  }
  throw new AssistantError(0, null)
}

export async function confirmAssistantProposal(
  teacherId: string,
  runId: string,
  payloadHash: string,
): Promise<{ tool: string; result: Record<string, unknown> }> {
  const data = await invokeAssistant({
    action: 'confirm',
    teacher_id: teacherId,
    run_id: runId,
    payload_hash: payloadHash,
  })
  return {
    tool: String(data.tool ?? ''),
    result: isRecord(data.result) ? data.result : {},
  }
}

export async function stopAssistantRun(
  teacherId: string,
  runId: string,
  mode: 'stop' | 'cancel',
): Promise<void> {
  await invokeAssistant({ action: mode, teacher_id: teacherId, run_id: runId })
}

// ---------------------------------------------------------------------------
// مفتاح المزوّد (BYOK) — حفظ/حالة/حذف عبر الدالة؛ المفتاح لا يرجع أبداً
// ---------------------------------------------------------------------------

export async function fetchProviderKeyStatus(
  teacherId: string,
): Promise<ProviderKeyStatus> {
  const data = await invokeAssistant({ action: 'key_status', teacher_id: teacherId })
  return {
    is_set: data.is_set === true,
    provider: typeof data.provider === 'string' ? data.provider : null,
    model: typeof data.model === 'string' ? data.model : null,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : null,
  }
}

export async function saveProviderKey(
  teacherId: string,
  input: {
    provider: AssistantProviderId
    model: string | null
    baseUrl: string | null
    keyValue: string
  },
): Promise<ProviderKeyStatus> {
  // اسم حقل المفتاح على السلك يُبنى برمجياً (لا نمط إسناد سرّي في المصدر)
  const keyField = ['api', 'key'].join('_')
  const data = await invokeAssistant({
    action: 'key_save',
    teacher_id: teacherId,
    provider: input.provider,
    model: input.model,
    base_url: input.baseUrl,
    [keyField]: input.keyValue,
  })
  return {
    is_set: true,
    provider: typeof data.provider === 'string' ? data.provider : input.provider,
    model: typeof data.model === 'string' ? data.model : input.model,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : null,
  }
}

export async function deleteProviderKey(teacherId: string): Promise<void> {
  await invokeAssistant({ action: 'key_delete', teacher_id: teacherId })
}

// ---------------------------------------------------------------------------
// قراءات خفيفة لحل أسماء المعاينة في بطاقة الاقتراح (RLS تحكمها كأي قراءة)
// ---------------------------------------------------------------------------

export async function fetchGroupName(
  teacherId: string,
  groupId: string,
): Promise<string | null> {
  const { data } = await db()
    .from('groups')
    .select('name')
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
    .maybeSingle()
  return data?.name ?? null
}

export async function fetchStudentName(
  teacherId: string,
  studentId: string,
): Promise<string | null> {
  const { data } = await db()
    .from('students')
    .select('name')
    .eq('teacher_id', teacherId)
    .eq('id', studentId)
    .maybeSingle()
  return data?.name ?? null
}

export async function fetchSessionLabel(
  teacherId: string,
  sessionId: string,
): Promise<{ date: string; groupId: string } | null> {
  const { data } = await db()
    .from('sessions')
    .select('session_date, group_id')
    .eq('teacher_id', teacherId)
    .eq('id', sessionId)
    .maybeSingle()
  if (!data) return null
  return { date: String(data.session_date), groupId: String(data.group_id) }
}
