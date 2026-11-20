import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Archive, ArchiveRestore, BookOpenCheck, Link2, MapPin, Pencil, Trash2, TriangleAlert, Users } from 'lucide-react'
import { DangerConfirmSheet } from '../../components/ui/DangerConfirmSheet'
import { useToast } from '../../components/ui/toast'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { BILLING_LABELS, daysLabel, formatMoney, formatTime12 } from '../../lib/format'
import { useStudents } from '../students/hooks'
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
import { GroupFormSheet } from './GroupFormSheet'

/**
 * تفاصيل مجموعة: بيانات الجدول والفوترة، قائمة الطلاب (roster)،
 * وقسم قائمة الانتظار (عرض + إضافة) — group_waitlist.
 */
export function GroupDetailPage() {
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
  if (groupQ.isPending || rosterQ.isPending) return <LoadingState label="بنحمّل المجموعة…" />
  const error = groupQ.error ?? rosterQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'خطأ غير معروف'}
        onRetry={() => {
          void groupQ.refetch()
          void rosterQ.refetch()
        }}
      />
    )

  const group = groupQ.data
  if (!group) return <EmptyState icon={Users} title="المجموعة غير موجودة" hint="ممكن تكون اتحذفت أو الرابط غير صحيح" />

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
        toast(`تمت أرشفة مجموعة «${group.name}» — بياناتها التاريخية محفوظة`)
        setDangerMode(null)
      } else {
        await deleteGroup.mutateAsync(group.id)
        toast(`تم حذف مجموعة «${group.name}» نهائياً`)
        setDangerMode(null)
        navigate('/groups', { replace: true })
      }
    } catch (e) {
      setDangerError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء التنفيذ')
    }
  }
  const pct = group.capacity ? Math.min(100, Math.round((roster.length / group.capacity) * 100)) : null

  const acceptWl = async (entry: (typeof waitlist)[number]) => {
    setWlActionError(null)
    setWlActionId(entry.id)
    try {
      await acceptWaitlist.mutateAsync(entry)
      toast(`تم تسجيل «${entry.name}» طالباً في المجموعة`)
    } catch (e) {
      setWlActionError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء القبول')
    } finally {
      setWlActionId(null)
    }
  }

  const removeWl = async (entry: (typeof waitlist)[number]) => {
    setWlActionError(null)
    setWlActionId(entry.id)
    try {
      await deleteWaitlist.mutateAsync(entry.id)
      toast(`تم حذف طلب «${entry.name}» من قائمة الانتظار`)
    } catch (e) {
      setWlActionError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الحذف')
    } finally {
      setWlActionId(null)
    }
  }

  const submitWaitlist = async () => {
    setWlError(null)
    if (!wlName.trim()) return setWlError('اسم المنتظر إلزامي')
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
      setWlError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الإضافة')
    }
  }

  return (
    <div>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[16px] font-extrabold">
            {group.name}
            {isArchived && (
              <span className="ms-2 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                مؤرشفة
              </span>
            )}
          </div>
          <Button variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil size={20} />
            تعديل
          </Button>
        </div>
        {isArchived && (
          <p className="text-muted text-[13.5px] mt-1 mb-0">
            مجموعة مؤرشفة: لا تولّد حصصاً جديدة ولا تظهر كخيار تسجيل جديد، وكل بياناتها التاريخية محفوظة وقابلة للعرض.
          </p>
        )}
        <div className="text-muted text-[13.5px] mt-1 leading-relaxed">
          {BILLING_LABELS[group.billing_type]} · {formatMoney(group.price)}
          <br />
          {daysLabel(group.days)} · {formatTime12(group.start_time)} ({group.duration_minutes} دقيقة)
          {group.room ? <br /> : null}
          {group.room ? (<span className="inline-flex items-center gap-1"><MapPin size={16} /> {group.room}</span>) : ''}
          {group.assistant_name ? <><br />مساعد: {group.assistant_name}</> : null}
        </div>
        {group.capacity != null && pct != null && (
          <div className="mt-2">
            <div className="flex justify-between text-[13.5px] text-muted mb-1">
              <span>
                السعة: {roster.length}/{group.capacity} طالب
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-soft overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-bad' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {group.links.length > 0 && (
          <div className="mt-2">
            {group.links.map((l, i) => (
              <a key={i} href={l} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary text-[13.5px] break-all min-h-[48px]" dir="ltr">
                <Link2 size={16} className="shrink-0" />
                <span className="break-all">{l}</span>
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <Link to={`/students?group=${group.id}`} className="no-underline flex-1 min-w-[150px]">
            <Button variant="soft" full>
              عرض في قائمة الطلاب
            </Button>
          </Link>
          {!isArchived && (
            <Button className="flex-1 min-w-[150px]" onClick={() => setEnrollOpen(true)}>
              + إضافة طالب
            </Button>
          )}
        </div>
        <Link to={`/homework?group=${group.id}`} className="no-underline block mt-2">
          <Button variant="soft" full>
            <BookOpenCheck size={20} />
            متابعة واجبات المجموعة
          </Button>
        </Link>
      </Card>

      <h3 className="type-section mt-5 mb-2">الطلاب المسجلون ({roster.length})</h3>
      {roster.length === 0 ? (
        <EmptyState icon={Users} title="لا طلاب مسجلين بعد" hint="أضف طلاباً من زر «إضافة طالب»" />
      ) : (
        <Card className="p-0 overflow-hidden">
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
                        موقوف
                      </span>
                    )}
                  </>
                }
                secondary={
                  <>
                    السعر الفعلي: {formatMoney(r.price_override ?? group.price)}
                    {r.price_override != null ? ' (سعر خاص)' : ''}
                    {r.prepaid_sessions != null ? ` · مدفوع مسبقاً: ${r.prepaid_sessions} حصة` : ''}
                  </>
                }
                trailing={
                  <span className="text-muted text-[13.5px]" dir="ltr">
                    {r.student_code}
                  </span>
                }
              />
            </Link>
          ))}
        </Card>
      )}

      <h3 className="type-section mt-5 mb-2">قائمة الانتظار ({waitlist.length})</h3>
      <Card>
        {waitlistQ.isPending ? (
          <LoadingState label="بنحمّل قائمة الانتظار…" />
        ) : waitlist.length === 0 ? (
          <p className="text-muted text-[13.5px] mt-0">لا أحد في الانتظار حالياً.</p>
        ) : (
          waitlist.map((w) => (
            <div key={w.id} className="py-2 border-b border-border last:border-0">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-semibold text-[15px] flex items-center gap-2 flex-wrap">
                    {w.name}
                    {w.source === 'booking_page' && (
                      <span className="text-[12px] font-bold bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                        صفحة الحجز
                      </span>
                    )}
                    {w.wants_trial && (
                      <span className="text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                        يريد حصة تجريبية
                      </span>
                    )}
                  </div>
                  {w.note && <div className="text-muted text-[13.5px]">{w.note}</div>}
                </div>
                {w.phone && (
                  <a href={`tel:${w.phone}`} className="text-primary text-[13.5px] font-semibold shrink-0" dir="ltr">
                    {w.phone}
                  </a>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="soft"
                  className="min-h-[40px] text-[13.5px] px-3"
                  onClick={() => void acceptWl(w)}
                  disabled={wlActionId === w.id}
                >
                  {wlActionId === w.id && acceptWaitlist.isPending ? 'بنسجّل…' : 'قبول وتسجيل في المجموعة'}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-[40px] text-[13.5px] px-3"
                  onClick={() => void removeWl(w)}
                  disabled={wlActionId === w.id}
                >
                  حذف الطلب
                </Button>
              </div>
            </div>
          ))
        )}
        {wlActionError && <FormError message={wlActionError} />}
        {isArchived ? (
          <p className="text-muted text-[13.5px] border-t border-border mt-2 pt-3 mb-0">
            الإضافة لقائمة الانتظار متوقفة لأن المجموعة مؤرشفة.
          </p>
        ) : (
        <div className="border-t border-border mt-2 pt-3">
          <Field label="اسم المنتظر *">
            <TextInput value={wlName} onChange={(e) => setWlName(e.target.value)} placeholder="الاسم" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الموبايل">
              <TextInput type="tel" dir="ltr" value={wlPhone} onChange={(e) => setWlPhone(e.target.value)} placeholder="01xxxxxxxxx" />
            </Field>
            <Field label="ملاحظة">
              <TextInput value={wlNote} onChange={(e) => setWlNote(e.target.value)} />
            </Field>
          </div>
          {wlError && <FormError message={wlError} />}
          <Button full variant="soft" onClick={submitWaitlist} disabled={addWaitlist.isPending}>
            {addWaitlist.isPending ? 'بنضيف…' : '+ إضافة لقائمة الانتظار'}
          </Button>
        </div>
        )}
      </Card>

      {/* منطقة الخطر — حذف/أرشفة آمنة (خطوة 10):
          الأرشفة (archived_at من 0007) توقف توليد الحصص والتسجيل الجديد مع
          حفظ التاريخ كاملاً. الحذف النهائي للمالك فقط ولمجموعة فارغة تماماً
          (لا تسجيلات/حصص/فواتير/تقييمات)، وبعد كتابة اسم المجموعة كاملاً. */}
      <Card className="border-bad/50 mt-5">
        <div className="flex items-center gap-2 mb-2">
          <TriangleAlert size={20} className="text-bad-text" />
          <span className="font-extrabold text-[15px] text-bad-text">منطقة الخطر</span>
        </div>

        {isArchived ? (
          <>
            <Button
              variant="primary"
              full
              disabled={setGroupArchived.isPending}
              onClick={async () => {
                await setGroupArchived.mutateAsync({ groupId: group.id, archived: false })
                toast(`تم إلغاء أرشفة مجموعة «${group.name}»`)
              }}
            >
              <ArchiveRestore size={20} /> إلغاء أرشفة المجموعة
            </Button>
            <p className="text-muted text-[13.5px] mt-2 mb-0">
              إلغاء الأرشفة يعيد المجموعة للتشغيل: توليد حصص جديدة وظهورها كخيار تسجيل.
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
              <Archive size={20} /> أرشفة المجموعة
            </Button>
            <p className="text-muted text-[13.5px] mt-2 mb-0">
              الأرشفة توقف توليد الحصص الجديدة والتسجيل الجديد في المجموعة، مع بقاء كل بياناتها التاريخية سليمة، ويمكن التراجع عنها في أي وقت.
            </p>
          </>
        )}

        <div className="border-t border-border mt-3 pt-3">
          {isAssistant ? (
            <p className="text-muted text-[13.5px] m-0">
              الحذف النهائي متاح لمالك الحساب فقط — السجلات المالية محجوبة عن المساعد.
            </p>
          ) : footprintQ.isPending ? (
            <p className="text-muted text-[13.5px] m-0">بنفحص سجلات المجموعة قبل إتاحة الحذف…</p>
          ) : footprintQ.error ? (
            <p className="text-bad-text text-[13.5px] m-0">
              تعذّر فحص سجلات المجموعة، فالحذف النهائي غير متاح الآن. جرّب تحديث الصفحة.
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
                <Trash2 size={20} /> حذف المجموعة نهائياً
              </Button>
              <p className="text-muted text-[13.5px] mt-2 mb-0">
                المجموعة بلا تسجيلات ولا حصص ولا فواتير، فالحذف النهائي مسموح — وسيُطلب منك كتابة اسمها كاملاً للتأكيد.
              </p>
            </>
          ) : (
            <p className="text-[13.5px] m-0 leading-relaxed">
              <span className="font-bold text-bad-text">الحذف النهائي غير متاح: </span>
              المجموعة لها تاريخ محفوظ ({footprintQ.data?.enrollmentCount ?? 0} تسجيل، {footprintQ.data?.sessionCount ?? 0} حصة، {footprintQ.data?.invoiceCount ?? 0} فاتورة، {footprintQ.data?.assessmentCount ?? 0} تقييم).
              البيانات التاريخية والمالية لا تُحذف — المتاح لهذه المجموعة هو الأرشفة فقط.
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
        title={dangerMode === 'delete' ? 'حذف المجموعة نهائياً' : 'أرشفة المجموعة'}
        entityName={group.name}
        mode={dangerMode === 'delete' ? 'delete' : 'archive'}
        confirmLabel={dangerMode === 'delete' ? 'نعم، احذف نهائياً' : 'نعم، أرشف المجموعة'}
        pending={setGroupArchived.isPending || deleteGroup.isPending}
        error={dangerError}
        onConfirm={confirmDanger}
        onClose={() => setDangerMode(null)}
        lines={
          dangerMode === 'delete'
            ? [
                `ستُحذف مجموعة «${group.name}» نهائياً ولا يمكن التراجع.`,
                'المجموعة بلا تسجيلات ولا حصص ولا فواتير ولا تقييمات (تحققنا من سجلاتها)، فلن يضيع أي سجل مالي أو تاريخي.',
                ...(footprintQ.data && footprintQ.data.waitlistCount > 0
                  ? [`تنبيه: قائمة انتظار المجموعة فيها ${footprintQ.data.waitlistCount} اسم — ستُحذف هذه الأسماء مع المجموعة.`]
                  : []),
              ]
            : [
                `سيتم إيقاف مجموعة «${group.name}» وأرشفتها.`,
                'ستتوقف عن توليد حصص جديدة ولن تظهر كخيار عند تسجيل طالب جديد، وستظهر في قائمة المجموعات ضمن فلتر «المؤرشفة» فقط.',
                'كل بياناتها التاريخية (الحصص والحضور والفواتير والتقييمات) ستبقى سليمة وقابلة للعرض، ويمكنك إلغاء الأرشفة في أي وقت من هذه الصفحة.',
              ]
        }
      />
    </div>
  )
}
