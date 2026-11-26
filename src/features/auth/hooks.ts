import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { INVALIDATION_SETS, invalidatePrefixes, useInvalidatePrefixes } from '../../lib/invalidate'
import {
  cancelTeamInvite,
  createCentre,
  fetchTeamMembers,
  inviteAssistant,
  inviteAssistantByEmail,
  reactivateTeamMember,
  removeTeamMember,
  suspendTeamMember,
  updateMemberPermissions,
  updateOwnTeacherProfile,
} from './api'

export const TEAM_KEY = 'team'


export function useTeamMembers(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [TEAM_KEY, 'members', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchTeamMembers(teacherId!),
  })
}

function useInvalidateTeam() {
  return useInvalidatePrefixes(INVALIDATION_SETS.authTeam)
}

export function useInviteAssistant(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: ({
      assistantUserId,
      permissions,
    }: {
      assistantUserId: string
      permissions: Record<string, boolean>
    }) => inviteAssistant(teacherId, assistantUserId, permissions),
    onSuccess: invalidate,
  })
}

export function useInviteAssistantByEmail(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: ({
      email,
      permissions,
    }: {
      email: string
      permissions: Record<string, boolean>
    }) => inviteAssistantByEmail(teacherId, email, permissions),
    onSuccess: invalidate,
  })
}

export function useCancelTeamInvite(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: (inviteId: string) => cancelTeamInvite(teacherId, inviteId),
    onSuccess: invalidate,
  })
}

export function useUpdateMemberPermissions(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: ({
      memberId,
      permissions,
    }: {
      memberId: string
      permissions: Record<string, boolean>
    }) => updateMemberPermissions(teacherId, memberId, permissions),
    onSuccess: invalidate,
  })
}

export function useRemoveTeamMember(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: (memberId: string) => removeTeamMember(teacherId, memberId),
    onSuccess: invalidate,
  })
}

/** إيقاف عضو فعّال (T21 — 3A-896): الوصول يُقطع خادمياً فوراً. */
export function useSuspendTeamMember(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: (memberId: string) => suspendTeamMember(teacherId, memberId),
    onSuccess: invalidate,
  })
}

/** إعادة تفعيل عضو موقوف (T21 — 3A-896). */
export function useReactivateTeamMember(teacherId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: (memberId: string) => reactivateTeamMember(teacherId, memberId),
    onSuccess: invalidate,
  })
}

export function useUpdateOwnProfile(teacherId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { display_name: string; phone: string | null; avatar_url?: string | null }) =>
      updateOwnTeacherProfile(teacherId, input),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.currentTeacher)
    },
  })
}

/** إنشاء سنتر إضافي (0016) — نجاحه يبطل حلّ الهوية ليلتقط السنتر الجديد */
export function useCreateCentre(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (displayName: string) => createCentre(userId, displayName),
    onSuccess: () => {
      void invalidatePrefixes(qc, INVALIDATION_SETS.currentTeacher)
    },
  })
}
