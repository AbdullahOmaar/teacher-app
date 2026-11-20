import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextInput } from '../../components/ui/form'
import type { EnrollmentRow, GroupRow, StudentInput, StudentRow } from '../../types/database'
import {
  useCreateStudent,
  useDeleteEnrollment,
  useUpdateStudent,
  useUpsertEnrollment,
} from './hooks'

interface StudentFormSheetProps {
  onClose: () => void
  teacherId: string
  groups: GroupRow[]
  /** null = طالب جديد */
  initial: StudentRow | null
  initialEnrollments: EnrollmentRow[]
}

interface GroupDraft {
  checked: boolean
  price: string
  prepaid: string
}

const emptyToNull = (v: string) => {
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * فورم طالب (جديد/تعديل) — حقول المواصفات §4 مودال student:
 * الاسم (إلزامي)، الصف، المدرسة، موبايل الطالب، ولي الأمر وموبايله،
 * ملاحظات المستوى، ولكل مجموعة: تفعيل + سعر خاص + حصص مدفوعة مسبقاً
 * (الأخير لمجموعات per_session_prepaid فقط).
 */
export function StudentFormSheet({
  onClose,
  teacherId,
  groups,
  initial,
  initialEnrollments,
}: StudentFormSheetProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [grade, setGrade] = useState(initial?.grade ?? '')
  const [school, setSchool] = useState(initial?.school ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [guardianName, setGuardianName] = useState(initial?.guardian_name ?? '')
  const [guardianPhone, setGuardianPhone] = useState(initial?.guardian_phone ?? '')
  const [levelNote, setLevelNote] = useState(initial?.level_note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>(() => {
    const map: Record<string, GroupDraft> = {}
    for (const g of groups) {
      const enr = initialEnrollments.find((e) => e.group_id === g.id)
      map[g.id] = {
        checked: Boolean(enr),
        price: enr?.price_override != null ? String(enr.price_override) : '',
        prepaid: enr?.prepaid_sessions != null ? String(enr.prepaid_sessions) : '',
      }
    }
    return map
  })

  const createStudent = useCreateStudent(teacherId)
  const updateStudent = useUpdateStudent(teacherId)
  const upsertEnrollment = useUpsertEnrollment(teacherId)
  const deleteEnrollment = useDeleteEnrollment(teacherId)

  const existingByGroup = useMemo(
    () => new Map(initialEnrollments.map((e) => [e.group_id, e])),
    [initialEnrollments],
  )

  const patchDraft = (gid: string, patch: Partial<GroupDraft>) =>
    setDrafts((prev) => ({ ...prev, [gid]: { ...prev[gid], ...patch } }))

  const save = async () => {
    setError(null)
    setNameError(null)
    if (!name.trim()) return setNameError('اسم الطالب إلزامي')
    const input: StudentInput = {
      name: name.trim(),
      grade: emptyToNull(grade),
      school: emptyToNull(school),
      phone: emptyToNull(phone),
      guardian_name: emptyToNull(guardianName),
      guardian_phone: emptyToNull(guardianPhone),
      level_note: emptyToNull(levelNote),
      paused: initial?.paused ?? false,
    }
    setSaving(true)
    try {
      const student = initial
        ? await updateStudent.mutateAsync({ studentId: initial.id, input })
        : await createStudent.mutateAsync(input)

      // مزامنة التسجيلات مع حالة الـ checkboxes
      for (const g of groups) {
        const draft = drafts[g.id]
        const existing = existingByGroup.get(g.id)
        if (draft?.checked) {
          const priceNum = draft.price.trim() === '' ? null : Number(draft.price)
          if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0))
            throw new Error(`السعر الخاص في مجموعة «${g.name}» غير صحيح`)
          const prepaidNum = draft.prepaid.trim() === '' ? null : Number(draft.prepaid)
          if (prepaidNum !== null && (!Number.isInteger(prepaidNum) || prepaidNum < 0))
            throw new Error(`عدد الحصص المدفوعة مسبقاً في مجموعة «${g.name}» غير صحيح`)
          await upsertEnrollment.mutateAsync({
            student_id: student.id,
            group_id: g.id,
            price_override: priceNum,
            prepaid_sessions: g.billing_type === 'per_session_prepaid' ? prepaidNum : null,
          })
        } else if (existing) {
          await deleteEnrollment.mutateAsync(existing.id)
        }
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={initial ? 'تعديل طالب' : 'طالب جديد'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button full onClick={save} disabled={saving}>
            {saving ? 'بنحفظ…' : 'حفظ'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <h4 className="type-section mb-2">بيانات الطالب</h4>
      <Field label="الاسم *" error={nameError}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الطالب" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الصف">
          <TextInput value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="مثال: 3 ثانوي" />
        </Field>
        <Field label="المدرسة">
          <TextInput value={school} onChange={(e) => setSchool(e.target.value)} />
        </Field>
      </div>
      <Field label="موبايل الطالب">
        <TextInput type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ولي الأمر">
          <TextInput value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="ولي الأمر" />
        </Field>
        <Field label="موبايل ولي الأمر">
          <TextInput type="tel" dir="ltr" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="01xxxxxxxxx" />
        </Field>
      </div>
      <Field label="ملاحظات المستوى">
        <TextInput value={levelNote} onChange={(e) => setLevelNote(e.target.value)} />
      </Field>

      {groups.length > 0 && (
        <div className="mb-3">
          <h4 className="type-section mb-2 mt-2">التسجيل في المجموعات</h4>
          {groups.map((g) => {
            const draft = drafts[g.id] ?? { checked: false, price: '', prepaid: '' }
            return (
              <div key={g.id} className="border border-border rounded-xl px-3 py-2 mb-2">
                <label className="flex items-center gap-2 cursor-pointer min-h-[48px]">
                  <input
                    type="checkbox"
                    checked={draft.checked}
                    onChange={(e) => patchDraft(g.id, { checked: e.target.checked })}
                    className="w-5 h-5 accent-[#4f46e5]"
                  />
                  <span className="font-semibold text-[15px]">{g.name}</span>
                  <span className="text-muted text-[13.5px]">سعر المجموعة: {g.price} ج</span>
                </label>
                {draft.checked && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <TextInput
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={draft.price}
                      onChange={(e) => patchDraft(g.id, { price: e.target.value })}
                      placeholder="سعر خاص (اختياري)"
                    />
                    {g.billing_type === 'per_session_prepaid' && (
                      <TextInput
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={draft.prepaid}
                        onChange={(e) => patchDraft(g.id, { prepaid: e.target.value })}
                        placeholder="حصص مدفوعة مسبقاً"
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && <FormError message={error} />}
    </Sheet>
  )
}
