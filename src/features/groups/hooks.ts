import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GroupInput, WaitlistInput } from '../../types/database'
import { SG } from '../students/hooks'
import {
  addWaitlistEntry,
  createGroup,
  fetchGroup,
  fetchGroupRoster,
  fetchGroups,
  fetchWaitlist,
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

export function useAddWaitlistEntry(teacherId: string, groupId: string) {
  const invalidate = useInvalidateModule()
  return useMutation({
    mutationFn: (input: WaitlistInput) => addWaitlistEntry(teacherId, groupId, input),
    onSuccess: invalidate,
  })
}
