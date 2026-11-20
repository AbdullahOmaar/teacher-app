import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { Field, FormError, TextInput } from './form'

interface DangerConfirmSheetProps {
  open: boolean
  title: string
  /** اسم العنصر (طالب/مجموعة) — يُعرض في الشرح، وكتابته شرط للحذف النهائي */
  entityName: string
  /** شرح دقيق بالعربية: ما سيحدث بالضبط لهذا العنصر ولماذا */
  lines: string[]
  mode: 'archive' | 'delete'
  confirmLabel: string
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

/**
 * تأكيد صريح لأفعال منطقة الخطر (خطوة 10): شرح كامل قبل أي تنفيذ،
 * والحذف النهائي لا يُفعَّل زره إلا بعد كتابة اسم العنصر كاملاً —
 * لا حذف بنقرة واحدة عابرة أبداً. الأرشفة (قابلة للتراجع) بتأكيد واحد صريح.
 */
export function DangerConfirmSheet({
  open,
  title,
  entityName,
  lines,
  mode,
  confirmLabel,
  pending = false,
  error,
  onConfirm,
  onClose,
}: DangerConfirmSheetProps) {
  const [typed, setTyped] = useState('')
  // تصفير حقل الكتابة عند كل فتح جديد (نمط ضبط الحالة أثناء التصيير)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTyped('')
  }

  const deleteReady = mode !== 'delete' || typed.trim() === entityName.trim()

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="flex gap-2 items-start bg-bad/10 border border-bad/40 rounded-xl px-3 py-2.5 mb-3">
        <TriangleAlert size={20} className="text-bad-text shrink-0 mt-0.5" />
        <div className="text-[14.5px] leading-relaxed">
          {lines.map((line, i) => (
            <p key={i} className={i === 0 ? 'mt-0' : ''}>
              {line}
            </p>
          ))}
        </div>
      </div>

      {mode === 'delete' && (
        <Field label={`للتأكيد اكتب اسم «${entityName}» كاملاً`}>
          <TextInput
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={entityName}
            autoComplete="off"
          />
        </Field>
      )}

      {error && <FormError message={error} />}

      <Button
        variant={mode === 'delete' ? 'danger' : 'primary'}
        full
        disabled={!deleteReady || pending}
        onClick={onConfirm}
      >
        {pending ? 'جارٍ التنفيذ…' : confirmLabel}
      </Button>
      <Button variant="ghost" full className="mt-2" onClick={onClose} disabled={pending}>
        لا، إلغاء
      </Button>
    </Sheet>
  )
}
