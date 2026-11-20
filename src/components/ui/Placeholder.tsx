import { Card } from './Card'
import { EmptyState, type IconComponent } from './EmptyState'

interface PlaceholderProps {
  icon: IconComponent
  title: string
  hint?: string
}

/** صفحة placeholder نظيفة للشاشات التي لم تُبنَ بعد */
export function Placeholder({ icon, title, hint = 'الشاشة دي لسه بتتبني — هتتنفذ من المواصفات قريباً.' }: PlaceholderProps) {
  return (
    <Card>
      <EmptyState icon={icon} title={title} hint={hint} />
    </Card>
  )
}
