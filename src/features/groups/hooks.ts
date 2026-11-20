import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GroupInput, WaitlistInput } from '../../types/database'
import { SG } from '../students/hooks'
import {
  addWaitlistEntry,
  createGroup,
  deleteGroup,
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

function useInvalidateModule() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [SG] })
  }
}

export function useCreateGroup(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (input: GroupInput) => createGroup(teacherId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateGroup(teacherId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: GroupInput }) =>
      updateGroup(teacherId, groupId, input),
    onSuccess: invalidate,
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

/** أرشفة/إلغاء أرشفة مجموعة — تُبطل كل الكاش لأن التوليد والجدول يتأثران */
export function useSetGroupArchived(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, archived }: { groupId: string; archived: boolean }) =>
      setGroupArchived(teacherId, groupId, archived),
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })
}

/** حذف نهائي لمجموعة فارغة — إبطال شامل للكاش (فعل نادر ومدمّر) */
export function useDeleteGroup(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(teacherId, groupId),
    onSuccess: () => {
      void qc.invalidateQueries()
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
