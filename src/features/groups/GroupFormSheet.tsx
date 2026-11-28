import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import { Sheet } from '../../components/ui/Sheet'
import { AlertTriangle, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Chip, Field, FieldError, FormError, Select, TextArea, TextInput } from '../../components/ui/form'
import type { BillingType, GroupInput, GroupRow, GroupSlot } from '../../types/database'
import { BILLING_LABELS, BILLING_TYPES, DAY_NAMES, safeExternalUrl, shortTime } from '../../lib/format'
import { useCreateGroup, useUpdateGroup } from './hooks'
import { groupSlotsOf, slotProblem, slotsOverlap, slotsToMirrors } from './slots'

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

/** كشف تعارض المواعيد (المواصفات §5.4): موعد مرشّح يتداخل مع أي موعد لمجموعة
 * أخرى في نفس اليوم — تنبيه فقط، لا يمنع الحفظ (3A-926: كل المواعيد تُفحص) */
function findConflicts(
  groups: GroupRow[],
  candidateSlots: GroupSlot[],
  excludeId: string | null,
): Conflict[] {
  const out: Conflict[] = []
  for (const g of groups) {
    if (excludeId && g.id === excludeId) continue
    for (const other of groupSlotsOf(g)) {
      if (candidateSlots.some((c) => slotsOverlap(c, other))) {
        out.push({
          name: g.name,
          days: DAY_NAMES[other.day],
          time: shortTime(other.start_time),
        })
        break
      }
    }
  }
  return out
}

/** صف موعد قابل للتحرير: اليوم رقاقة واحدة، والوقت/المدة نصّان كحقول النموذج */
interface SlotDraft {
  day: number
  time: string
  duration: string
}

const MAX_SLOTS = 14

/**
 * فورم مجموعة (جديد/تعديل) — حقول المواصفات §4 مودال group:
 * الاسم (إلزامي)، نظام الدفع من الأنظمة الأربعة، السعر، المواعيد الأسبوعية
 * (3A-926: صفوف مواعيد قابلة للإضافة والحذف — يوم + وقت بداية + مدة لكل
 * موعد)، القاعة/المكان، السعة، المساعد، روابط الملازم (سطر لكل رابط).
 * أخطاء الحقول تظهر تحت حقولها وتُمسح فور تعبئة الحقل (3A-925 بند ٥).
 */
