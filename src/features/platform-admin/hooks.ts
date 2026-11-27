import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchIsPlatformAdmin, fetchPlatformOverview } from './api'
import {
  deleteAnnouncement,
  fetchAdminTickets,
  fetchAnnouncementsAdmin,
  publishAnnouncement,
  setTicketStatus,
  type AnnouncementKind,
} from './announcements'
import { fetchEffectiveEntitlements } from './entitlements'
import { fetchTicketThread, replyToTicket } from '../support/api'
import type { TicketStatus } from '../support/api'
import {
  addAllowlistEntry,
  fetchAccountOverrides,
  fetchAllowlist,
  fetchAuditLog,
  fetchPlatformIndicators,
  fetchPlatformWorkspaces,
  fetchRegistrationOpen,
  removeAllowlistEntry,
  revokeAccountOverride,
  setAccountActivated,
  setAccountOverride,
  setRegistrationOpen,
  setSubscriptionPlan,
  type PlanSlug,
} from './panel'
import { fetchMySubscription } from './subscription'
import { fetchMfaStatus, type MfaStatus } from './mfa'
import {
  applyRoleTemplate,
  createRoleTemplate,
  fetchRoleTemplates,
  updateRoleTemplate,
  type TemplateEntitlements,
} from './templates'
import {
  ensureCurrentDevice,
  fetchAdminDevices,
  logDeviceAudit,
  revokeAdminDevice,
  trustAdminDevice,
} from './devices'
import { fetchUsageSummary } from './usage'

export const PLATFORM_ADMIN = 'platform-admin'

/**
 * فحص نوع المستخدم الحالي (أدمن منصة أم لا) — تستخدمه بوابة الحراسة.
 * حتى تطبيق 0055 يفشل الاستعلام (الدالة غائبة) فيبقى isError ظاهراً
 * للبوابة فتعرض الرفض — تدهور معلن ومقصود: لا دخول بلا إثبات.
 */
export function useIsPlatformAdmin(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'is-admin'],
    enabled,
    queryFn: fetchIsPlatformAdmin,
  })
}

/**
 * حالة التحقق بخطوتين TOTP للمستخدم الحالي (مهمة 23 — 0067) —
 * تُفعَّل بعد ثبوت صفة الأدمن فقط؛ المدرّس لا يصل لها أصلاً.
 * MFA غير مفعّل في المشروع يرجع حالة unavailable (لا رمي)، وغياب
 * الجلسة يرمي — البوابة لا تستدعيها بلا جلسة.
 */
export function useMfaStatus(enabled: boolean) {
  return useQuery<MfaStatus>({
    queryKey: [PLATFORM_ADMIN, 'mfa'],
    enabled,
    queryFn: fetchMfaStatus,
  })
}

/** أرقام المنصة التجميعية — تُفعَّل بعد ثبوت صفة الأدمن فقط */
export function usePlatformOverview(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'overview'],
    enabled,
    queryFn: fetchPlatformOverview,
  })
}

/**
 * اشتراك مساحة العمل الحالية (مهمة 19 — 0058): قراءة فقط.
 * حتى تطبيق 0058 ترجع الدالة null فيُخفى عرض الباقة — تدهور
 * معلن ومقصود: لا باقة افتراضية مخترعة.
 */
export function useSubscription(
  teacherId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'subscription', teacherId],
    enabled: enabled && Boolean(teacherId),
    queryFn: () => fetchMySubscription(teacherId as string),
  })
}

/**
 * الاستحقاقات الفعّالة لمساحة العمل (مهمة 18 — 0059): حدود الباقة ⊕
 * التجاوزات النشطة. حتى تطبيق 0059 ترجع الدالة null فيُخفى سطر
 * التجاوز — تدهور معلن ومقصود: لا تجاوز مخترع.
 */
export function useEffectiveEntitlements(
  teacherId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'entitlements', teacherId],
    enabled: enabled && Boolean(teacherId),
    queryFn: () => fetchEffectiveEntitlements(teacherId as string),
  })
}

/**
 * ملخص استخدام مساحة العمل (مهمة 19 — 0062، الخطوة 5): عدّادات
 * الشهر الحالي مقابل الحدود الفعّالة. حتى تطبيق 0062 ترجع الدالة
 * ‏null فيُخفى عرض الاستخدام — تدهور معلن ومقصود: لا أرقام مخترعة.
 */
