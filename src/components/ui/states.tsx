import { Link } from 'react-router-dom'
import { Card } from './Card'
import { Button } from './Button'

/** حالة غياب الجلسة — لا بيانات وهمية أبداً: توجيه واضح لتسجيل الدخول */
export function SignInRequired() {
  return (
    <Card className="text-center py-8">
      <div className="text-[34px] mb-2">🔒</div>
      <div className="font-extrabold mb-1">سجل الدخول أولاً</div>
      <p className="text-muted text-[13px] mb-4">
        البيانات دي خاصة بحسابك ومحمية — لازم تسجل دخول علشان تظهر.
      </p>
      <Link to="/login">
        <Button>تسجيل الدخول</Button>
      </Link>
    </Card>
  )
}

/** مسجل دخول لكن لا يوجد ملف مدرس مرتبط بالحساب بعد */
export function NoTeacherProfile() {
  return (
    <Card className="text-center py-8">
      <div className="text-[34px] mb-2">🧑‍🏫</div>
      <div className="font-extrabold mb-1">لا يوجد ملف مدرس مرتبط بحسابك</div>
      <p className="text-muted text-[13px] mb-0">
        حسابك مسجل دخوله، لكن لسه ما اتعملّوش ملف مدرس (أو عضوية فريق) في قاعدة البيانات.
      </p>
    </Card>
  )
}

export function LoadingState({ label = 'بنحمّل…' }: { label?: string }) {
  return <div className="text-center text-muted py-10 text-[14px]">{label}</div>
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="text-center py-6">
      <div className="text-[28px] mb-2">⚠️</div>
      <div className="font-bold text-bad mb-1">حصلت مشكلة في التحميل</div>
      <p className="text-muted text-[13px] mb-0 break-words">{message}</p>
    </Card>
  )
}