export function GroupFormSheet({ onClose, teacherId, groups, initial }: GroupFormSheetProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [billing, setBilling] = useState<BillingType>(initial?.billing_type ?? 'monthly_fixed')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [slots, setSlots] = useState<SlotDraft[]>(
    initial
      ? groupSlotsOf(initial).map((s) => ({
          day: s.day,
          time: s.start_time,
          duration: String(s.duration_minutes),
        }))
      : [{ day: new Date().getDay(), time: '15:00', duration: '60' }],
  )
  const [room, setRoom] = useState(initial?.room ?? '')
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : '')
  const [assistant, setAssistant] = useState(initial?.assistant_name ?? '')
  const [links, setLinks] = useState((initial?.links ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)
  // أخطاء الحقول — كل خطأ يظهر مباشرة تحت حقله (بحث §5) ويمسحه أول تعديل
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    slots?: string
    price?: string
    capacity?: string
    links?: string
  }>({})

  const createGroup = useCreateGroup(teacherId)
  const updateGroup = useUpdateGroup(teacherId)
  const saving = createGroup.isPending || updateGroup.isPending

  /** مسح خطأ حقل بمجرد تعبئته/تعديله (3A-925 بند ٥) — لا انتظار لمحاولة حفظ جديدة */
  const clearErr = (key: keyof typeof fieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))

  const updateSlot = (i: number, patch: Partial<SlotDraft>) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
    clearErr('slots')
  }
  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      { day: prev[prev.length - 1]?.day ?? new Date().getDay(), time: '15:00', duration: '60' },
    ])
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, j) => j !== i))

  const conflicts = useMemo(() => {
    const parsed = slots
      .map((s) => ({ day: s.day, start_time: s.time, duration_minutes: Number(s.duration) || 0 }))
      .filter((s) => s.start_time && s.duration_minutes > 0)
    if (!parsed.length) return []
    return findConflicts(groups, parsed, initial?.id ?? null)
  }, [groups, slots, initial])

  const save = async () => {
    setError(null)
    const errs: typeof fieldErrors = {}
    if (!name.trim()) errs.name = t('groups.formNameRequired')
    const parsedSlots: GroupSlot[] = slots.map((s) => ({
      day: s.day,
      start_time: s.time,
      duration_minutes: Number(s.duration),
    }))
    const problem = slotProblem(parsedSlots)
    if (problem === 'empty') errs.slots = t('groups.formDaysRequired')
    else if (problem === 'time') errs.slots = t('groups.formSlotTimeRequired')
    else if (problem === 'duration') errs.slots = t('groups.formDurationInvalid')
    const priceNum = price.trim() === '' ? 0 : Number(price)
    if (!Number.isFinite(priceNum) || priceNum < 0) errs.price = t('groups.formPriceInvalid')
    const linkList = links
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (linkList.some((l) => safeExternalUrl(l) === null))
      errs.links = t('groups.formLinksInvalid')
    const capNum = capacity.trim() === '' ? null : Number(capacity)
    if (capNum !== null && (!Number.isInteger(capNum) || capNum <= 0))
      errs.capacity = t('groups.formCapacityInvalid')
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    const input: GroupInput = {
      name: name.trim(),
      billing_type: billing,
      price: priceNum,
      // المرايا القديمة مشتقة من المواعيد في نقطة واحدة (slotsToMirrors)
      ...slotsToMirrors(parsedSlots),
      slots: parsedSlots,
      room: room.trim() === '' ? null : room.trim(),
      capacity: capNum,
      assistant_name: assistant.trim() === '' ? null : assistant.trim(),
      links: linkList,
    }
    try {
      if (initial) await updateGroup.mutateAsync({ groupId: initial.id, input })
      else await createGroup.mutateAsync(input)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('groups.formSaveError'))
    }
  }

  return (
    <Sheet
      open
      title={initial ? t('groups.formEditTitle') : t('groups.formCreateTitle')}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button full onClick={save} disabled={saving}>
            <Save size={18} />
            {saving ? t('groups.saving') : t('groups.formSave')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('groups.cancel')}
          </Button>
        </div>
      }
    >
      <h4 className="type-section mb-2">{t('groups.formBasicTitle')}</h4>
      <Field label={t('groups.formNameLabel')} error={fieldErrors.name}>
        <TextInput
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            clearErr('name')
          }}
          placeholder={t('groups.formNamePlaceholder')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('groups.formBillingLabel')}>
          <Select value={billing} onChange={(e) => setBilling(e.target.value as BillingType)}>
            {BILLING_TYPES.map((b) => (
              <option key={b} value={b}>
                {BILLING_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('groups.formPriceLabel')} error={fieldErrors.price}>
          <TextInput
            type="number"
            min={0}
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value)
              clearErr('price')
            }}
            placeholder="0"
          />
        </Field>
      </div>

      <h4 className="type-section mb-2 mt-2">{t('groups.formScheduleTitle')}</h4>
      {slots.map((slot, i) => (
        <div key={i} className="border border-border rounded-xl p-3 mb-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13.5px] font-bold">{t('groups.formSlotTitle', { n: i + 1 })}</span>
            {slots.length > 1 && (
              <button
                type="button"
                aria-label={t('groups.formRemoveSlot')}
                onClick={() => removeSlot(i)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-bad-text hover:bg-bad/10 border-0 bg-transparent cursor-pointer"
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
          <div className="text-[13.5px] text-muted font-semibold mb-1">{t('groups.formSlotDayLabel')}</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {DAY_NAMES.map((label, d) => (
              <Chip key={d} active={slot.day === d} onClick={() => updateSlot(i, { day: d })}>
                {label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('groups.formStartLabel')}>
              <TextInput
                type="time"
                dir="ltr"
                value={slot.time}
                onChange={(e) => updateSlot(i, { time: e.target.value })}
              />
            </Field>
            <Field label={t('groups.formDurationLabel')}>
              <TextInput
                type="number"
                min={30}
                step={15}
                inputMode="numeric"
                value={slot.duration}
                onChange={(e) => updateSlot(i, { duration: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ))}
      {fieldErrors.slots ? <FieldError message={fieldErrors.slots} /> : null}
      {slots.length < MAX_SLOTS && (
        <Button variant="soft" onClick={addSlot} className="mb-3">
          <Plus size={18} />
          {t('groups.formAddSlot')}
        </Button>
      )}

      <h4 className="type-section mb-2 mt-2">{t('groups.formExtraTitle')}</h4>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('groups.formRoomLabel')}>
          <TextInput value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t('groups.formRoomPlaceholder')} />
        </Field>
        <Field label={t('groups.formCapacityLabel')} error={fieldErrors.capacity}>
          <TextInput
            type="number"
            min={1}
            inputMode="numeric"
            value={capacity}
            onChange={(e) => {
              setCapacity(e.target.value)
              clearErr('capacity')
            }}
          />
        </Field>
      </div>
      <Field label={t('groups.formAssistantLabel')}>
        <TextInput value={assistant} onChange={(e) => setAssistant(e.target.value)} />
      </Field>
      <Field label={t('groups.formLinksLabel')} error={fieldErrors.links}>
        <TextArea
          rows={3}
          dir="ltr"
          value={links}
          onChange={(e) => {
            setLinks(e.target.value)
            clearErr('links')
          }}
          placeholder={'https://…'}
        />
      </Field>

      {conflicts.length > 0 && (
        <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2 mb-3 text-[13.5px]">
          <div className="font-bold text-warn-text mb-1 flex items-center gap-2"><AlertTriangle size={20} /> {t('groups.conflictTitle')}</div>
          {conflicts.map((c, i) => (
            <div key={i}>
              {t('groups.conflictLine', { name: c.name, days: c.days, time: c.time })}
            </div>
          ))}
        </div>
      )}

      {error && <FormError message={error} />}
    </Sheet>
  )
}
