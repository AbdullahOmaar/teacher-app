import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { prefetchRoute, prefetchRoutesIdle } from '../../lib/routePrefetch'
import {
  BookOpenCheck,
  CalendarDays,
  ChartColumn,
  ChevronLeft,
  Download,
  HardDriveDownload,
  History,
  Landmark,
  NotebookPen,
  Settings,
  Users,
  UserSquare2,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { t } from '../../i18n'

const MENU: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: CalendarDays, label: t('settings.moreSchedule'), path: '/schedule' },
  { icon: Users, label: t('settings.moreGroups'), path: '/groups' },
  { icon: NotebookPen, label: t('settings.moreGrades'), path: '/grades' },
  { icon: BookOpenCheck, label: t('settings.moreHomework'), path: '/homework' },
  { icon: Landmark, label: t('settings.moreMoney'), path: '/money' },
  { icon: ChartColumn, label: t('settings.moreAnalytics'), path: '/analytics' },
  { icon: UserSquare2, label: t('settings.morePortal'), path: '/portal-links' },
  { icon: History, label: t('settings.moreActivity'), path: '/activity-log' },
  { icon: HardDriveDownload, label: t('settings.backup'), path: '/backup' },
  { icon: Download, label: t('settings.moreExport'), path: '/export' },
  { icon: Settings, label: t('settings.moreSettings'), path: '/settings' },
]

/** قائمة «المزيد» — صفوف تنقّل لبقية الأقسام (المرجع: renderMore) */
export function MorePage() {
  const navigate = useNavigate()
  // تسخين وجهات القائمة عند الخمول (3A-312 — بند ٢): أول ضغطة على أي
  // صف كانت تدفع ثمن جلب حزمة الوجهة وتحليلها بعد الضغطة (مقاساً حتى
  // 1207ms للتحليلات)؛ الآن تُسخَّن الحزم تسلسلياً أثناء وقوف المستخدم
  // على هذه الصفحة، وبدء لمس أي صف يُسخّن وجهته فوراً احتياطاً
  useEffect(() => prefetchRoutesIdle(MENU.map((m) => m.path)), [])
  return (
    <Card className="p-0 overflow-hidden">
      {MENU.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            onPointerDown={() => prefetchRoute(item.path)}
            style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
            className={`rise-in w-full flex items-center gap-3 px-4 min-h-[64px] bg-transparent border-0 cursor-pointer text-text text-start hover:bg-soft active:bg-soft ${
              i < MENU.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <span className="w-10 h-10 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
              <Icon size={24} />
            </span>
            <span className="flex-1 font-semibold text-[15px]">{item.label}</span>
            <ChevronLeft size={20} className="text-muted" />
          </button>
        )
      })}
    </Card>
  )
}
