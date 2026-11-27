import { useLocation, useNavigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { prefetchRoute } from '../../lib/routePrefetch'
import { useFeedbackUnreadCount } from '../../features/feedback/hooks'
import { Logo } from '../brand/Logo'
import { t } from '../../i18n'
import {
  SIDE_NAV_MAIN,
  SIDE_NAV_SECTIONS,
  SIDE_NAV_SYSTEM,
  sideActiveKey,
  type SideNavItem,
} from './navModel'

/**
 * الشريط الجانبي للديسكتوب (3A-930): سطح التنقّل الكامل عند
 * ≥1024px فقط (hidden تحتها — الموبايل يبقى بالشريط السفلي كما
 * هو حرفياً). ثابت عند بداية الاتجاه (اليمين في RTL)، وعناصره من
 * نموذج navModel المستخرج من تبويبات الشريط السفلي وقائمة
 * «المزيد» بنفس التسميات والأيقونات، وشارتاه من نفس مصدري عدّاد
 * الجرس (تنبيهات) وعدّاد ملاحظات «المزيد» — لا مصدر موازٍ.
 */
export function SideNav({
  teacherId,
  alertsCount,
  displayName,
  avatarUrl,
  avatarLetter,
}: {
  teacherId: string | undefined
  /** عدد أنواع التنبيهات النشطة — نفس رقم شارة الجرس في الشريط العلوي */
  alertsCount: number
  displayName: string | null | undefined
  avatarUrl: string | null | undefined
  avatarLetter: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { toggle } = useTheme()
  const activeKey = sideActiveKey(location.pathname)
  const isDark =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  // عدّاد الملاحظات غير المقروءة — نفس استعلام صفحة «المزيد» وكاشها،
  // والقراءة RLS للمالك فقط فلا شارة لمساعد أصلاً (كما في «المزيد»)
  const unreadQ = useFeedbackUnreadCount(teacherId)
  const feedbackUnread = unreadQ.data ?? 0

  const renderItem = (item: SideNavItem) => {
    const Icon = item.icon
    const active = activeKey === item.key
    const badgeCount =
      item.badge === 'alerts' ? alertsCount : item.badge === 'feedback' ? feedbackUnread : 0
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => navigate(item.path)}
        onPointerDown={() => prefetchRoute(item.path)}
        aria-current={active ? 'page' : undefined}
        data-side-nav-item={item.key}
        className={`w-full min-h-[48px] px-3 rounded-xl flex items-center gap-3 border-0 cursor-pointer text-start type-body ${
          active
            ? 'bg-soft text-primary font-bold'
            : 'bg-transparent text-text hover:bg-soft font-semibold'
        }`}
      >
        <Icon size={22} className="shrink-0" fill={active ? 'currentColor' : 'none'} />
        <span className="flex-1 truncate">{item.label}</span>
        {badgeCount > 0 && (
          <span
            className={`shrink-0 min-w-[20px] h-5 px-1 rounded-full type-badge flex items-center justify-center ${
              item.badge === 'feedback'
                ? 'bg-warn/15 text-warn-text'
                : 'bg-bad text-on-status'
            }`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    )
  }

  const renderGroup = (title: string, items: SideNavItem[]) => (
    <div className="mt-4">
      <div className="px-3 mb-1 type-badge text-muted">{title}</div>
      <div className="flex flex-col gap-0.5">{items.map(renderItem)}</div>
    </div>
  )

  return (
    <aside
      data-side-nav
      className="hidden lg:flex fixed inset-y-0 start-0 z-30 w-[264px] flex-col bg-card border-e border-border"
    >
      {/* الهوية: الشعار + اسم التطبيق — نفس بصمة الشريط العلوي */}
      <div className="flex items-center gap-2 px-4 h-[57px] border-b border-border shrink-0">
        <Logo size={28} />
        <span className="type-section">{t('shell.appName')}</span>
      </div>

      {/* هوية المدرّس — الضغط يفتح الإعدادات (نفس وجهة أفاتار الشريط العلوي) */}
      <button
        type="button"
        onClick={() => navigate('/settings')}
        onPointerDown={() => prefetchRoute('/settings')}
        className="mx-3 mt-3 min-h-[56px] px-3 rounded-xl flex items-center gap-3 bg-soft/60 hover:bg-soft border-0 cursor-pointer text-start shrink-0"
      >
        <span className="w-10 h-10 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center overflow-hidden shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            avatarLetter
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-[15px] truncate">
            {displayName ?? t('shell.appName')}
          </span>
          <span className="block text-muted type-badge">{t('settings.moreSettings')}</span>
        </span>
      </button>

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label={t('shell.appName')}>
        {renderGroup(t('shell.side.main'), SIDE_NAV_MAIN)}
        {renderGroup(t('shell.side.sections'), SIDE_NAV_SECTIONS)}
        {renderGroup(t('shell.side.system'), SIDE_NAV_SYSTEM)}
      </nav>

      {/* تبديل المظهر — نفس إجراء أيقونة الشريط العلوي */}
      <div className="p-3 border-t border-border shrink-0">
        <button
          type="button"
          onClick={toggle}
          aria-label={t('shell.toggleTheme')}
          className="w-full min-h-[48px] px-3 rounded-xl flex items-center gap-3 bg-transparent hover:bg-soft border-0 cursor-pointer text-text font-semibold type-body"
        >
          {isDark ? <Sun size={22} className="shrink-0" /> : <Moon size={22} className="shrink-0" />}
          {t('shell.toggleTheme')}
        </button>
      </div>
    </aside>
  )
}
