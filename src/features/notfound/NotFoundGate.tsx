import { lazy, Suspense } from 'react'
import { useAuth } from '../../lib/AuthProvider'
import { AppShell } from '../../components/layout/AppShell'
import { MascotSplash } from '../../components/mascot/MascotLoader'
import { LoadingState } from '../../components/ui/states'

/*
 * بوابة 404 الوحيدة الواعية بالجلسة (إصلاح 3A-331 — عائلة د):
 * قبلها كان في App.tsx مسارا `*` متنافسان — واحد داخل فرع
 * RequireAuth>AppShell وآخر علوي منفرد — وتعادل الدرجات كان يُحسم
 * بترتيب الإعلان لصالح فرع الجلسة، فكان RequireAuth يحوّل غير
 * المسجّل إلى /login قبل أن يُرسم أي 404، والفرع المنفرد لا يُبلَغ
 * أبداً (لقطة notfound-public كانت مطابقة للقطة الدخول).
 * الآن بوابة واحدة عند المسار العلوي `*` فقط، وهي لا تُركَّب إلا
 * لمسار لم يطابق أي مسار معروف: المسارات الداخلية المعروفة
 * (‎/students‎ إلخ) تطابق مساراتها داخل فرع RequireAuth أولاً
 * (درجاتها أعلى من `*`) فلا تصل هنا أصلاً، ويبقى تحويلها إلى
 * /login مع state.from من RequireAuth كما هو بلا أي تغيير،
 * والمسارات العامة (/login, /book, /exam, /portal…) لا تتأثر.
 */
const NotFoundPage = lazy(() =>
  import('./NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

export function NotFoundGate() {
  const { session, loading, configured } = useAuth()

  // أثناء فحص الجلسة: نفس سبلاش RequireAuth حتى لا يومض أي شكل
  if (loading) {
    return <MascotSplash />
  }

  // بلا جلسة (أو بلا إعداد Supabase أصلاً — لا دخول ممكن): المنفردة
  if (!configured || !session) {
    return (
      <Suspense fallback={<LoadingState />}>
        <NotFoundPage standalone />
      </Suspense>
    )
  }

  // بجلسة: نفس الصفحة داخل قشرة التطبيق (children بدل Outlet)
  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>
        <NotFoundPage />
      </Suspense>
    </AppShell>
  )
}
