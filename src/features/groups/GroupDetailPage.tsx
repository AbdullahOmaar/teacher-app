import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { BookOpenCheck, Link2, MapPin, Pencil, Users } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { BILLING_LABELS, daysLabel, formatMoney, shortTime } from '../../lib/format'
import { useStudents } from '../students/hooks'
import { EnrollStudentSheet } from '../students/EnrollStudentSheet'
import { useAddWaitlistEntry, useGroup, useGroupRoster, useGroups, useWaitlist } from './hooks'
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

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const groupQ = useGroup(teacherId, id)
  const groupsQ = useGroups(teacherId)
  const rosterQ = useGroupRoster(teacherId, id)
  const waitlistQ = useWaitlist(teacherId, id)
  const studentsQ = useStudents(teacherId)
  const addWaitlist = useAddWaitlistEntry(teacherId ?? '', id ?? '')

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
  const pct = group.capacity ? Math.min(100, Math.round((roster.length / group.capacity) * 100)) : null

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
          <div className="text-[16px] font-extrabold">{group.name}</div>
          <Button variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil size={20} />
            تعديل
          </Button>
        </div>
        <div className="text-muted text-[13.5px] mt-1 leading-relaxed">
          {BILLING_LABELS[group.billing_type]} · {formatMoney(group.price)}
          <br />
          {daysLabel(group.days)} · {shortTime(group.start_time)} ({group.duration_minutes} دقيقة)
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
        <div className="flex gap-2 mt-3">
          <Link to={`/students?group=${group.id}`} className="no-underline flex-1">
            <Button variant="soft" full>
              عرض في قائمة الطلاب
            </Button>
          </Link>
          <Button className="flex-1" onClick={() => setEnrollOpen(true)}>
            + إضافة طالب
          </Button>
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
            <div key={w.id} className="flex justify-between gap-2 py-2 border-b border-border last:border-0">
              <div>
                <div className="font-semibold text-[15px]">{w.name}</div>
                {w.note && <div className="text-muted text-[13.5px]">{w.note}</div>}
              </div>
              {w.phone && (
                <a href={`tel:${w.phone}`} className="text-primary text-[13.5px] font-semibold shrink-0" dir="ltr">
                  {w.phone}
                </a>
              )}
            </div>
          ))
        )}
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
    </div>
  )
}
