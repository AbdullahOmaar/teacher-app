import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Download,
  HardDriveDownload,
  History,
  Home,
  Landmark,
  LifeBuoy,
  Megaphone,
  MessageSquarePlus,
  NotebookPen,
  ReceiptText,
  Settings,
  Sparkles,
  Users,
  UsersRound,
  UserSquare2,
  type LucideIcon,
} from 'lucide-react'
import { t } from '../../i18n'

/**
 * نموذج تنقّل طبقة الديسكتوب (3A-930): عناصر الشريط الجانبي عند
 * ≥1024px. المصدر الوحيد للحقيقة هو نموذج التنقّل القائم نفسه —
 * التبويبات الأربعة في الشريط السفلي (AppShell TABS) وقائمة
 * «المزيد» (MorePage MENU) بنفس التسميات والأيقونات حرفياً،
 * مضافاً إليها «الحضور» (وجهة تبويب الرئيسية الأولى في الإجراءات
 * السريعة) و«الإشعارات» (زر الجرس في الشريط العلوي) لأن الشريط
 * الجانبي هو سطح التنقّل الكامل على الديسكتوب.
 *
 * استثناءان موثّقان: صفّ «استيراد الطلاب» في قائمة «المزيد» إجراء
 * (رابط عميق يفتح شيتاً) لا قسم، فلا عنصر شريط له — وجهته نفسها
 * (/students) موجودة؛ وصفحة «المزيد» ذاتها لا عنصر لها لأن
 * محتوياتها كلها هنا.
 */
export interface SideNavItem {
  key: string
  path: string
  icon: LucideIcon
  label: string
  /** شارة عدّاد: تنبيهات الرئيسية (نفس عدّاد الجرس) أو ملاحظات غير المقروءة */
  badge?: 'alerts' | 'feedback'
}

export const SIDE_NAV_MAIN: SideNavItem[] = [
  { key: 'home', path: '/', icon: Home, label: t('shell.nav.home') },
  { key: 'attendance', path: '/attendance', icon: ClipboardCheck, label: t('shell.title.att') },
  { key: 'students', path: '/students', icon: Users, label: t('shell.nav.students') },
  { key: 'invoices', path: '/invoices', icon: ReceiptText, label: t('common.invoices') },
]

export const SIDE_NAV_SECTIONS: SideNavItem[] = [
  { key: 'schedule', path: '/schedule', icon: CalendarDays, label: t('settings.moreSchedule') },
  { key: 'groups', path: '/groups', icon: UsersRound, label: t('settings.moreGroups') },
  { key: 'grades', path: '/grades', icon: NotebookPen, label: t('settings.moreGrades') },
  { key: 'homework', path: '/homework', icon: BookOpenCheck, label: t('settings.moreHomework') },
  { key: 'assistant', path: '/assistant', icon: Sparkles, label: t('settings.moreAssistant') },
  { key: 'money', path: '/money', icon: Landmark, label: t('settings.moreMoney') },
  { key: 'analytics', path: '/analytics', icon: ChartColumn, label: t('settings.moreAnalytics') },
  { key: 'portal', path: '/portal-links', icon: UserSquare2, label: t('settings.morePortal') },
  { key: 'activity', path: '/activity-log', icon: History, label: t('settings.moreActivity') },
]

export const SIDE_NAV_SYSTEM: SideNavItem[] = [
  {
    key: 'notifications',
    path: '/notifications',
    icon: Bell,
    label: t('shell.title.notifications'),
    badge: 'alerts',
  },
  { key: 'announcements', path: '/announcements', icon: Megaphone, label: t('settings.moreAnnouncements') },
  {
    key: 'feedback',
    path: '/feedback',
    icon: MessageSquarePlus,
    label: t('settings.moreFeedback'),
    badge: 'feedback',
  },
  { key: 'support', path: '/support', icon: LifeBuoy, label: t('settings.moreSupport') },
  { key: 'backup', path: '/backup', icon: HardDriveDownload, label: t('settings.backup') },
  { key: 'export', path: '/export', icon: Download, label: t('settings.moreExport') },
  { key: 'settings', path: '/settings', icon: Settings, label: t('settings.moreSettings') },
]

export const SIDE_NAV_ALL: SideNavItem[] = [
  ...SIDE_NAV_MAIN,
  ...SIDE_NAV_SECTIONS,
  ...SIDE_NAV_SYSTEM,
]

/**
 * مفتاح عنصر الشريط النشط من المسار — قواعد بادئات موازية لـ
 * resolveRoute في AppShell (الشاشات الفرعية تُنسب لقسمها)، مع
 * إضافتين للديسكتوب فقط: الحضور والإشعارات قسمان مستقلان هنا
 * (في نموذج التبويبات يتبعان «الرئيسية»)، والإعلانات والدعم
 * قسمان لهما عنصرهما (resolveRoute لا يعرفهما فيسقطان للرئيسية).
 */
export function sideActiveKey(pathname: string): string {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/attendance')) return 'attendance'
  if (pathname.startsWith('/notifications')) return 'notifications'
  if (pathname.startsWith('/students')) return 'students'
  if (pathname.startsWith('/invoices')) return 'invoices'
  if (pathname.startsWith('/schedule')) return 'schedule'
  if (pathname.startsWith('/groups')) return 'groups'
  if (pathname.startsWith('/assessments') || pathname.startsWith('/grades')) return 'grades'
  if (pathname.startsWith('/money')) return 'money'
  if (pathname.startsWith('/analytics')) return 'analytics'
  if (pathname.startsWith('/homework')) return 'homework'
  if (pathname.startsWith('/assistant')) return 'assistant'
  if (pathname.startsWith('/feedback')) return 'feedback'
  if (pathname.startsWith('/announcements')) return 'announcements'
  if (pathname.startsWith('/support')) return 'support'
  if (pathname.startsWith('/activity-log')) return 'activity'
  if (pathname.startsWith('/export')) return 'export'
  if (pathname.startsWith('/backup')) return 'backup'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/portal-links')) return 'portal'
  if (pathname.startsWith('/at-risk')) return 'home'
  if (pathname.startsWith('/more')) return 'more'
  return 'home'
}
