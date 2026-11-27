import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  Bell,
  ChevronRight,
  Home,
  LayoutGrid,
  Moon,
  ReceiptText,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { prefetchRoute } from '../../lib/routePrefetch'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useHomeAlerts } from '../../features/home/hooks'
import { useNewFeatures } from '../../features/newFeatures/hooks'
import { Onboarding } from '../../features/auth/Onboarding'
import { AccountDeletedScreen } from '../../features/auth/AccountDeletedScreen'
import { useAccountDeletedAt } from '../../hooks/useAccountDeleted'
import { AttendanceSyncBridge } from '../../features/attendance/SyncBridge'
import { OfflineStrip } from './OfflineStrip'
import { InstallButton } from '../InstallButton'
import { LoadingState } from '../ui/states'
import { t } from '../../i18n'
import { Logo } from '../brand/Logo'

/** عناوين الشاشات (من جدول titles في المرجع + شاشات المراحل اللاحقة:
    التحليلات والواجبات وسجل النشاط — عناوينها بنفس صياغة قائمة «المزيد»
    وعناوينها الداخلية حرفياً) */
const TITLES: Record<string, string> = {
  home: t('shell.title.home'),
  att: t('shell.title.att'),
  students: t('shell.title.students'),
  student: t('shell.title.student'),
  invoices: t('common.invoices'),
  invoice: t('shell.title.invoice'),
  more: t('shell.title.more'),
  schedule: t('shell.title.schedule'),
  groups: t('shell.title.groups'),
  grades: t('shell.title.grades'),
  assess: t('shell.title.assess'),
  money: t('shell.title.money'),
  notifications: t('shell.title.notifications'),
  export: t('shell.title.export'),
  backup: t('shell.title.backup'),
  settings: t('shell.title.settings'),
  portal: t('shell.title.portal'),
  atrisk: t('shell.title.atrisk'),
  analytics: t('shell.title.analytics'),
  homework: t('shell.title.homework'),
  assistant: t('assistant.title'),
  activity: t('shell.title.activity'),
  feedback: t('feedback.pageTitle'),
}

type TabKey = 'home' | 'students' | 'invoices' | 'more'

const TABS: { key: TabKey; path: string; icon: LucideIcon; label: string }[] = [
  { key: 'home', path: '/', icon: Home, label: t('shell.nav.home') },
  { key: 'students', path: '/students', icon: Users, label: t('shell.nav.students') },
  { key: 'invoices', path: '/invoices', icon: ReceiptText, label: t('common.invoices') },
  { key: 'more', path: '/more', icon: LayoutGrid, label: t('shell.nav.more') },
]

/** تحديد الشاشة والتبويب النشط من المسار — ربط الشاشات الفرعية بتبويباتها كما في المرجع (§6.4) */
function resolveRoute(pathname: string): { screen: string; tab: TabKey } {
  if (pathname === '/') return { screen: 'home', tab: 'home' }
  if (pathname.startsWith('/attendance') || pathname.startsWith('/notifications'))
    return { screen: pathname.startsWith('/notifications') ? 'notifications' : 'att', tab: 'home' }
  if (pathname.startsWith('/students/')) return { screen: 'student', tab: 'students' }
  if (pathname.startsWith('/students')) return { screen: 'students', tab: 'students' }
  if (pathname.startsWith('/invoices/')) return { screen: 'invoice', tab: 'invoices' }
  if (pathname.startsWith('/invoices')) return { screen: 'invoices', tab: 'invoices' }
  if (pathname.startsWith('/schedule')) return { screen: 'schedule', tab: 'more' }
  if (pathname.startsWith('/groups')) return { screen: 'groups', tab: 'more' }
  if (pathname.startsWith('/assessments/')) return { screen: 'assess', tab: 'more' }
  if (pathname.startsWith('/grades')) return { screen: 'grades', tab: 'more' }
  if (pathname.startsWith('/money')) return { screen: 'money', tab: 'more' }
  if (pathname.startsWith('/analytics')) return { screen: 'analytics', tab: 'more' }
  if (pathname.startsWith('/homework')) return { screen: 'homework', tab: 'more' }
  if (pathname.startsWith('/assistant')) return { screen: 'assistant', tab: 'more' }
  if (pathname.startsWith('/feedback')) return { screen: 'feedback', tab: 'more' }
  if (pathname.startsWith('/activity-log')) return { screen: 'activity', tab: 'more' }
  if (pathname.startsWith('/export')) return { screen: 'export', tab: 'more' }
  if (pathname.startsWith('/backup')) return { screen: 'backup', tab: 'more' }
  if (pathname.startsWith('/settings')) return { screen: 'settings', tab: 'more' }
  if (pathname.startsWith('/portal')) return { screen: 'portal', tab: 'more' }
  if (pathname.startsWith('/at-risk')) return { screen: 'atrisk', tab: 'home' }
  if (pathname.startsWith('/more')) return { screen: 'more', tab: 'more' }
  return { screen: 'home', tab: 'home' }
}

