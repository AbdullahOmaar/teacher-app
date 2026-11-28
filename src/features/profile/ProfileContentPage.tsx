import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/form'
import { DangerConfirmSheet } from '../../components/ui/DangerConfirmSheet'
import { Field, FormError, TextArea, TextInput } from '../../components/ui/form'
import { Sheet } from '../../components/ui/Sheet'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { t } from '../../i18n'
import type {
  ProfileContentKind,
  TeacherProfileContentRow,
} from '../../types/database'
import { isProfileSchemaMissing, validateContentInput } from './api'
import {
  useCreateContent,
  useDeleteContent,
  useMyContent,
  useUpdateContent,
} from './hooks'
import { ProfileComingSoon, ProfileManageShell } from './ManageShell'

/**
 * شاشة «إدارة المحتوى» (0074): مقالات بنص داخلي + كتب/كورسات/قوائم
 * بروابط خارجية فقط — لا رفع ملفات إطلاقاً في هذه الفيتشر. التحقق
 * من المدخلات عبر validateContentInput (نفس دالة الاختبارات) والحاكم
 * الأخير قيد الجدول الخادمي.
 */

const KIND_LABELS: Record<ProfileContentKind, string> = {
  article: t('profile.kindArticle'),
  book: t('profile.kindBook'),
  course: t('profile.kindCourse'),
  playlist: t('profile.kindPlaylist'),
}

const KINDS: ProfileContentKind[] = ['article', 'book', 'course', 'playlist']

function ContentManager({ teacherId }: { teacherId: string }) {
  const toast = useToast()
  const contentQ = useMyContent(teacherId, true)
  const create = useCreateContent(teacherId)
  const update = useUpdateContent()
  const del = useDeleteContent()

  const [editing, setEditing] = useState<TeacherProfileContentRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<ProfileContentKind>('article')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<TeacherProfileContentRow | null>(null)

  if (contentQ.isPending) return <LoadingState />
  if (contentQ.isError) {
    if (isProfileSchemaMissing(contentQ.error)) return <ProfileComingSoon />
    return (
      <ErrorState
        message={t('profile.errSaveGeneric')}
        onRetry={() => void contentQ.refetch()}
      />
    )
  }

  const openCreate = () => {
    setKind('article')
    setTitle('')
    setDescription('')
    setBody('')
    setUrl('')
    setPublished(false)
    setError(null)
    setCreating(true)
  }

  const openEdit = (item: TeacherProfileContentRow) => {
    setKind(item.kind)
    setTitle(item.title)
    setDescription(item.description ?? '')
    setBody(item.body ?? '')
    setUrl(item.external_url ?? '')
    setPublished(item.is_published)
    setError(null)
    setEditing(item)
  }

  const save = () => {
    const input = {
      kind,
      title: title.trim(),
      description: description.trim() === '' ? null : description.trim(),
      body: kind === 'article' ? body.trim() : null,
      externalUrl: kind === 'article' ? null : url.trim(),
    }
    const problem = validateContentInput(input)
    setError(problem)
    if (problem) return
    const payload = { ...input, isPublished: published }
    const done = () => {
      setCreating(false)
      setEditing(null)
      toast(t('profile.savedToast'))
    }
    if (editing) {
      update.mutate(
        { id: editing.id, data: payload },
        { onSuccess: done, onError: () => setError(t('profile.errSaveGeneric')) },
      )
    } else {
      create.mutate(payload, {
        onSuccess: done,
        onError: () => setError(t('profile.errSaveGeneric')),
      })
    }
  }

  const togglePublish = (item: TeacherProfileContentRow) => {
    update.mutate(
      {
        id: item.id,
        data: {
          kind: item.kind,
          title: item.title,
          description: item.description,
          body: item.body,
          externalUrl: item.external_url,
          isPublished: !item.is_published,
        },
      },
      { onError: () => toast(t('profile.errSaveGeneric')) },
    )
  }

  return (
    <div>
      <Button onClick={openCreate} className="mb-3">
        <Plus size={18} />
        {t('profile.newContent')}
      </Button>

      {contentQ.data.length === 0 ? (
        <Card className="text-center py-6">
          <p className="text-muted type-secondary mb-0">
            {t('profile.emptyManageContent')}
          </p>
        </Card>
      ) : (
        contentQ.data.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="type-section">{item.title}</div>
              <span className="flex gap-1.5 shrink-0">
                <span className="text-[12px] font-bold bg-soft text-muted rounded-full px-2 py-0.5">
                  {KIND_LABELS[item.kind]}
                </span>
                <span className="text-[12px] font-bold bg-soft text-muted rounded-full px-2 py-0.5">
                  {item.is_published
                    ? t('profile.publishedChip')
                    : t('profile.draftChip')}
                </span>
              </span>
            </div>
            {item.description ? (
              <p className="text-muted type-secondary mb-3">{item.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" size="sm" onClick={() => openEdit(item)}>
                <Pencil size={15} />
                {t('profile.editAction')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => togglePublish(item)}>
                {item.is_published
                  ? t('profile.unpublishAction')
                  : t('profile.publishAction')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleting(item)}>
                <Trash2 size={15} />
                {t('profile.deleteAction')}
              </Button>
            </div>
          </Card>
        ))
      )}

      <Sheet
        open={creating || editing !== null}
        title={editing ? t('profile.editContent') : t('profile.newContent')}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      >
        <Field label={t('profile.kindLabel')}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProfileContentKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('profile.contentTitleLabel')}>
          <TextInput value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('profile.contentDescLabel')}>
          <TextArea value={description} rows={2} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {kind === 'article' ? (
          <Field label={t('profile.contentBodyLabel')}>
            <TextArea value={body} rows={8} maxLength={40000} onChange={(e) => setBody(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label={t('profile.contentUrlLabel')}>
              <TextInput dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <p className="text-muted text-[12.5px] mt-1 mb-4">
              {t('profile.contentUrlHint')}
            </p>
          </>
        )}
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
        title={t('profile.deleteContentConfirmTitle')}
        entityName={deleting?.title ?? ''}
        lines={[t('profile.deleteContentConfirmBody')]}
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

export function ProfileContentPage() {
  return (
    <ProfileManageShell>
      {({ teacherId }) => <ContentManager teacherId={teacherId} />}
    </ProfileManageShell>
  )
}
