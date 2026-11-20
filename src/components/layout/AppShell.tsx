import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { Onboarding } from '../../features/auth/Onboarding'
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
}

type TabKey = 'home' | 'students' | 'invoices' | 'more'

const TABS: { key: TabKey; path: string; icon: string; label: string }[] = [
  { key: 'home', path: '/', icon: '🏠', label: 'الرئيسية' },
  { key: 'students', path: '/students', icon: '👥', label: 'الطلاب' },
  { key: 'invoices', path: '/invoices', icon: '🧾', label: 'الفواتير' },
  { key: 'more', path: '/more', icon: '⋯', label: 'المزيد' },
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
  const avatarLetter =
    teacher.status === 'ready' && teacher.teacher?.display_name
      ? teacher.teacher.display_name.trim().charAt(0)
      : 'م'
  const avatarUrl = teacher.status === 'ready' ? teacher.teacher?.avatar_url : null

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* الشريط العلوي — لاصق 52px (المرجع §6.3) */}
      <header className="sticky top-0 z-20 h-[52px] bg-card border-b border-border">
        <div className="mx-auto max-w-[640px] h-full px-4 flex items-center gap-2">
          {!isRoot ? (
            <button
              onClick={() => navigate(-1)}
              className="text-[22px] leading-none px-2 cursor-pointer bg-transparent border-0 text-text"
              aria-label="رجوع"
            >
              ›
            </button>
          ) : null}
          <Logo size={26} />
          <div className="font-extrabold text-[16px] flex-1">{TITLES[screen] ?? 'تطبيق المدرس'}</div>
          {isRoot && (
            <>
              <button
                onClick={() => navigate('/notifications')}
                className="relative text-[19px] px-2 cursor-pointer bg-transparent border-0"
                aria-label="الإشعارات"
              >
                🔔
                {/* شارَة عدد التنبيهات تظهر هنا عند ربط getAlerts */}
              </button>
              <button
                onClick={toggle}
                className="text-[19px] px-2 cursor-pointer bg-transparent border-0"
                aria-label="تبديل المظهر"
              >
                🌙
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="w-8 h-8 rounded-full bg-primary text-white font-bold flex items-center justify-center cursor-pointer border-0 overflow-hidden p-0"
                aria-label="الإعدادات"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  avatarLetter
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {/* المحتوى — حاوية 640px وحشوة سفلية تترك مكاناً للشريط السفلي (المرجع §6.2) */}
      <main className="mx-auto max-w-[640px] px-4 pt-[14px] pb-[calc(84px+env(safe-area-inset-bottom,0px))]">
        {teacher.status === 'loading' ? (
          <LoadingState />
        ) : teacher.status === 'no-teacher' ? (
          <Onboarding />
        ) : (
          <Outlet />
        )}
      </main>

      {/* الشريط السفلي — ثابت، 4 تبويبات (المرجع §6.4) */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-card border-t border-border pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto max-w-[640px] flex">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => navigate(t.path)}
                className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 border-0 bg-transparent cursor-pointer text-[12px] ${
                  active ? 'text-primary font-bold' : 'text-muted'
                }`}
              >
                <span className="text-[19px] leading-none">{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
