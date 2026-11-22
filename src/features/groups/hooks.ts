import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GroupInput,
  GroupRow,
  GroupWaitlistRow,
  WaitlistInput,
} from '../../types/database'
import { SG } from '../students/hooks'
import { INVALIDATION_SETS, invalidatePrefixes, useInvalidatePrefixes } from '../../lib/invalidate'
import {
  acceptWaitlistEntry,
  addWaitlistEntry,
  createGroup,
  deleteGroup,
  deleteWaitlistEntry,
  fetchGroup,
  fetchGroupFootprint,
  fetchGroupRoster,
  fetchGroups,
  fetchWaitlist,
  setGroupArchived,
  updateGroup,
} from './api'

export function useGroups(teacherId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'groups', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () => fetchGroups(teacherId!),
  })
}

export function useGroup(teacherId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'group', teacherId, groupId],
    enabled: Boolean(teacherId && groupId),
    queryFn: () => fetchGroup(teacherId!, groupId!),
  })
}

export function useGroupRoster(teacherId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'group-roster', teacherId, groupId],
    enabled: Boolean(teacherId && groupId),
    queryFn: () => fetchGroupRoster(teacherId!, groupId!),
  })
}

export function useWaitlist(teacherId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: [SG, 'group-waitlist', teacherId, groupId],
    enabled: Boolean(teacherId && groupId),
    queryFn: () => fetchWaitlist(teacherId!, groupId!),
  })
}

/**
 * إبطال وحدة المجموعات — المجموعة الكاملة في INVALIDATION_SETS.groups:
 * إنشاء/تعديل مجموعة يغيّر قوائم الجدول (التوليد يقرأ المجموعات) وقوائم
 * الحضور وعدّادات التحليلات، فكانت [SG] وحدها ناقصة (3A-377 — توحيد
 * مع مسار الأرشفة/الحذف الذي كان يبطل المجموعة الكاملة أصلاً).
 */
function useInvalidateModule() {
  return useInvalidatePrefixes(INVALIDATION_SETS.groups)
}

export function useCreateGroup(teacherId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (input: GroupInput) => createGroup(teacherId, input),
    onSuccess: (created) => {
      // كتابة فورية في الكاش (تدقيق أول استخدام — H1): المجموعة المنشأة
      // للتوّ تظهر في القائمة في نفس اللحظة من صف الإدراج نفسه، حتى لو
      // تأخرت إعادة الجلب التالية للإبطال (شبكة بطيئة/جلسة أولى مزدحمة
      // بالطلبات) — الاعتماد على الإبطال وحده جعل أول مجموعة تبدو
      // «ضائعة» حتى إعادة الدخول. الإبطال يبقى لمزامنة بقية الوحدة.
      qc.setQueryData<GroupRow[]>([SG, 'groups', teacherId], (old) =>
        old && !old.some((g) => g.id === created.id) ? [...old, created] : old,
      )
      invalidate()
    },
  })
}

export function useUpdateGroup(teacherId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: GroupInput }) =>
      updateGroup(teacherId, groupId, input),
    onSuccess: (updated) => {
      qc.setQueryData<GroupRow[]>([SG, 'groups', teacherId], (old) =>
        old ? old.map((g) => (g.id === updated.id ? updated : g)) : old,
      )
      invalidate()
    },
  })
}

/** بصمة المجموعة (تسجيلات/حصص/فواتير/تقييمات) — تُحسم بها أهلية الحذف النهائي */
export function useGroupFootprint(
  teacherId: string | undefined,
  groupId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [SG, 'group-footprint', teacherId, groupId],
    enabled: Boolean(teacherId && groupId && enabled),
    queryFn: () => fetchGroupFootprint(teacherId!, groupId!),
  })
}

/** أرشفة/إلغاء أرشفة مجموعة — تبطل الوحدات المتأثرة (توليد/جدول/حضور/رئيسية) */
export function useSetGroupArchived(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, archived }: { groupId: string; archived: boolean }) =>
      setGroupArchived(teacherId, groupId, archived),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.groups)
    },
  })
}

/** حذف نهائي لمجموعة فارغة — إبطال الوحدات المتأثرة صراحة (فعل نادر) */
export function useDeleteGroup(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(teacherId, groupId),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.groups)
    },
  })
}

export function useAddWaitlistEntry(teacherId: string, groupId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (input: WaitlistInput) => addWaitlistEntry(teacherId, groupId, input),
    onSuccess: invalidate,
  })
}

/** حذف طلب انتظار (رفض) — يبطل وحدة الطلاب والمجموعات فقط */
export function useDeleteWaitlistEntry(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (entryId: string) => deleteWaitlistEntry(teacherId, entryId),
    onSuccess: invalidate,
  })
}

/** قبول طلب انتظار → طالب مسجل في نفس المجموعة — يبطل قوائم الطلاب
 * والرئيسية وقائمة حضور المجموعة حتى يظهر الطالب الجديد فيها كلها (PAT-1)؛
 * التسجيل الجديد يغيّر أيضاً عدّادات التحليلات ومجموعة مرشحي المعرّضين
 * فتُستخدم مجموعة الطلاب الكاملة (INVALIDATION_SETS.students). */
export function useAcceptWaitlistEntry(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entry: GroupWaitlistRow) => acceptWaitlistEntry(teacherId, entry),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.students)
    },
  })
}
