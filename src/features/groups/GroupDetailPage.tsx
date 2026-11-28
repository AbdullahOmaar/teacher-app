import { invalidatePrefixes } from '../../lib/invalidate'
import { friendlyDbError } from '../../lib/supabaseErrors'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { t } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { Button } from '../../components/ui/Button'
import { Archive, ArchiveRestore, BookOpenCheck, Check, Link2, Loader2, MapPin, Pencil, Trash2, TriangleAlert, UserPlus, Users } from 'lucide-react'
import { DangerConfirmSheet } from '../../components/ui/DangerConfirmSheet'
import { useToast } from '../../components/ui/toast'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { BILLING_LABELS, DAY_NAMES, formatMoney, formatTime12, safeExternalUrl } from '../../lib/format'
import { SG, useStudents } from '../students/hooks'
import { EnrollStudentSheet } from '../students/EnrollStudentSheet'
import {
  useAcceptWaitlistEntry,
  useAddWaitlistEntry,
  useDeleteGroup,
  useDeleteWaitlistEntry,
  useGroup,
  useGroupFootprint,
  useGroupRoster,
  useGroups,
  useSetGroupArchived,
  useWaitlist,
} from './hooks'
import { groupSlotsOf } from './slots'
import { GroupFormSheet } from './GroupFormSheet'
import { GroupStarCheer } from './GroupStarCheer'

/**
 * تفاصيل مجموعة: بيانات الجدول والفوترة، قائمة الطلاب (roster)،
 * وقسم قائمة الانتظار (عرض + إضافة) — group_waitlist.
 */
