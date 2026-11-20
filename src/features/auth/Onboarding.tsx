import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/AuthProvider'
import { ensureTeacherProfile } from './api'

/**
 * شاشة إكمال الإعداد (Onboarding): تظهر لمستخدم مسجل دخوله لكن لا يوجد
 * له صف teachers بعد — غالباً لأن تأكيد البريد أجّل إنشاء الملف، أو
 * الحساب أُنشئ قبل بناء خطوة Auth. تُنشئ صف المدرس + إعداداته
 * الافتراضية بمعرّف المستخدم الحالي فقط (متوافق مع RLS).
 */
export function Onboarding() {
  const { user, signOut } = useAuth()
  const qc = useQueryClient()
  const meta = (user?.user_metadata ?? {}) as { display_name?: string; phone?: string | null }

  const [displayName, setDisplayName] = useState(meta.display_name ?? '')
  const [phone, setPhone] = useState(meta.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!displayName.trim()) {
      setError('اكتب اسمك (هيظهر كاسم المدرس في التطبيق).')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await ensureTeacherProfile(user.id, displayName, phone || null)
      await qc.invalidateQueries({ queryKey: ['current-teacher'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إنشاء ملف المدرس.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="text-center py-6">
      <div className="text-[34px] mb-2">🧑‍🏫</div>
      <div className="font-extrabold mb-1">أهلاً بيك — كمّل إعداد حسابك</div>
      <p className="text-muted text-[13px] mb-4">
        حسابك مسجل دخوله ({user?.email ?? ''})، فاضل خطوة واحدة: إنشاء ملف المدرس
        الخاص بيك وإعداداته الافتراضية.
      </p>
      {error && (
        <p className="bg-[#FEF2F2] text-bad text-[13px] rounded-xl px-3 py-2 mb-3" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="text-start">
        <Field label="اسم المدرس">
          <TextInput
            autoComplete="name"
            placeholder="مثال: مستر أحمد سامي"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </Field>
        <Field label="رقم الموبايل (اختياري)">
          <TextInput
            type="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Button full type="submit" disabled={busy}>
          {busy ? 'جارٍ الإنشاء…' : 'إنشاء ملف المدرس والبدء'}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-4 bg-transparent border-0 text-muted text-[13px] cursor-pointer underline"
      >
        تسجيل الخروج
      </button>
    </Card>
  )
}
