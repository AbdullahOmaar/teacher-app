// ============================================================================
// تطبيق المدرس — Edge Function: assistant-chat (Phase 2 T6 — خطة ب)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// التصميم الكامل: docs/PHASE2-T6-PREP.md ‏(§2 المدخلات + §4 خطة ب)
// ومهاجرة 0048 (جدول assistant_runs + دوال التأكيد المحروسة).
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة: المستدعي مستخدم حقيقي
// بـ JWT من التطبيق. الأسرار (أسماء فقط): ASSISTANT_ENABLED (Kill switch
// المنصة — غير مضبوط = OFF)، ‏SUPABASE_URL، ومفتاح المنصة المحقون الجديد
// SUPABASE_PUBLISHABLE_KEYS لعميل المستدعي (مدخل default — وبرجوع للمحفوظ
// القديم حتى يُعطَّل، نمط ترحيل المفاتيح 3A-695).
//
// ⚠️ لا عميل إدارة (service role) في هذه الدالة إطلاقاً — بقاعدة التجهيز
// §2-2: المساعد يعمل بهوية المستدعي دائماً؛ قراءاته وكتاباته بعميل
// بتوكن المستدعي فتخضع لـ RLS، وكتابات سجل التشغيل عبر دوال RPC
// محروسة (0048) بنفس التوكن. أي احتياج مستقبلي لمفتاح إدارة يُرفض
// تصميمياً لا يُمرَّر.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  DeterministicTestPlanner,
  handleAssistantChat,
  type AddStudentPayload,
  type AssistantDeps,
  type AssistantEnv,
  type CallerContext,
  type ConfirmOutcome,
} from './core.ts'

// مفتاح المشروع القابل للنشر — تحقنه المنصة JSON بأسمائه في
// SUPABASE_PUBLISHABLE_KEYS. مفتاح النوع هو 'default'، وبغيابه نرجع
// للمحفوظ القديم المقابل (صالح حتى تعطيل القديم).
function injectedKeys(envName: string): Record<string, string> {
  try {
    const raw = Deno.env.get(envName)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) out[name] = value
    }
    return out
  } catch {
    return {} // بيئة بلا مفاتيح جديدة — يبقى الرجوع للقديم وحده
  }
}
const PUBLISHABLE_KEY = injectedKeys('SUPABASE_PUBLISHABLE_KEYS')['default'] ??
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''

/** عميل بتوكن المستدعي: كل قراءة وكتابة في هذه الدالة تمر به فقط */
function callerClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    PUBLISHABLE_KEY,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

