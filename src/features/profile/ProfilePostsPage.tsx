import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DangerConfirmSheet } from '../../components/ui/DangerConfirmSheet'
import { Field, FormError, TextArea, TextInput } from '../../components/ui/form'
import { Sheet } from '../../components/ui/Sheet'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { t } from '../../i18n'
import type { TeacherProfilePostRow } from '../../types/database'
import { isProfileSchemaMissing } from './api'
import {
  useCreatePost,
  useDeletePost,
  useMyPosts,
  useUpdatePost,
} from './hooks'
import { ProfileComingSoon, ProfileManageShell } from './ManageShell'

/**
 * شاشة «إدارة المنشورات» (0074): قائمة + محرّر Sheet (عنوان + نص
 * markdown-lite + نشر/مسودة) + حذف بتأكيد كتابة العنوان (نمط الخطر
 * الموحّد). المنشور المنشور فقط هو ما يظهر على الصفحة العامة.
 */
function PostsManager({ teacherId }: { teacherId: string }) {
  const toast = useToast()
  const postsQ = useMyPosts(teacherId, true)
  const create = useCreatePost(teacherId)
  const update = useUpdatePost()
  const del = useDeletePost()

  const [editing, setEditing] = useState<TeacherProfilePostRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<TeacherProfilePostRow | null>(null)

  if (postsQ.isPending) return <LoadingState />
  if (postsQ.isError) {
    if (isProfileSchemaMissing(postsQ.error)) return <ProfileComingSoon />
    return (
      <ErrorState
        message={t('profile.errSaveGeneric')}
        onRetry={() => void postsQ.refetch()}
      />
    )
  }

  const openCreate = () => {
    setTitle('')
    setBody('')
    setPublished(false)
    setError(null)
    setCreating(true)
  }

  const openEdit = (post: TeacherProfilePostRow) => {
    setTitle(post.title)
    setBody(post.body)
    setPublished(post.is_published)
    setError(null)
    setEditing(post)
  }

  const save = () => {
    setError(null)
    if (title.trim() === '') return setError(t('profile.errTitleRequired'))
    if (body.trim() === '') return setError(t('profile.errBodyRequired'))
    const input = { title: title.trim(), body: body.trim(), isPublished: published }
    const done = () => {
      setCreating(false)
      setEditing(null)
      toast(t('profile.savedToast'))
    }
    if (editing) {
      update.mutate(
        { id: editing.id, data: input },
        { onSuccess: done, onError: () => setError(t('profile.errSaveGeneric')) },
      )
    } else {
      create.mutate(input, {
        onSuccess: done,
        onError: () => setError(t('profile.errSaveGeneric')),
      })
    }
  }

  const togglePublish = (post: TeacherProfilePostRow) => {
    update.mutate(
      {
        id: post.id,
        data: { title: post.title, body: post.body, isPublished: !post.is_published },
      },
      { onError: () => toast(t('profile.errSaveGeneric')) },
    )
  }

  return (
    <div>
      <Button onClick={openCreate} className="mb-3">
        <Plus size={18} />
        {t('profile.newPost')}
      </Button>

      {postsQ.data.length === 0 ? (
        <Card className="text-center py-6">
          <p className="text-muted type-secondary mb-0">
            {t('profile.emptyManagePosts')}
          </p>
        </Card>
      ) : (
        postsQ.data.map((post) => (
          <Card key={post.id}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="type-section">{post.title}</div>
              <span className="text-[12px] font-bold bg-soft text-muted rounded-full px-2 py-0.5 shrink-0">
                {post.is_published ? t('profile.publishedChip') : t('profile.draftChip')}
              </span>
            </div>
            <p className="text-muted type-secondary mb-3 line-clamp-3 whitespace-pre-line">
              {post.body}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" size="sm" onClick={() => openEdit(post)}>
                <Pencil size={15} />
                {t('profile.editAction')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => togglePublish(post)}>
                {post.is_published
                  ? t('profile.unpublishAction')
                  : t('profile.publishAction')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleting(post)}>
                <Trash2 size={15} />
                {t('profile.deleteAction')}
              </Button>
            </div>
          </Card>
        ))
      )}

      <Sheet
        open={creating || editing !== null}
        title={editing ? t('profile.editPost') : t('profile.newPost')}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      >
        <Field label={t('profile.postTitleLabel')}>
          <TextInput value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('profile.postBodyLabel')}>
          <TextArea value={body} rows={8} maxLength={20000} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <label className="flex items-center justify-between gap-3 mb-4 cursor-pointer">
          <span className="text-[14px] font-semibold">{t('profile.publishAction')}</span>
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 accent-primary"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
        </label>
        {error ? <FormError message={error} /> : null}
        <Button full onClick={save} disabled={create.isPending || update.isPending}>
          {t('profile.saveAction')}
        </Button>
      </Sheet>

      <DangerConfirmSheet
        open={deleting !== null}
        title={t('profile.deletePostConfirmTitle')}
        entityName={deleting?.title ?? ''}
        lines={[t('profile.deletePostConfirmBody')]}
        mode="delete"
        confirmLabel={t('profile.deleteAction')}
        pending={del.isPending}
        onConfirm={() => {
          if (!deleting) return
          del.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null)
              toast(t('profile.savedToast'))
            },
          })
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

export function ProfilePostsPage() {
  return (
    <ProfileManageShell>
      {({ teacherId }) => <PostsManager teacherId={teacherId} />}
    </ProfileManageShell>
  )
}