export function useUsageSummary(
  teacherId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'usage', teacherId],
    enabled: enabled && Boolean(teacherId),
    queryFn: () => fetchUsageSummary(teacherId as string),
  })
}

// ---------------------------------------------------------------------------
// لوحة الأدمن الكاملة (مهمة 17 — 0061، الخطوة 7): مؤشرات + مساحات عمل
// + قائمة سماح + تجاوزات حساب. كل استعلام يرجع null قبل تطبيق
// مهاجراته فتعرض الأقسام حالة «قريباً» المصممة — لا خطأ خام أبداً.
// ---------------------------------------------------------------------------

/** مؤشرات المنصة (0061) — تُفعَّل بعد ثبوت صفة الأدمن فقط */
export function usePlatformIndicators(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'indicators'],
    enabled,
    queryFn: fetchPlatformIndicators,
  })
}

/** قائمة مساحات العمل (0061) */
export function usePlatformWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'workspaces'],
    enabled,
    queryFn: fetchPlatformWorkspaces,
  })
}

/** صفوف قائمة السماح (سياسات أدمن 0057) */
export function useAllowlist(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'allowlist'],
    enabled,
    queryFn: fetchAllowlist,
  })
}

/** قيمة قفل التسجيل الحالية — عرض فقط (0057) */
export function useRegistrationOpen(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'registration-open'],
    enabled,
    queryFn: fetchRegistrationOpen,
  })
}

/** تجاوزات حساب بعينه (قراءة أدمن 0059) — تُفعَّل عند اختيار الحساب */
export function useAccountOverrides(
  teacherId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'overrides', teacherId],
    enabled: enabled && Boolean(teacherId),
    queryFn: () => fetchAccountOverrides(teacherId as string),
  })
}

/** إبطال كل كاش اللوحة بعد أي فعل إدارة (الوحدة مغلقة على نفسها) */
function useInvalidatePanel() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: [PLATFORM_ADMIN] })
  }
}

/** تفعيل/إيقاف حساب (0061) */
export function useSetAccountActivated() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      teacherId: string
      activated: boolean
      reason: string
    }) => setAccountActivated(input.teacherId, input.activated, input.reason),
    onSuccess: invalidate,
  })
}

/** تعيين باقة اشتراك (0061) */
export function useSetSubscriptionPlan() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      teacherId: string
      planSlug: PlanSlug
      trialEndsAt: string | null
    }) => setSubscriptionPlan(input.teacherId, input.planSlug, input.trialEndsAt),
    onSuccess: invalidate,
  })
}

/** إعداد تجاوز فردي (0059؛ 0066 تضيف النوع 'setting') */
export function useSetAccountOverride() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      teacherId: string
      kind: 'feature' | 'limit' | 'setting'
      key: string
      value: boolean | number | string | null
      reason: string
      expiresAt: string | null
    }) => setAccountOverride(input),
    onSuccess: invalidate,
  })
}

/** إلغاء تجاوز فردي (0059) */
export function useRevokeAccountOverride() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (overrideId: string) => revokeAccountOverride(overrideId),
    onSuccess: invalidate,
  })
}

/** إضافة صف لقائمة السماح (0057) */
export function useAddAllowlistEntry() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: { email: string; phone: string; note: string }) =>
      addAllowlistEntry(input),
    onSuccess: invalidate,
  })
}

/** حذف صف من قائمة السماح (0066 — RPC موثّق) */
export function useRemoveAllowlistEntry() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (id: string) => removeAllowlistEntry(id),
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// قوالب الأدوار الجاهزة (مهمة 18 — 0063): قراءة مباشرة من الجدول
// (سياسة أدمن) + أفعال RPC. غياب الجدول قبل 0063 يرجع null فتعرض
// الأقسام «قريباً» — لا خطأ خام أبداً.
// ---------------------------------------------------------------------------

/** قوالب الأدوار (0063) */
export function useRoleTemplates(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'role-templates'],
    enabled,
    queryFn: fetchRoleTemplates,
  })
}

/** إنشاء قالب دور (0063) */
export function useCreateRoleTemplate() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      slug: string
      name: string
      description: string
      entitlements: TemplateEntitlements
    }) => createRoleTemplate(input),
    onSuccess: invalidate,
  })
}

/** تعديل قالب دور (0063) — استبدال كامل + تفعيل/تعطيل */
export function useUpdateRoleTemplate() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      templateId: string
      name: string
      description: string
      entitlements: TemplateEntitlements
      isActive: boolean
    }) => updateRoleTemplate(input),
    onSuccess: invalidate,
  })
}

