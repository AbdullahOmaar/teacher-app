import { Lock } from 'lucide-react'
import { Card } from './ui/Card'

// ===========================================================================
// بطاقة «للمالك فقط» المشتركة (COD-5 / 3A-362): كانت كتلة متطابقة
// هيكلياً في AnalyticsPage وInvoicesPage وInvoiceDetailPage وBackupPage
// وExportPage — نفس البطاقة والأيقونة والتنسيق، والفرق الوحيد هو
// العنوان/النص بمفاتيح i18n الخاصة بكل صفحة، فيُمرَّران كنصين جاهزين.
// ===========================================================================

export function OwnerOnlyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center py-10">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <Lock size={28} />
      </div>
      <div className="type-section mb-1">{title}</div>
      <p className="text-muted text-[13.5px] mb-0">{body}</p>
    </Card>
  )
}