export function GroupDetailPage() {
  const qc = useQueryClient()
  const { id } = useParams()
  const teacher = useCurrentTeacher()
  const [editOpen, setEditOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [wlName, setWlName] = useState('')
  const [wlPhone, setWlPhone] = useState('')
  const [wlNote, setWlNote] = useState('')
  const [wlError, setWlError] = useState<string | null>(null)

  const navigate = useNavigate()
  const toast = useToast()
  const [dangerMode, setDangerMode] = useState<'archive' | 'delete' | null>(null)
  const [dangerError, setDangerError] = useState<string | null>(null)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isAssistantRole = teacher.status === 'ready' && teacher.role === 'assistant'
  const groupQ = useGroup(teacherId, id)
  const groupsQ = useGroups(teacherId)
  const rosterQ = useGroupRoster(teacherId, id)
  const waitlistQ = useWaitlist(teacherId, id)
  const studentsQ = useStudents(teacherId)
  const addWaitlist = useAddWaitlistEntry(teacherId ?? '', id ?? '')
  const acceptWaitlist = useAcceptWaitlistEntry(teacherId ?? '')
  const deleteWaitlist = useDeleteWaitlistEntry(teacherId ?? '')
  const [wlActionId, setWlActionId] = useState<string | null>(null)
  const [wlActionError, setWlActionError] = useState<string | null>(null)
  const setGroupArchived = useSetGroupArchived(teacherId ?? '')
  const deleteGroup = useDeleteGroup(teacherId ?? '')
  // بصمة المجموعة للمالك فقط (الفواتير محجوبة عن المساعد بـ RLS) — الحذف قرار مالك
  const footprintQ = useGroupFootprint(teacherId, id, !isAssistantRole)

  const enrolledStudentIds = useMemo(
    () => new Set((rosterQ.data ?? []).map((r) => r.student_id)),
    [rosterQ.data],
  )

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (groupQ.isPending || rosterQ.isPending) return <LoadingState label={t('groups.detailLoading')} />
  const error = groupQ.error ?? rosterQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : t('common.unknownError')}
        onRetry={() => {
          // PAT-1 (3A-377): إعادة محاولة موجّهة للاستعلامات الفاشلة نفسها — إبطال 'sg' كان سيعيد جلب المجموعات والطلاب والانتظار والبصمة السليمة أيضاً.
          void groupQ.refetch()
          void rosterQ.refetch()
        }}
      />
    )

  const group = groupQ.data
  if (!group) return <EmptyState mascot mascotPose="oops" icon={Users} title={t('groups.detailNotFoundTitle')} hint={t('groups.detailNotFoundHint')} />

  const roster = rosterQ.data ?? []
  const waitlist = waitlistQ.data ?? []
  const isArchived = group.archived_at != null
  const isAssistant = teacher.role === 'assistant'

  const confirmDanger = async () => {
    if (!dangerMode) return
    setDangerError(null)
    try {
      if (dangerMode === 'archive') {
        await setGroupArchived.mutateAsync({ groupId: group.id, archived: true })
        toast(t('groups.archivedToast', { name: group.name }))
        setDangerMode(null)
      } else {
        await deleteGroup.mutateAsync(group.id)
        toast(t('groups.deletedToast', { name: group.name }))
        setDangerMode(null)
        navigate('/groups', { replace: true })
      }
    } catch (e) {
      setDangerError(e instanceof Error ? e.message : t('groups.actionError'))
    }
  }
  const pct = group.capacity ? Math.min(100, Math.round((roster.length / group.capacity) * 100)) : null

  const acceptWl = async (entry: (typeof waitlist)[number]) => {
    setWlActionError(null)
    setWlActionId(entry.id)
    try {
      await acceptWaitlist.mutateAsync(entry)
      toast(t('groups.wlAcceptedToast', { name: entry.name }))
    } catch (e) {
      setWlActionError(e instanceof Error ? e.message : t('groups.wlAcceptError'))
    } finally {
      setWlActionId(null)
    }
  }

  const removeWl = async (entry: (typeof waitlist)[number]) => {
    setWlActionError(null)
    setWlActionId(entry.id)
    try {
      await deleteWaitlist.mutateAsync(entry.id)
      toast(t('groups.wlRemovedToast', { name: entry.name }))
    } catch (e) {
      setWlActionError(e instanceof Error ? e.message : t('groups.wlRemoveError'))
    } finally {
      setWlActionId(null)
    }
  }

  const submitWaitlist = async () => {
    setWlError(null)
    if (!wlName.trim()) return setWlError(t('groups.wlNameRequired'))
    try {
      await addWaitlist.mutateAsync({
        name: wlName.trim(),
        phone: wlPhone.trim() === '' ? null : wlPhone.trim(),
        note: wlNote.trim() === '' ? null : wlNote.trim(),
      })
      setWlName('')
      setWlPhone('')
      setWlNote('')
    } catch (e) {
      setWlError(e instanceof Error ? e.message : t('groups.wlAddError'))
    }
  }

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [SG])}>
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-4 lg:items-start lg:grid-flow-dense">
      {/* احتفال النجم عند محطات المجموعة (خطة الهوية P-12): يُشتق من
          قائمة المجموعة المحمّلة هنا وبصمتها — مرة واحدة لكل محطة */}
      {teacherId && id && (
        <div className="lg:col-span-2 min-w-0">
        <GroupStarCheer
          teacherId={teacherId}
          groupId={id}
          studentsCount={roster.length}
          sessionsCount={footprintQ.data?.sessionCount ?? null}
        />
        </div>
      )}
      <Card className="rise-in lg:col-span-2 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[16px] font-extrabold">
            {group.name}
            {isArchived && (
              <span className="ms-2 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                {t('groups.badgeArchived')}
              </span>
            )}
          </div>
          {/* تعديل المجموعة: أيقونة صغيرة في الطرف العلوي
              (3A-384 — قاعدة المالك ٦-٤) بدل زر نصي عريض */}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={t('groups.edit')}
            title={t('groups.edit')}
            className="shrink-0 w-11 h-11 -mt-1.5 -me-1.5 flex items-center justify-center bg-transparent border-0 cursor-pointer text-primary"
          >
            <Pencil size={20} />
          </button>
        </div>
        {isArchived && (
          <p className="text-muted text-[13.5px] mt-1 mb-0">
            {t('groups.archivedInfo')}
          </p>
        )}
        <div className="text-muted text-[13.5px] mt-1 leading-relaxed">
          {BILLING_LABELS[group.billing_type]} · {formatMoney(group.price)}
          <br />
          {groupSlotsOf(group).map((s, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {DAY_NAMES[s.day]} · {formatTime12(s.start_time)} {t('groups.detailDuration', { minutes: s.duration_minutes })}
            </span>
          ))}
          {group.room ? <br /> : null}
          {group.room ? (<span className="inline-flex items-center gap-1"><MapPin size={16} /> {group.room}</span>) : ''}
          {group.assistant_name ? <><br />{t('groups.detailAssistant', { name: group.assistant_name })}</> : null}
        </div>
        {group.capacity != null && pct != null && (
          <div className="mt-2">
            <div className="flex justify-between text-[13.5px] text-muted mb-1">
              <span>
                {t('groups.detailCapacity', { done: roster.length, capacity: group.capacity })}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-soft overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-bad' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {group.links.some((l) => safeExternalUrl(l) !== null) && (
          <div className="mt-2">
            {group.links.map((l, i) => {
              const href = safeExternalUrl(l)
              if (href === null) return null
              return (
                <a key={i} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary text-[13.5px] break-all min-h-[48px]" dir="ltr">
                  <Link2 size={16} className="shrink-0" />
                  <span className="break-all">{l}</span>
                </a>
              )
            })}
          </div>
        )}
        {/* إجراءات المجموعة: صف واحد بأزرار موحّدة (3A-384 أصل الصف
            الواحد؛ 3A-697 توحيد الشكل — لقطة المالك: التسميات كانت
            تلتف سطرين والارتفاعات تختلف): ارتفاع واحد ممتد على الصف
            كله، وتسميات سطر واحد بلا التفاف أبداً (أيقونة أولاً +
            ‏nowrap)، والأساسي يحتفظ بملء النيلي بنفس الارتفاع
            والإيقاع — لا زر أطول من أخيه */}
        <div className="flex gap-2 mt-3 items-stretch">
          <Link to={`/students?group=${group.id}`} className="no-underline flex-1 min-w-0 flex">
            <Button variant="soft" size="sm" full className="h-full whitespace-nowrap">
              <Users size={16} />
              {t('groups.viewInStudents')}
            </Button>
          </Link>
          {!isArchived && (
            <Button size="sm" className="flex-1 min-w-0 whitespace-nowrap" onClick={() => setEnrollOpen(true)}>
              <UserPlus size={16} />
              {t('groups.addStudentBtn')}
            </Button>
          )}
          <Link to={`/homework?group=${group.id}`} className="no-underline flex-1 min-w-0 flex">
            <Button variant="soft" size="sm" full className="h-full whitespace-nowrap">
              <BookOpenCheck size={16} />
              {t('groups.homeworkBtn')}
            </Button>
          </Link>
        </div>
      </Card>

      {/* القائمة: العمود الرئيسي عند الديسكتوب (3A-930) */}
      <div className="lg:col-start-1 min-w-0">
      <h3 className="type-section mt-5 mb-2 lg:mt-0">{t('groups.rosterTitle', { count: roster.length })}</h3>
      {roster.length === 0 ? (
        <EmptyState mascot icon={Users} title={t('groups.rosterEmptyTitle')} hint={t('groups.rosterEmptyHint')} />
      ) : (
        <Card className="rise-in p-0 overflow-hidden" style={{ animationDelay: '50ms' }}>
          {/* (3A-341 قرار ٢): كود الطالب لا يظهر في قائمة المجموعة — مكانه
              بروفايل الطالب وبطاقته وروابط البوابة فقط */}
          {roster.map((r, i) => (
            <Link key={r.id} to={`/students/${r.student_id}`} className="block no-underline text-text">
              <ListRow
                first={i === 0}
                className={r.student_paused ? 'opacity-60' : ''}
                leading={<Avatar name={r.student_name} />}
                title={
                  <>
                    {r.student_name}
                    {r.student_paused && (
                      <span className="ms-2 type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                        {t('groups.badgePaused')}
                      </span>
                    )}
                  </>
                }
                secondary={
                  /* مقاطع ذرّية لا تنكسر (3A-384 — ٥-و: «حصة» كانت
                     يتيمة على سطر): كل مقطع nowrap ويلتف كوحدة */
                  <span className="flex flex-wrap gap-x-1">
                    <span className="whitespace-nowrap">
                      {t('groups.detailActualPrice', { price: formatMoney(r.price_override ?? group.price) })}
                    </span>
                    {r.price_override != null && (
                      <span className="whitespace-nowrap">{t('groups.detailSpecialPrice')}</span>
                    )}
                    {r.prepaid_sessions != null && (
                      <span className="whitespace-nowrap">
                        {t('groups.detailPrepaid', { count: r.prepaid_sessions })}
                      </span>
                    )}
                  </span>
                }
              />
            </Link>
          ))}
        </Card>
      )}

      </div>

      {/* قائمة الانتظار: سكة جانبية عند الديسكتوب */}
      <div className="lg:col-start-2 min-w-0">
      <h3 className="type-section mt-5 mb-2 lg:mt-0">{t('groups.waitlistTitle', { count: waitlist.length })}</h3>
      <Card className="rise-in" style={{ animationDelay: '90ms' }}>
        {waitlistQ.isPending ? (
          <LoadingState label={t('groups.waitlistLoading')} />
        ) : waitlist.length === 0 ? (
          <p className="text-muted text-[13.5px] mt-0">{t('groups.waitlistEmpty')}</p>
        ) : (
          waitlist.map((w) => (
            <div key={w.id} className="py-2 border-b border-border last:border-0">
              <div className="flex justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] flex items-center gap-2 flex-wrap">
                    {w.name}
                    {w.source === 'booking_page' && (
                      <span className="text-[12px] font-bold bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                        {t('groups.wlSourceBooking')}
                      </span>
                    )}
                    {w.wants_trial && (
                      <span className="text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                        {t('groups.wlWantsTrial')}
                      </span>
                    )}
                  </div>
                  {w.note && <div className="text-muted text-[13.5px]">{w.note}</div>}
                  {w.phone && (
                    <a href={`tel:${w.phone}`} className="text-primary text-[13.5px] font-semibold inline-block mt-0.5" dir="ltr">
                      {w.phone}
                    </a>
                  )}
                </div>
                {/* قبول/حذف طلب الانتظار: أيقونتان صغيرتان في الطرف
                    العلوي (3A-384 — قاعدة المالك ٦-٣) بدل زرّين نصيين
                    كان نصهما يلتف سطرين عند 360px */}
                <div className="flex shrink-0 -mt-1.5 -me-1.5">
                  <button
                    type="button"
                    onClick={() => void acceptWl(w)}
                    disabled={wlActionId === w.id}
                    aria-label={t('groups.wlAcceptBtn')}
                    title={t('groups.wlAcceptBtn')}
                    className="w-10 h-10 flex items-center justify-center bg-transparent border-0 cursor-pointer text-ok-text disabled:opacity-40"
                  >
                    {wlActionId === w.id && acceptWaitlist.isPending ? (
                      <Loader2 size={19} className="animate-spin" />
                    ) : (
                      <Check size={19} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeWl(w)}
                    disabled={wlActionId === w.id}
                    aria-label={t('groups.wlDeleteBtn')}
                    title={t('groups.wlDeleteBtn')}
                    className="w-10 h-10 flex items-center justify-center bg-transparent border-0 cursor-pointer text-bad-text disabled:opacity-40"
                  >
                    <Trash2 size={19} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        {wlActionError && <FormError message={wlActionError} />}
        {isArchived ? (
          <p className="text-muted text-[13.5px] border-t border-border mt-2 pt-3 mb-0">
            {t('groups.wlArchivedNote')}
          </p>
        ) : (
        <div className="border-t border-border mt-2 pt-3">
          <Field label={t('groups.wlNameLabel')}>
            <TextInput value={wlName} onChange={(e) => setWlName(e.target.value)} placeholder={t('groups.wlNamePlaceholder')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('groups.wlPhoneLabel')}>
              <TextInput type="tel" dir="ltr" value={wlPhone} onChange={(e) => setWlPhone(e.target.value)} placeholder="01xxxxxxxxx" />
            </Field>
            <Field label={t('groups.wlNoteLabel')}>
              <TextInput value={wlNote} onChange={(e) => setWlNote(e.target.value)} />
            </Field>
          </div>
          {wlError && <FormError message={wlError} />}
          <Button full variant="soft" onClick={submitWaitlist} disabled={addWaitlist.isPending}>
            {addWaitlist.isPending ? t('groups.adding') : t('groups.wlAddBtn')}
          </Button>
        </div>
        )}
      </Card>
      </div>

      {/* منطقة الخطر — حذف/أرشفة آمنة (خطوة 10):
          الأرشفة (archived_at من 0007) توقف توليد الحصص والتسجيل الجديد مع
          حفظ التاريخ كاملاً. الحذف النهائي للمالك فقط ولمجموعة فارغة تماماً
          (لا تسجيلات/حصص/فواتير/تقييمات)، وبعد كتابة اسم المجموعة كاملاً. */}
      <Card className="rise-in border-bad/50 mt-5 lg:mt-0 lg:col-span-2 min-w-0" style={{ animationDelay: '140ms' }}>
        <div className="flex items-center gap-2 mb-2">
          <TriangleAlert size={20} className="text-bad-text" />
          <span className="font-extrabold text-[15px] text-bad-text">{t('groups.dangerTitle')}</span>
        </div>

        {isArchived ? (
          <>
            <Button
              variant="primary"
              full
              disabled={setGroupArchived.isPending}
              onClick={async () => {
                try {
                  await setGroupArchived.mutateAsync({ groupId: group.id, archived: false })
                  toast(t('groups.unarchivedToast', { name: group.name }))
                } catch (e) {
                  // (3A-377 — PAT-2) إلغاء الأرشفة كان رفضاً صامتاً بلا
                  // try/catch؛ الخطأ يظهر توست مصنّفاً ويُحفَظ في
                  // dangerError أيضاً (ورقة الخطر تعرضه عند فتحها)
                  const msg = friendlyDbError(
                    e,
                    t('common.saveError'),
                    t('common.saveBlockedByMissingLink'),
                  ).message
                  setDangerError(msg)
                  toast(msg, 'error')
                }
              }}
            >
              <ArchiveRestore size={20} /> {t('groups.unarchiveBtn')}
            </Button>
            <p className="text-muted text-[13.5px] mt-2 mb-0">
              {t('groups.unarchiveNote')}
            </p>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              full
              className="text-bad-text border-bad/50"
              onClick={() => {
                setDangerError(null)
                setDangerMode('archive')
              }}
            >
              <Archive size={20} /> {t('groups.archiveBtn')}
            </Button>
            <p className="text-muted text-[13.5px] mt-2 mb-0">
              {t('groups.archiveNote')}
            </p>
          </>
        )}

        <div className="border-t border-border mt-3 pt-3">
          {isAssistant ? (
            <p className="text-muted text-[13.5px] m-0">
              {t('groups.deleteOwnerOnly')}
            </p>
          ) : footprintQ.isPending ? (
            <p className="text-muted text-[13.5px] m-0">{t('groups.footprintChecking')}</p>
          ) : footprintQ.error ? (
            <p className="text-bad-text text-[13.5px] m-0">
              {t('groups.footprintError')}
            </p>
          ) : footprintQ.data?.canDelete ? (
            <>
              <Button
                variant="danger"
                full
                onClick={() => {
                  setDangerError(null)
                  setDangerMode('delete')
                }}
              >
                <Trash2 size={20} /> {t('groups.deleteBtn')}
              </Button>
              <p className="text-muted text-[13.5px] mt-2 mb-0">
                {t('groups.deleteAllowedNote')}
              </p>
            </>
          ) : (
            <p className="text-[13.5px] m-0 leading-relaxed">
              <span className="font-bold text-bad-text">{t('groups.deleteBlockedPrefix')}</span>
              {t('groups.deleteBlockedBody', {
                enrollments: footprintQ.data?.enrollmentCount ?? 0,
                sessions: footprintQ.data?.sessionCount ?? 0,
                invoices: footprintQ.data?.invoiceCount ?? 0,
                assessments: footprintQ.data?.assessmentCount ?? 0,
              })}
            </p>
          )}
        </div>
      </Card>

      {editOpen && (
        <GroupFormSheet
          onClose={() => setEditOpen(false)}
          teacherId={teacher.teacherId}
          groups={groupsQ.data ?? []}
          initial={group}
        />
      )}
      {enrollOpen && (
        <EnrollStudentSheet
          onClose={() => setEnrollOpen(false)}
          teacherId={teacher.teacherId}
          groups={[group]}
          students={studentsQ.data ?? []}
          fixedGroupId={group.id}
          excludeStudentIds={enrolledStudentIds}
        />
      )}

      <DangerConfirmSheet
        open={dangerMode !== null}
        title={dangerMode === 'delete' ? t('groups.deleteBtn') : t('groups.archiveBtn')}
        entityName={group.name}
        mode={dangerMode === 'delete' ? 'delete' : 'archive'}
        confirmLabel={dangerMode === 'delete' ? t('groups.confirmDelete') : t('groups.confirmArchive')}
        pending={setGroupArchived.isPending || deleteGroup.isPending}
        error={dangerError}
        onConfirm={confirmDanger}
        onClose={() => setDangerMode(null)}
        lines={
          dangerMode === 'delete'
            ? [
                t('groups.deleteLine1', { name: group.name }),
                t('groups.deleteLine2'),
                ...(footprintQ.data && footprintQ.data.waitlistCount > 0
                  ? [t('groups.deleteLineWaitlist', { count: footprintQ.data.waitlistCount })]
                  : []),
              ]
            : [
                t('groups.archiveLine1', { name: group.name }),
                t('groups.archiveLine2'),
                t('groups.archiveLine3'),
              ]
        }
      />
    </div>
    </PullToRefresh>
  )
}