/** تطبيق قالب على حساب (0063) — يكتب تجاوزاً لكل إدخال فيه */
export function useApplyRoleTemplate() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      templateId: string
      teacherId: string
      reason: string
      expiresAt: string | null
    }) => applyRoleTemplate(input),
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// تنبيهات الأجهزة الجديدة (مهمة 23 — 0068): تسجيل الجهاز الحالي عند
// دخول اللوحة + قائمة الأجهزة + توثيق/إلغاء. غياب 0068 يرجع null
// فتعرض الأقسام «قريباً» — لا خطأ خام أبداً.
// ---------------------------------------------------------------------------

/** تسجيل الجهاز الحالي عند دخول /admin (مرة لكل دخول) */
export function useRegisterCurrentDevice() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: ensureCurrentDevice,
    onSuccess: invalidate,
  })
}

/** أجهزة الأدمن الحالي — null قبل تطبيق 0068 */
export function useAdminDevices(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'devices'],
    enabled,
    queryFn: fetchAdminDevices,
  })
}

/** توثيق جهاز + تدقيق best-effort */
export function useTrustAdminDevice() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const ok = await trustAdminDevice(deviceId)
      if (!ok) throw new Error('device trust failed')
      await logDeviceAudit('device_trusted', { device_id: deviceId })
      return ok
    },
    onSuccess: invalidate,
  })
}
/** إعلانات المنصة للأدمن (0065) — null حتى تطبيق المهاجرة (قسم «قريباً») */
export function useAnnouncementsAdmin(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'announcements'],
    enabled,
    queryFn: fetchAnnouncementsAdmin,
  })
}

/** نشر إعلان جديد (0065) — موثّق في سجل التدقيق خادمياً */
export function usePublishAnnouncement() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: {
      title: string
      body: string
      kind: AnnouncementKind
      scheduledAt: string | null
    }) => publishAnnouncement(input),
    onSuccess: invalidate,
  })
}

/** إلغاء جهاز + تدقيق best-effort */
export function useRevokeAdminDevice() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const ok = await revokeAdminDevice(deviceId)
      if (!ok) throw new Error('device revoke failed')
      await logDeviceAudit('device_revoked', { device_id: deviceId })
      return ok
    },
    onSuccess: invalidate,
  })
}
/** حذف إعلان منشور (0065) */
export function useDeleteAnnouncement() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: invalidate,
  })
}

/** تذاكر الدعم للأدمن (0065) — بمرشّح حالة اختياري */
export function useAdminTickets(status: TicketStatus | null, enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'tickets', status ?? 'all'],
    enabled,
    queryFn: () => fetchAdminTickets(status),
  })
}

/** تغيير حالة تذكرة (0065) — إغلاق/إعادة فتح، موثّق خادمياً */
export function useSetTicketStatus() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: { ticketId: string; status: TicketStatus }) =>
      setTicketStatus(input.ticketId, input.status),
    onSuccess: invalidate,
  })
}

/** خيط تذكرة للرد عليها من اللوحة (0065) — مشترك مع طرف المدرس */
export function useAdminTicketThread(ticketId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'ticket-thread', ticketId],
    enabled: enabled && Boolean(ticketId),
    queryFn: () => fetchTicketThread(ticketId!),
  })
}

/** الرد على تذكرة من اللوحة (0065) — الدور والحالة يُشتقان خادمياً */
export function useAdminReplyToTicket() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (input: { ticketId: string; body: string }) =>
      replyToTicket(input.ticketId, input.body),
    onSuccess: invalidate,
  })
}

/** قلب قفل التسجيل (0066 — RPC موثّق) */
export function useSetRegistrationOpen() {
  const invalidate = useInvalidatePanel()
  return useMutation({
    mutationFn: (open: boolean) => setRegistrationOpen(open),
    onSuccess: invalidate,
  })
}

/** صفحة من سجل التدقيق (0066) — مرشّحا الحساب/الفعل اختياريان */
export function useAuditLog(
  input: {
    limit: number
    offset: number
    teacherId?: string | null
    action?: string | null
  },
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      PLATFORM_ADMIN,
      'audit-log',
      input.limit,
      input.offset,
      input.teacherId ?? null,
      input.action ?? null,
    ],
    enabled,
    queryFn: () => fetchAuditLog(input),
  })
}
