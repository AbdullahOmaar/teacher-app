import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/AuthProvider'

/** صفحة تسجيل الدخول — placeholder حتى يُبنى Auth الحقيقي بـ Supabase */
export function LoginPage() {
  const { configured } = useAuth()
  return (
    <div className="min-h-screen bg-bg text-text flex items-start justify-center">
      <div className="w-full max-w-[640px] px-4 pt-16">
        <div className="text-center mb-6">
          <div className="text-[40px] mb-2">🎓</div>
          <h1 className="text-[20px] font-extrabold m-0">تطبيق المدرس</h1>
          <p className="text-muted text-[13px] mt-1">سجّل دخولك علشان تكمل</p>
        </div>
        <Card>
          <label className="block text-[13px] text-muted font-semibold mb-1">رقم الموبايل أو البريد</label>
          <input
            className="w-full border border-border rounded-xl px-3 min-h-[48px] bg-card text-text mb-3"
            placeholder="01xxxxxxxxx"
            disabled
          />
          <label className="block text-[13px] text-muted font-semibold mb-1">كلمة المرور</label>
          <input
            type="password"
            className="w-full border border-border rounded-xl px-3 min-h-[48px] bg-card text-text mb-4"
            placeholder="••••••••"
            disabled
          />
          <Button full disabled>
            دخول
          </Button>
          {!configured && (
            <p className="text-warn text-[13px] mt-3 mb-0 text-center">
              وضع تجريبي: لسه Supabase مش مربوط — عبّي قيم .env علشان الدخول يشتغل.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
