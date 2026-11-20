import { useParams } from 'react-router-dom'
import { Placeholder } from '../../components/ui/Placeholder'

export function StudentDetailPage() {
  const { id } = useParams()
  return (
    <Placeholder
      icon="🧑‍🎓"
      title="ملف الطالب"
      hint={`ملف الطالب (${id ?? ''}) بخمسة تبويبات: حضور/مدفوعات/درجات/ملاحظات/الملف — هتتنفذ من المواصفات §3.3.`}
    />
  )
}