const TAB_ROOTS = new Set(['home', 'students', 'invoices', 'more'])

/**
 * قشرة التطبيق: تُركَّب كعنصر مسار (Outlet) للشاشات الداخلية، أو
 * بمحتوى صريح عبر children — بوابة 404 (NotFoundGate) تلفّ صفحتها
 * بالقشرة هكذا لأنها تعيش عند المسار العلوي `*` خارج شجرة المسارات
 * المتداخلة (إصلاح 3A-331). غياب children يعني سلوك Outlet الأصلي.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { toggle } = useTheme()
  const teacher = useCurrentTeacher()
  // حذف ناعم (0075 — F1): شاشة الحذف المصممة تحل محل المحتوى كله
  // متى كان الحساب معلّماً محذوفاً — فوق أي حالة حلّ هوية أخرى.
  const deletedAt = useAccountDeletedAt()
  const { screen, tab } = resolveRoute(location.pathname)
  const isRoot = TAB_ROOTS.has(screen)
  // شاشتا الطلاب والفواتير بنمط List-Detail عند ≥1024px (بحث §5):
  // الحاويات تتسع لهما فقط، وباقي الشاشات تبقى 640px كما هي
  const wide = location.pathname === '/students' || location.pathname === '/invoices'
  const containerCls = wide ? 'max-w-[640px] lg:max-w-[1180px]' : 'max-w-[640px]'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  // شارة التنبيهات: نفس استعلام وكاش بطاقة تنبيهات الرئيسية وشاشة
  // الإشعارات (useHomeAlerts → fetchAlerts بنفس مفتاح [HOME,'alerts',…])
  // — لا مصدر موازٍ، فالعدد هنا يطابق الشاشتين دائماً.
  const alertsQ = useHomeAlerts(teacherId, isOwner)
  // الشارة تعدّ أنواع التنبيهات النشطة لا عناصرها (3A-312 — ملحق أ):
  // التنبيهات مشتقّة لحظياً من البيانات (لا حالة مقروء/غير مقروء)،
  // وعدّ العناصر كان يضخّم الرقم بأنواع فردية لكل طالب (باقات/متأخرات:
  // ٥٩ من ٦٧ على الديمو) فيظهر كضوضاء مخيفة (٦٨ عند المالك) رغم أن
  // المطلوب فعلياً هو عدد طوابير العمل المحتاجة تصرّفاً — وهو ما تعرضه
  // صفحة الإشعارات أصلاً بأقسامها وعدّاداتها الكاملة خلف الجرس.
  // التنبيهات الصامتة (النسخ الاحتياطي P3 — W4/R-8) لا ترفعها أصلاً
  const alertsCount = alertsQ.data
    ? new Set(alertsQ.data.filter((a) => !a.silent).map((a) => a.kind)).size
    : 0
  // نقطة نظام «جديد» على تبويب «المزيد» (المهمة 24): كل الخصائص
  // المسجلة مداخلها تحت «المزيد»، فوجود أي خاصية غير مشاهَدة يرفع
  // نقطة على التبويب حتى تُفتح وتُختم من صفحتها.
  const { unseen: unseenFeaturesList } = useNewFeatures(teacherId)
  const hasUnseenFeatures = unseenFeaturesList.length > 0
  const isDark =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  const avatarLetter =
    teacher.status === 'ready' && teacher.teacher?.display_name
      ? teacher.teacher.display_name.trim().charAt(0)
      : t('shell.avatarFallback')
  const avatarUrl = teacher.status === 'ready' ? teacher.teacher?.avatar_url : null

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* مزامنة الحضور أوفلاين تعمل طوال الجلسة (إقلاع + عودة اتصال) */}
      <AttendanceSyncBridge />
      {/* الشريط العلوي — لاصق، أزراره أهداف لمس ≥48px (بحث §5) */}
      <header className="sticky top-0 z-20 bg-card border-b border-border shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)]">
        <div className={`mx-auto ${containerCls} px-2 flex items-center gap-1`}>
          {!isRoot ? (
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
              aria-label={t('shell.back')}
            >
              <ChevronRight size={24} />
            </button>
          ) : null}
          <div className="ps-2">
            <Logo size={26} />
          </div>
          <div className="type-section flex-1">{TITLES[screen] ?? t('shell.appName')}</div>
          {isRoot && (
            <>
              <button
                onClick={() => navigate('/notifications')}
                onPointerDown={() => prefetchRoute('/notifications')}
                className="relative w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
                aria-label={t('shell.notifications')}
              >
                <Bell size={24} />
                {alertsCount > 0 && (
                  <span className="absolute top-1 end-1 min-w-[20px] h-5 px-1 rounded-full bg-bad text-on-status type-badge flex items-center justify-center">
                    {alertsCount > 99 ? '99+' : alertsCount}
                  </span>
                )}
              </button>
              <button
                onClick={toggle}
                className="w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
                aria-label={t('shell.toggleTheme')}
              >
                {isDark ? <Sun size={24} /> : <Moon size={24} />}
              </button>
              <button
                onClick={() => navigate('/settings')}
                onPointerDown={() => prefetchRoute('/settings')}
                className="w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0"
                aria-label={t('shell.settings')}
              >
                <span className="w-9 h-9 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    avatarLetter
                  )}
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* شريط الأوفلاين العام (خطة الهوية P-9) — كل الشاشات عدا
          الحضور (شريط مزامنتها الوظيفي يغطيها ودُفّي مدمج فيه) */}
      {/* شريط الأوفلاين العام يظهر في كل الشاشات بما فيها الحضور
          (3A-384): شريط حالة المزامنة داخل الحضور صار لحالة الفشل فقط
          تنفيذاً لطلب المالك إخفاء كلام الحفظ/المزامنة، فلا ازدواج.
          وفي الحضور هو essential: مؤشر الأوفلاين الوحيد هناك، فيظهر
          ولو أُوقف دُفّي (بأيقونة بديلة — شرط المراجعة B2) */}
      <OfflineStrip containerCls={containerCls} essential={screen === 'att'} />

      {/* المحتوى — حاوية 640px وحشوة سفلية تترك مكاناً للشريط السفلي (64px + safe-area) */}
      <main className={`mx-auto ${containerCls} px-4 pt-[14px] pb-[calc(88px+env(safe-area-inset-bottom,0px))]`}>
        {/* انتقال تنقّل خفيف (3A-312 — بند ٤): غلاف بمفتاح المسار يعيد
            تشغيل route-in (عتامة فقط — انظر index.css لسبب غياب
            الـ transform) عند كل تنقّل؛ ليس حاوية السكرول ولا يلمس
            آلة السحب-للتحديث داخل الصفحات */}
        <div key={location.pathname} className="route-in">
          {deletedAt ? (
            <AccountDeletedScreen deletedAt={deletedAt} />
          ) : teacher.status === 'loading' ? (
            <LoadingState />
          ) : teacher.status === 'no-teacher' ? (
            <Onboarding />
          ) : (
            (children ?? <Outlet />)
          )}
        </div>
      </main>

      {/* زر تثبيت PWA الذكي (3A-317): يظهر عند قابلية التثبيت فقط،
          ويختفي مع التنقّل إن لم يُضغط — انظر InstallButton */}
      <InstallButton />

      {/* الشريط السفلي — أيقونة + نص دائماً، pill خلف النشط بأيقونة ممتلئة،
          منطقة لمس 64px مع safe-area (بحث §5) */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-card border-t border-border shadow-[0_-10px_24px_-18px_rgba(15,23,42,0.45)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className={`mx-auto ${containerCls} flex`}>
          {TABS.map((item) => {
            const active = tab === item.key
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                onPointerDown={() => prefetchRoute(item.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 min-h-[64px] py-1.5 flex flex-col items-center justify-center gap-1 border-0 bg-transparent cursor-pointer type-badge ${
                  active ? 'text-primary' : 'text-muted'
                }`}
              >
                <span
                  className={`relative flex items-center justify-center rounded-full px-4 py-1 ${
                    active ? 'bg-soft' : ''
                  }`}
                >
                  <Icon size={24} fill={active ? 'currentColor' : 'none'} />
                  {item.key === 'more' && hasUnseenFeatures && (
                    <span className="absolute top-0.5 end-2 w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </span>
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
