import { useMutation, useQuery } from '@tanstack/react-query'
import { INVALIDATION_SETS, useInvalidatePrefixes } from '../../lib/invalidate'
import type { ProfileContentKind } from '../../types/database'
import {
  createContent,
  createPost,
  deleteContent,
  deletePost,
  fetchMyContent,
  fetchMyPosts,
  fetchMyProfile,
  fetchMyRatings,
  setRatingHidden,
  updateContent,
  updatePost,
  upsertMyProfile,
  type ContentInput,
  type PostInput,
  type ProfileUpsertInput,
} from './api'

export const PROFILE = 'profile'

/** صفحتي — null = لم تُنشأ بعد؛ الخطأ يصعد (الصفحة تميّز غياب 0074) */
export function useMyProfile(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [PROFILE, 'mine', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMyProfile(teacherId!),
  })
}

export function useMyPosts(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [PROFILE, 'posts', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMyPosts(teacherId!),
  })
}

export function useMyContent(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [PROFILE, 'content', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMyContent(teacherId!),
  })
}

export function useMyRatings(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [PROFILE, 'ratings', teacherId],
    enabled: Boolean(teacherId) && enabled,
    queryFn: () => fetchMyRatings(teacherId!),
  })
}

export function useUpsertMyProfile(teacherId: string) {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (input: ProfileUpsertInput) => upsertMyProfile(teacherId, input),
    onSuccess: () => invalidate(),
  })
}

export function useCreatePost(teacherId: string) {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (input: PostInput) => createPost(teacherId, input),
    onSuccess: () => invalidate(),
  })
}

export function useUpdatePost() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (input: { id: string; data: PostInput }) =>
      updatePost(input.id, input.data),
    onSuccess: () => invalidate(),
  })
}

export function useDeletePost() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (id: string) => deletePost(id),
    onSuccess: () => invalidate(),
  })
}

export function useCreateContent(teacherId: string) {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (input: ContentInput & { isPublished: boolean }) =>
      createContent(teacherId, input),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateContent() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (input: {
      id: string
      data: ContentInput & { isPublished: boolean }
    }) => updateContent(input.id, input.data),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteContent() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (id: string) => deleteContent(id),
    onSuccess: () => invalidate(),
  })
}

export function useSetRatingHidden() {
  const invalidate = useInvalidatePrefixes(INVALIDATION_SETS.profile)
  return useMutation({
    mutationFn: (input: { id: string; hidden: boolean }) =>
      setRatingHidden(input.id, input.hidden),
    onSuccess: () => invalidate(),
  })
}

export type { ProfileContentKind }
