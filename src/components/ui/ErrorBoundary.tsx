import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { t } from '../../i18n'
import { readMascotMirror } from '../mascot/useMascotVisible'
import oopsImg from '../../assets/mascot/oops.webp'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
  /** فشل تحميل رسمة الأوبس نفسها — السقوط يرجع لدائرة الأيقونة */
  oopsFailed: boolean
}

/**
 * حدّ خطأ جذري (3A-302 — §7-A10 «معالج عام برسالة عامة»): قبل هذا المكوّن
 * لم يكن في التطبيق أي ErrorBoundary، فأي انهيار تصيير غير متوقّع كان
 * يعني شاشة بيضاء صامتة. الآن: رسالة عربية عامة (بلا أي تفاصيل تقنية أو
 * بيانات) + زر تحديث كامل للصفحة، والخطأ نفسه يُسجَّل في وحدة التحكم
 * فقط لتشخيص التطوير. يُركَّب مرة واحدة حول <App/> في main.tsx.
 *
 * شخصية دُفّي (خطة الهوية P-5): الحدّ يعمل خارج <App/> — قبل/بلا أي
 * مزوّدات (لا QueryClient ولا جلسة)، فلا يستخدم مكوّن Mascot ولا أي
 * خطاف؛ رؤية الأوبس تتبع مرآة الجهاز المحلية ثم الافتراضي «يظهر» (نفس
 * نمط سبلاش الإقلاع الموثّق في 3A-303)، وسطر الخطأ من §٨ حرفياً.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, oopsFailed: false }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] unhandled render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const showOops = readMascotMirror() !== false && !this.state.oopsFailed
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
        <Card className="text-center py-8 max-w-sm w-full">
          {showOops ? (
            <img
              src={oopsImg}
              alt=""
              aria-hidden="true"
              width={92}
              draggable={false}
              onError={() => this.setState({ oopsFailed: true })}
              className="select-none mx-auto mb-2"
              style={{ width: 92, height: 'auto', display: 'block' }}
            />
          ) : (
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-bad-soft text-bad-text flex items-center justify-center">
              <AlertTriangle size={28} />
            </div>
          )}
          <div className="type-section text-bad-text mb-1">{t('common.crashTitle')}</div>
          <p className="type-secondary mb-1">{t('mascot.error')}</p>
          <p className="text-muted type-secondary mb-4">{t('common.crashBody')}</p>
          <Button variant="soft" onClick={() => window.location.reload()}>
            <RotateCcw size={18} />
            {t('common.crashReload')}
          </Button>
        </Card>
      </div>
    )
  }
}
