import { useParams } from 'react-router-dom'
import { Placeholder } from '../../components/ui/Placeholder'

export function InvoiceDetailPage() {
  const { id } = useParams()
  return (
    <Placeholder
      icon="🧾"
      title="تفاصيل الفاتورة"
      hint={`الفاتورة (${id ?? ''}): البنود والدفعات والإيصال والطباعة — هتتنفذ من المواصفات §3.5.`}
    />
  )
}
