import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Field, Select, TextInput } from '../../components/ui/form'
import type { GroupRow, StudentRow } from '../../types/database'
import { useUpsertEnrollment } from './hooks'

interface EnrollStudentSheetProps {
  onClose: () => void
  teacherId: string
  groups: GroupRow[]
  students: StudentRow[]
  /** مثبّت من ملف الطالب: نسجّل هذا الطالب في مجموعة نختارها */
  fixedStudentId?: string
  /** مثبّت من تفاصيل المجموعة: نضيف طالباً نختاره لهذه المجموعة */
  fixedGroupId?: string
  /** معرّفات مستبعدة من الاختيار (مسجلون بالفعل) */
  excludeGroupIds?: Set<string>
  excludeStudentIds?: Set<string>
}

/**
 * تسجيل طالب في مجموعة مع سعر خاص اختياري (enrollments.price_override)
 * وعدد حصص مدفوعة مسبقاً لمجموعات per_session_prepaid فقط.
 */
export function EnrollStudentSheet({
  onClose,
  teacherId,
  groups,
  students,
  fixedStudentId,
  fixedGroupId,
  excludeGroupIds,
  excludeStudentIds,
}: EnrollStudentSheetProps) {
  const [studentId, setStudentId] = useState(fixedStudentId ?? '')
  const [groupId, setGroupId] = useState(fixedGroupId ?? '')
  const [price, setPrice] = useState('')
  const [prepaid, setPrepaid] = useState('')
  const [error, setError] = useState<string | null>(null)
  const upsert = useUpsertEnrollment(teacherId)

  const groupOptions = useMemo(
    () => groups.filter((g) => !excludeGroupIds?.has(g.id)),
    [groups, excludeGroupIds],
  )
  const studentOptions = useMemo(
    () => students.filter((s) => !s.paused && !excludeStudentIds?.has(s.id)),
    [students, excludeStudentIds],
  )
  const selectedGroup = groups.find((g) => g.id === groupId)

  const save = async () => {
    setError(null)
    if (!studentId) return setError('اختار الطالب الأول')
    if (!groupId) return setError('اختار المجموعة الأول')
    const priceNum = price.trim() === '' ? null : Number(price)
    if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0))
      return setError('السعر الخاص لازم يكون رقماً صحيحاً (أو اتركه فارغاً لسعر المجموعة)')
    const prepaidNum = prepaid.trim() === '' ? null : Number(prepaid)
    if (prepaidNum !== null && (!Number.isInteger(prepaidNum) || prepaidNum < 0))
      return setError('عدد الحصص المدفوعة مسبقاً لازم يكون عدداً صحيحاً')
    try {
      await upsert.mutateAsync({
        student_id: studentId,
        group_id: groupId,
        price_override: priceNum,
        prepaid_sessions: selectedGroup?.billing_type === 'per_session_prepaid' ? prepaidNum : null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء التسجيل')
    }
  }

  return (
    <Sheet open title="تسجيل في مجموعة" onClose={onClose}>
      {!fixedStudentId && (
        <Field label="الطالب">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">— اختار الطالب —</option>
            {studentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.public_code})
              </option>
            ))}
          </Select>
        </Field>
      )}
      {!fixedGroupId && (
        <Field label="المجموعة">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">— اختار المجموعة —</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="سعر خاص للطالب (اختياري — فارغ = سعر المجموعة)">
        <TextInput
          type="number"
          min={0}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={selectedGroup ? String(selectedGroup.price) : ''}
        />
      </Field>
      {selectedGroup?.billing_type === 'per_session_prepaid' && (
        <Field label="عدد الحصص المدفوعة مسبقاً (اختياري)">
          <TextInput
            type="number"
            min={0}
            inputMode="numeric"
            value={prepaid}
            onChange={(e) => setPrepaid(e.target.value)}
          />
        </Field>
      )}
      {error && <p className="text-bad text-[13px] mb-3">{error}</p>}
      <div className="flex gap-2">
        <Button full onClick={save} disabled={upsert.isPending}>
          {upsert.isPending ? 'بنحفظ…' : 'تسجيل'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Sheet>
  )
}
