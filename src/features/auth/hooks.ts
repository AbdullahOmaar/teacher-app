import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelTeamInvite,
  fetchMyMemberships,
  fetchTeamMembers,
  inviteAssistant,
  inviteAssistantByEmail,
  removeTeamMember,
  updateMemberPermissions,
  updateOwnTeacherProfile,
} from './api'

export const TEAM_KEY = 'team'

export function useMyMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: [TEAM_KEY, 'my-memberships', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchMyMemberships(userId!),
  })
}

export function useTeamMembers(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [TEAM_KEY, 'members', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchTeamMembers(teacherId!),
  })
}

function useInvalidateTeam() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [TEAM_KEY] })
    void qc.invalidateQueries({ queryKey: ['current-teacher'] })
  }
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

export function useUpdateOwnProfile(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { display_name: string; phone: string | null; avatar_url?: string | null }) =>
      updateOwnTeacherProfile(userId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['current-teacher'] })
    },
  })
}
