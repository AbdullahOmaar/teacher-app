import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'

const MENU = [
  { icon: '🗓️', label: 'الجدول والتقويم', path: '/schedule' },
  { icon: '👨‍👩‍👧‍👦', label: 'المجموعات', path: '/groups' },
  { icon: '📝', label: 'الامتحانات والدرجات', path: '/grades' },
  { icon: '💰', label: 'المصروفات والأرباح', path: '/money' },
  { icon: '👨‍👩‍👦', label: 'بوابة ولي الأمر', path: '/portal-links' },
  { icon: '💾', label: 'النسخ الاحتياطي', path: '/backup' },
  { icon: '📤', label: 'تصدير واستيراد', path: '/export' },
  { icon: '⚙️', label: 'الإعدادات', path: '/settings' },
]

/** قائمة «المزيد» — صفوف تنقّل لبقية الأقسام (المرجع: renderMore) */
export function MorePage() {
  const navigate = useNavigate()
  return (
    <Card className="p-0 overflow-hidden">
      {MENU.map((item, i) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          className={`w-full flex items-center gap-3 px-[14px] min-h-[60px] bg-transparent border-0 cursor-pointer text-text text-start hover:bg-soft ${
            i < MENU.length - 1 ? 'border-b border-border' : ''
          }`}
        >
          <span className="w-[38px] h-[38px] rounded-xl bg-soft flex items-center justify-center text-[18px] shrink-0">
            {item.icon}
          </span>
          <span className="flex-1 font-semibold">{item.label}</span>
          <span className="text-muted">›</span>
        </button>
      ))}
    </Card>
  )
}