function makeDeps(req: Request): AssistantDeps {
  const db = () => callerClient(req)
  return {
    getUserId: async (r) => {
      const authHeader = r.headers.get('Authorization') ?? ''
      if (!authHeader) return null
      const { data, error } = await callerClient(r).auth.getUser()
      if (error || !data.user) return null
      return data.user.id
    },
    getCallerContext: async (teacherId, userId) => {
      const client = db()
      const { data: owned } = await client
        .from('teachers')
        .select('id')
        .eq('id', teacherId)
        .eq('owner_user_id', userId)
        .maybeSingle()
      if (owned) return { role: 'owner', permissions: {} } satisfies CallerContext
      const { data: member } = await client
        .from('teacher_members')
        .select('permissions')
        .eq('teacher_id', teacherId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle()
      if (!member) return null
      const raw = (member as { permissions?: unknown }).permissions
      const permissions: Record<string, boolean> = {}
      if (typeof raw === 'object' && raw !== null) {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof v === 'boolean') permissions[k] = v
        }
      }
      return { role: 'assistant', permissions } satisfies CallerContext
    },
    fetchBalances: async (teacherId) => {
      const { data, error } = await db()
        .from('invoice_balances')
        .select('invoice_id, student_id, group_id, period_month, total, paid, balance')
        .eq('teacher_id', teacherId)
      if (error) throw new Error(`balances fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        invoice_id: String(r.invoice_id),
        student_id: String(r.student_id),
        group_id: String(r.group_id),
        period_month: String(r.period_month),
        total: Number(r.total) || 0,
        paid: Number(r.paid) || 0,
        balance: Number(r.balance) || 0,
      }))
    },
    fetchStudents: async (teacherId) => {
      const { data, error } = await db()
        .from('students')
        .select('id, name')
        .eq('teacher_id', teacherId)
      if (error) throw new Error(`students fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name) }))
    },
    fetchAttendance: async (teacherId) => {
      const { data, error } = await db()
        .from('attendance')
        .select('student_id, status')
        .eq('teacher_id', teacherId)
      if (error) throw new Error(`attendance fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        student_id: String(r.student_id),
        status: r.status === null ? null : String(r.status),
      }))
    },
    fetchPayments: async (teacherId, from, to) => {
      const { data, error } = await db()
        .from('payments')
        .select('amount, method, paid_on')
        .eq('teacher_id', teacherId)
        .gte('paid_on', from)
        .lte('paid_on', to)
      if (error) throw new Error(`payments fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        amount: Number(r.amount) || 0,
        method: String(r.method),
        paid_on: String(r.paid_on),
      }))
    },
    fetchGroup: async (teacherId, groupId) => {
      const { data, error } = await db()
        .from('groups')
        .select('id, name')
        .eq('teacher_id', teacherId)
        .eq('id', groupId)
        .maybeSingle()
      if (error || !data) return null
      return { id: String(data.id), name: String(data.name) }
    },
    insertStudent: async (teacherId: string, payload: AddStudentPayload) => {
      const client = db()
      const { data, error } = await client
        .from('students')
        .insert({
          teacher_id: teacherId,
          name: payload.name,
          phone: payload.phone ?? null,
          guardian_name: payload.guardian_name ?? null,
          guardian_phone: payload.guardian_phone ?? null,
          grade: payload.grade ?? null,
        })
        .select('id')
        .single()
      if (error || !data) {
        throw new Error(`student insert failed: ${error?.message ?? 'no row returned'}`)
      }
      const studentId = String(data.id)
      const { error: enrollError } = await client
        .from('enrollments')
        .insert({ teacher_id: teacherId, student_id: studentId, group_id: payload.group_id })
      if (enrollError) {
        throw new Error(`enrollment insert failed: ${enrollError.message}`)
      }
      return { student_id: studentId }
    },
    beginRead: async (teacherId, tool, request, result) => {
      const { data, error } = await db().rpc('assistant_begin_read', {
        p_teacher_id: teacherId,
        p_tool: tool,
        p_request: request,
        p_result: result,
      })
      if (error || typeof data !== 'string') return null
      return data
    },
    createProposal: async (teacherId, tool, request, payload, payloadHash) => {
      const { data, error } = await db().rpc('assistant_create_proposal', {
        p_teacher_id: teacherId,
        p_tool: tool,
        p_request: request,
        p_payload: payload,
        p_payload_hash: payloadHash,
      })
      if (error || typeof data !== 'object' || data === null) return null
      const row = data as Record<string, unknown>
      if (typeof row.id !== 'string' || typeof row.payload_hash !== 'string') return null
      return {
        id: row.id,
        payload_hash: row.payload_hash,
        expires_at: typeof row.expires_at === 'string' ? row.expires_at : '',
      }
    },
    confirmProposal: async (runId, payloadHash): Promise<ConfirmOutcome> => {
      const { data, error } = await db().rpc('assistant_confirm_proposal', {
        p_run_id: runId,
        p_payload_hash: payloadHash,
      })
      if (error) return { ok: false, error: error.message }
      const row = data as Record<string, unknown>
      return {
        ok: true,
        teacher_id: String(row.teacher_id ?? ''),
        tool: String(row.tool ?? ''),
        payload: (row.payload ?? {}) as Record<string, unknown>,
      }
    },
    completeRun: async (runId, success, result, error) => {
      const { error: rpcError } = await db().rpc('assistant_complete_run', {
        p_run_id: runId,
        p_success: success,
        p_result: result,
        p_error: error,
      })
      return !rpcError
    },
    cancelRun: async (runId, reason) => {
      const { error } = await db().rpc('assistant_cancel_run', {
        p_run_id: runId,
        p_reason: reason,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },
    now: () => Date.now(),
  }
}

Deno.serve((req: Request) => {
  const env: AssistantEnv = {
    ASSISTANT_ENABLED: Deno.env.get('ASSISTANT_ENABLED'),
  }
  // المخطط المركّب في هذا البناء هو البديل الاختباري الحتمي — ليس نموذجاً.
  // مخطط المزوّد الحقيقي يركب هنا بعد حسم ق5 عند المالك.
  const planner = new DeterministicTestPlanner()
  return handleAssistantChat(req, env, makeDeps(req), planner, (msg) => console.log(msg))
})
