import { useParams } from 'react-router-dom'
import { Placeholder } from '../../components/ui/Placeholder'

export function AssessmentDetailPage() {
  const { id } = useParams()
  return (
    <Placeholder
      icon="📝"
      title="تفاصيل الامتحان"
      hint={`الامتحان (${id ?? ''}): الأسئلة والدرجات والإحصائيات وورقة الامتحان — هتتنفذ من المواصفات §3.7.`}
    />
  )
}
