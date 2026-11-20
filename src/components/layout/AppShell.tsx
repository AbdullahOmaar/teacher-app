import { Outlet, useLocation, useNavigate } from 'react-router-dom'
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
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useHomeAlerts } from '../../features/home/hooks'
import { Onboarding } from '../../features/auth/Onboarding'
import { AttendanceSyncBridge } from '../../features/attendance/SyncBridge'
import { LoadingState } from '../ui/states'
import { Logo } from '../brand/Logo'

/** عناوين الشاشات الـ16 (من جدول titles في المرجع) */
const TITLES: Record<string, string> = {
  home: 'الرئيسية',
  att: 'الحضور',
  students: 'الطلاب',
  student: 'ملف الطالب',
  invoices: 'الفواتير',
  invoice: 'الفاتورة',
  more: 'المزيد',
  schedule: 'الجدول والتقويم',
  groups: 'المجموعات',
  grades: 'الامتحانات والدرجات',
  assess: 'تفاصيل الامتحان',
  money: 'المصروفات والأرباح',
  notifications: 'الإشعارات',
  export: 'تصدير واستيراد',
  backup: 'النسخ الاحتياطي',
  settings: 'الإعدادات',
  portal: 'بوابة ولي الأمر',
  atrisk: 'معرّضون للفقد',
}

type TabKey = 'home' | 'students' | 'invoices' | 'more'

const TABS: { key: TabKey; path: string; icon: LucideIcon; label: string }[] = [
  { key: 'home', path: '/', icon: Home, label: 'الرئيسية' },
  { key: 'students', path: '/students', icon: Users, label: 'الطلاب' },
  { key: 'invoices', path: '/invoices', icon: ReceiptText, label: 'الفواتير' },
  { key: 'more', path: '/more', icon: LayoutGrid, label: 'المزيد' },
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
  if (pathname.startsWith('/export')) return { screen: 'export', tab: 'more' }
  if (pathname.startsWith('/backup')) return { screen: 'backup', tab: 'more' }
  if (pathname.startsWith('/settings')) return { screen: 'settings', tab: 'more' }
  if (pathname.startsWith('/portal')) return { screen: 'portal', tab: 'more' }
  if (pathname.startsWith('/at-risk')) return { screen: 'atrisk', tab: 'home' }
  if (pathname.startsWith('/more')) return { screen: 'more', tab: 'more' }
  return { screen: 'home', tab: 'home' }
}

const TAB_ROOTS = new Set(['home', 'students', 'invoices', 'more'])

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { toggle } = useTheme()
  const teacher = useCurrentTeacher()
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
  const alertsCount = alertsQ.data?.length ?? 0
  const isDark =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  const avatarLetter =
    teacher.status === 'ready' && teacher.teacher?.display_name
      ? teacher.teacher.display_name.trim().charAt(0)
      : 'م'
  const avatarUrl = teacher.status === 'ready' ? teacher.teacher?.avatar_url : null

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* مزامنة الحضور أوفلاين تعمل طوال الجلسة (إقلاع + عودة اتصال) */}
      <AttendanceSyncBridge />
      {/* الشريط العلوي — لاصق، أزراره أهداف لمس ≥48px (بحث §5) */}
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className={`mx-auto ${containerCls} px-2 flex items-center gap-1`}>
          {!isRoot ? (
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
              aria-label="رجوع"
            >
              <ChevronRight size={24} />
            </button>
          ) : null}
          <div className="ps-2">
            <Logo size={26} />
          </div>
          <div className="type-section flex-1">{TITLES[screen] ?? 'تطبيق المدرس'}</div>
          {isRoot && (
            <>
              <button
                onClick={() => navigate('/notifications')}
                className="relative w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
                aria-label="الإشعارات"
              >
                <Bell size={24} />
                {alertsCount > 0 && (
                  <span className="absolute top-1 end-1 min-w-[20px] h-5 px-1 rounded-full bg-bad text-white type-badge flex items-center justify-center">
                    {alertsCount > 99 ? '99+' : alertsCount}
                  </span>
                )}
              </button>
              <button
                onClick={toggle}
                className="w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0 text-text"
                aria-label="تبديل المظهر"
              >
                {isDark ? <Sun size={24} /> : <Moon size={24} />}
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="w-12 h-12 shrink-0 flex items-center justify-center cursor-pointer bg-transparent border-0"
                aria-label="الإعدادات"
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

      {/* المحتوى — حاوية 640px وحشوة سفلية تترك مكاناً للشريط السفلي (64px + safe-area) */}
      <main className={`mx-auto ${containerCls} px-4 pt-[14px] pb-[calc(88px+env(safe-area-inset-bottom,0px))]`}>
        {teacher.status === 'loading' ? (
          <LoadingState />
        ) : teacher.status === 'no-teacher' ? (
          <Onboarding />
        ) : (
          <Outlet />
        )}
      </main>

      {/* الشريط السفلي — أيقونة + نص دائماً، pill خلف النشط بأيقونة ممتلئة،
          منطقة لمس 64px مع safe-area (بحث §5) */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-card border-t border-border pb-[env(safe-area-inset-bottom,0px)]">
        <div className={`mx-auto ${containerCls} flex`}>
          {TABS.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => navigate(t.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 min-h-[64px] py-1.5 flex flex-col items-center justify-center gap-1 border-0 bg-transparent cursor-pointer type-badge ${
                  active ? 'text-primary' : 'text-muted'
                }`}
              >
                <span
                  className={`flex items-center justify-center rounded-full px-4 py-1 ${
                    active ? 'bg-soft' : ''
                  }`}
                >
                  <Icon size={24} fill={active ? 'currentColor' : 'none'} />
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
