import { useNavigate } from 'react-router-dom'
import {
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  Download,
  HardDriveDownload,
  Landmark,
  NotebookPen,
  Settings,
  Users,
  UserSquare2,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'

const MENU: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: CalendarDays, label: 'الجدول والتقويم', path: '/schedule' },
  { icon: Users, label: 'المجموعات', path: '/groups' },
  { icon: NotebookPen, label: 'الامتحانات والدرجات', path: '/grades' },
  { icon: BookOpenCheck, label: 'متابعة الواجبات', path: '/homework' },
  { icon: Landmark, label: 'المصروفات والأرباح', path: '/money' },
  { icon: UserSquare2, label: 'بوابة ولي الأمر', path: '/portal-links' },
  { icon: HardDriveDownload, label: 'النسخ الاحتياطي', path: '/backup' },
  { icon: Download, label: 'تصدير واستيراد', path: '/export' },
  { icon: Settings, label: 'الإعدادات', path: '/settings' },
]

/** قائمة «المزيد» — صفوف تنقّل لبقية الأقسام (المرجع: renderMore) */
export function MorePage() {
  const navigate = useNavigate()
  return (
    <Card className="p-0 overflow-hidden">
      {MENU.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-4 min-h-[64px] bg-transparent border-0 cursor-pointer text-text text-start hover:bg-soft ${
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
