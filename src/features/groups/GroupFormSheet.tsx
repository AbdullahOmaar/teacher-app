import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Chip, Field, Select, TextArea, TextInput } from '../../components/ui/form'
import type { BillingType, GroupInput, GroupRow } from '../../types/database'
import { BILLING_LABELS, BILLING_TYPES, DAY_NAMES, shortTime, timeToMin } from '../../lib/format'
import { useCreateGroup, useUpdateGroup } from './hooks'

interface GroupFormSheetProps {
  onClose: () => void
  teacherId: string
  /** كل مجموعات المدرس — لكشف التعارض */
  groups: GroupRow[]
  /** null = مجموعة جديدة */
  initial: GroupRow | null
}

interface Conflict {
  name: string
  days: string
  time: string
}

/** كشف تعارض المواعيد (المواصفات §5.4): يوم مشترك + تداخل فترة — تنبيه فقط، لا يمنع الحفظ */
function findConflicts(
  groups: GroupRow[],
  candidate: { days: number[]; start: number; end: number },
  excludeId: string | null,
): Conflict[] {
  const out: Conflict[] = []
  for (const g of groups) {
    if (excludeId && g.id === excludeId) continue
    const shared = g.days.filter((d) => candidate.days.includes(d))
    if (!shared.length) continue
    const startB = timeToMin(g.start_time)
    const endB = startB + g.duration_minutes
    if (candidate.start < endB && startB < candidate.end) {
      out.push({
        name: g.name,
        days: shared.map((d) => DAY_NAMES[d]).join('، '),
        time: shortTime(g.start_time),
      })
    }
  }
  return out
}

/**
 * فورم مجموعة (جديد/تعديل) — حقول المواصفات §4 مودال group:
 * الاسم (إلزامي)، نظام الدفع من الأنظمة الأربعة، السعر، أيام الجدول (رقائق)،
 * الوقت، المدة (خطوة 15، حد أدنى 30)، القاعة/المكان، السعة، المساعد،
 * روابط الملازم (سطر لكل رابط — تشمل رابط الأونلاين).
 */
export function GroupFormSheet({ onClose, teacherId, groups, initial }: GroupFormSheetProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [billing, setBilling] = useState<BillingType>(initial?.billing_type ?? 'monthly_fixed')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [days, setDays] = useState<number[]>(initial?.days ?? [])
  const [time, setTime] = useState(initial ? shortTime(initial.start_time) : '15:00')
  const [duration, setDuration] = useState(initial ? String(initial.duration_minutes) : '60')
  const [room, setRoom] = useState(initial?.room ?? '')
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : '')
  const [assistant, setAssistant] = useState(initial?.assistant_name ?? '')
  const [links, setLinks] = useState((initial?.links ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)

  const createGroup = useCreateGroup(teacherId)
  const updateGroup = useUpdateGroup(teacherId)
  const saving = createGroup.isPending || updateGroup.isPending

  const conflicts = useMemo(() => {
    const dur = Number(duration) || 0
    if (!days.length || !time || dur <= 0) return []
    const start = timeToMin(time)
    return findConflicts(groups, { days, start, end: start + dur }, initial?.id ?? null)
  }, [groups, days, time, duration, initial])

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))

  const save = async () => {
    setError(null)
    if (!name.trim()) return setError('اسم المجموعة إلزامي')
    if (!days.length) return setError('اختار يوماً واحداً على الأقل في الجدول')
    const priceNum = price.trim() === '' ? 0 : Number(price)
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError('السعر غير صحيح')
    const durNum = Number(duration)
    if (!Number.isInteger(durNum) || durNum < 30) return setError('المدة لازم تكون 30 دقيقة على الأقل')
    const capNum = capacity.trim() === '' ? null : Number(capacity)
    if (capNum !== null && (!Number.isInteger(capNum) || capNum <= 0))
      return setError('السعة لازم تكون عدداً صحيحاً موجباً (أو فارغة = بلا حد)')

    const input: GroupInput = {
      name: name.trim(),
      billing_type: billing,
      price: priceNum,
      days,
      start_time: time,
      duration_minutes: durNum,
      room: room.trim() === '' ? null : room.trim(),
      capacity: capNum,
      assistant_name: assistant.trim() === '' ? null : assistant.trim(),
      links: links
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    }
    try {
      if (initial) await updateGroup.mutateAsync({ groupId: initial.id, input })
      else await createGroup.mutateAsync(input)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حصلت مشكلة أثناء الحفظ')
    }
  }

  return (
    <Sheet open title={initial ? 'تعديل مجموعة' : 'مجموعة جديدة'} onClose={onClose}>
      <Field label="اسم المجموعة *">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: فيزياء 3 ثانوي — السبت" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="نظام الدفع">
          <Select value={billing} onChange={(e) => setBilling(e.target.value as BillingType)}>
            {BILLING_TYPES.map((b) => (
              <option key={b} value={b}>
                {BILLING_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="السعر (ج)">
          <TextInput type="number" min={0} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </Field>
      </div>

      <div className="mb-3">
        <div className="text-[13.5px] text-muted font-semibold mb-1">أيام الجدول *</div>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((label, d) => (
            <Chip key={d} active={days.includes(d)} onClick={() => toggleDay(d)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="وقت البدء">
          <TextInput type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="المدة (دقيقة)">
          <TextInput type="number" min={30} step={15} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="المكان / القاعة">
          <TextInput value={room} onChange={(e) => setRoom(e.target.value)} placeholder="قاعة 2 — أو اتركه للأونلاين" />
        </Field>
        <Field label="السعة (فارغ = بلا حد)">
          <TextInput type="number" min={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
      </div>
      <Field label="اسم المساعد">
        <TextInput value={assistant} onChange={(e) => setAssistant(e.target.value)} />
      </Field>
      <Field label="روابط (ملازم / أونلاين) — سطر لكل رابط">
        <TextArea rows={3} dir="ltr" value={links} onChange={(e) => setLinks(e.target.value)} placeholder={'https://…'} />
      </Field>

      {conflicts.length > 0 && (
        <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2 mb-3 text-[13.5px]">
          <div className="font-bold text-warn-text mb-1 flex items-center gap-2"><AlertTriangle size={20} /> تعارض في المواعيد</div>
          {conflicts.map((c, i) => (
            <div key={i}>
              مع مجموعة «{c.name}» — أيام مشتركة: {c.days}، ميعادها {c.time}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-bad-text text-[13.5px] mb-3">{error}</p>}
      <div className="flex gap-2">
        <Button full onClick={save} disabled={saving}>
          {saving ? 'بنحفظ…' : 'حفظ'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Sheet>
  )
}
