import { useEffect, useRef, useState } from 'react'
import { CameraOff, CheckCircle2, Keyboard, ScanQrCode, TriangleAlert, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/form'
import { normalizeScannedCode, shouldAcceptScan } from './qr'

/** نتيجة معالجة كود واحد — يقررها الأب (شاشة الحضور) من قائمة الحصة الحالية */
export type ScanOutcome =
  | { kind: 'marked'; studentName: string }
  | { kind: 'already'; studentName: string }
  | { kind: 'unknown'; code: string }
  | { kind: 'cancelled' }

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'busy' | 'error'

interface QrScannerSheetProps {
  /** اسم المجموعة + تاريخ الحصة المعروضة أعلى الماسح */
  sessionLabel: string
  /** عدّادات حية من نفس كاش الحضور — تتحدث مع كل مسح ناجح */
  done: number
  total: number
  onScan: (raw: string) => ScanOutcome
  onClose: () => void
}

interface Feedback {
  outcome: ScanOutcome
  /** يتغير مع كل مسح حتى لنفس النتيجة — لإعادة تشغيل وميض الصف/الرسالة */
  seq: number
}

const FEEDBACK_MS = 2800

/** هل بيئة التشغيل تسمح بالكاميرا أصلاً؟ (getUserMedia يحتاج سياقاً آمناً HTTPS/localhost) */
function cameraSupport(): 'ok' | 'unavailable' {
  if (typeof window === 'undefined') return 'unavailable'
  if (!window.isSecureContext) return 'unavailable'
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable'
  return 'ok'
}

function cameraErrorState(err: unknown): CameraState {
  const name = err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
    return 'unavailable'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy'
  return 'error'
}

const CAMERA_MESSAGES: Record<Exclude<CameraState, 'starting' | 'scanning'>, string> = {
  denied:
    'لم يتم السماح بالكاميرا. فعّل إذن الكاميرا من إعدادات المتصفح لهذا الموقع ثم أعد المحاولة — أو سجّل من القائمة/بالكود اليدوي تحت.',
  unavailable:
    'لا توجد كاميرا متاحة، أو الصفحة ليست على اتصال آمن (HTTPS) — الكاميرا لا تعمل إلا على HTTPS. جرّب من رابط الإنتاج، أو سجّل من القائمة/بالكود اليدوي تحت.',
  busy: 'الكاميرا مشغولة بتطبيق تاني. اقفله وحاول تاني — أو سجّل من القائمة/بالكود اليدوي تحت.',
  error: 'حصلت مشكلة في تشغيل الكاميرا. حاول تاني — أو سجّل من القائمة/بالكود اليدوي تحت.',
}

function feedbackText(f: Feedback): string {
  const o = f.outcome
  switch (o.kind) {
    case 'marked':
      return `تم تسجيل حضور ${o.studentName} ✓ — امسح الكارت اللي بعده`
    case 'already':
      return `${o.studentName} مسجّل حاضر بالفعل`
    case 'unknown':
      return `الكود ${o.code} مش موجود في الحصة دي — لم يتم تسجيل أي حضور`
    case 'cancelled':
      return 'الحصة ملغاة — الحضور مقفول'
  }
}

function feedbackClass(f: Feedback): string {
  switch (f.outcome.kind) {
    case 'marked':
      return 'bg-ok-soft text-ok-text border-ok/40'
    case 'already':
      return 'bg-soft text-primary border-primary/30'
    case 'unknown':
    case 'cancelled':
      return 'bg-bad-soft text-bad-text border-bad/40'
  }
}

/**
 * ماسح QR بالكاميرا لتسجيل الحضور عند الباب (Phase 2 — الخطوة 4).
 *
 * المكتبة: ‎@zxing/browser‏ (BrowserQRCodeReader فقط) — صيانة نشطة (0.2.1)،
 * فكّ ترميز QR ناضج من مشروع ZXing، وتُستورد ديناميكياً عند فتح الماسح فقط
 * فتقع في chunk كسول منفصل (~115KB gzip) ولا تثقل الحزمة الرئيسية أبداً.
 * البديل html5-qrcode أثقل ويرسم واجهته بنفسه؛ وBarcodeDetector الأصلي
 * غير مدعوم في Safari/iOS بعد.
 *
 * الخصوصية: الكاميرا لا تُطلب إلا عند تركيب هذا المكوّن (فتح وضع المسح
 * صراحةً)، وعند فكّ التركيب تُستدعى controls.stop() التي توقف كل الـ tracks
 * + إيقاف يدوي احتياطي من srcObject عنصر الفيديو.
 * الكاميرا الخلفية عبر facingMode: 'environment'، والمسح مستمر (لا إغلاق
 * بعد كل طالب) مع كبح تكرار نفس الكود 3 ثوانٍ (qr.ts: shouldAcceptScan).
 */
export function QrScannerSheet({ sessionLabel, done, total, onScan, onClose }: QrScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // أحدث نسخة من onScan في ref (تتحدث بعد كل render عبر effect) حتى يقرأها
  // callback الكاميرا المستمر دون إعادة تشغيل الكاميرا مع كل تحديث عدّادات
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // الحالة الابتدائية محسوبة من دالة نقية عند التركيب (فتح الماسح) — بلا setState متزامن داخل effect
  const [camState, setCamState] = useState<CameraState>(() =>
    cameraSupport() === 'ok' ? 'starting' : 'unavailable',
  )
  const [attempt, setAttempt] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')

  const acceptCode = (raw: string) => {
    const now = Date.now()
    if (!shouldAcceptScan(lastScanRef.current, raw, now)) return
    const code = normalizeScannedCode(raw)
    if (!code) return
    lastScanRef.current = { code, at: now }
    const outcome = onScanRef.current(raw)
    if (outcome.kind === 'marked') navigator.vibrate?.(60)
    else if (outcome.kind === 'unknown') navigator.vibrate?.([40, 40, 40])
    setFeedback((prev) => ({ outcome, seq: (prev?.seq ?? 0) + 1 }))
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }
  const acceptRef = useRef(acceptCode)
  useEffect(() => {
    acceptRef.current = acceptCode
  })

  useEffect(() => {
    if (cameraSupport() !== 'ok') return
    let cancelled = false
    let controls: { stop: () => void } | null = null

    const stopAll = () => {
      try {
        controls?.stop()
      } catch {
        /* توقفت بالفعل */
      }
      const video = videoRef.current
      const stream = video?.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
    }

    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (cancelled || !videoRef.current) return
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 500,
        })
        const started = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => {
            // أخطاء كل إطار (لا QR في المشهد…) جزء طبيعي من المسح المستمر — تُتجاهل
            if (!result) return
            acceptRef.current(result.getText())
          },
        )
        if (cancelled) {
          started.stop()
          return
        }
        controls = started
        setCamState('scanning')
      } catch (err) {
        if (!cancelled) setCamState(cameraErrorState(err))
      }
    })()

    return () => {
      cancelled = true
      stopAll()
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [attempt])

  // إغلاق بـ Escape مثل باقي الـ Sheets
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const submitManual = () => {
    if (!manualCode.trim()) return
    acceptCode(manualCode)
    setManualCode('')
  }

  const cameraBlocked = camState !== 'starting' && camState !== 'scanning'

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="مسح QR للحضور">
      {/* الترويسة: الحصة الحالية + إغلاق */}
      <div className="flex items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 text-white">
        <ScanQrCode size={24} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[16px] leading-[1.5]">مسح QR — تسجيل حضور عند الباب</div>
          <div className="text-white/70 text-[13.5px] leading-[1.5] truncate">{sessionLabel}</div>
        </div>
        <span className="shrink-0 text-[13.5px] font-bold bg-white/15 rounded-full px-3 py-1.5" aria-live="polite">
          {done}/{total} اتحضّروا
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الماسح"
          className="shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-white/15 text-white border-0 cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>

      {/* منطقة الكاميرا + إطار التوجيه */}
      <div className="relative flex-1 min-h-0">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          aria-hidden="true"
        />
        {camState === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[min(72vw,320px)] aspect-square">
              <span className="absolute top-0 start-0 w-10 h-10 border-t-4 border-s-4 border-white rounded-tl-2xl" />
              <span className="absolute top-0 end-0 w-10 h-10 border-t-4 border-e-4 border-white rounded-tr-2xl" />
              <span className="absolute bottom-0 start-0 w-10 h-10 border-b-4 border-s-4 border-white rounded-bl-2xl" />
              <span className="absolute bottom-0 end-0 w-10 h-10 border-b-4 border-e-4 border-white rounded-br-2xl" />
              <span className="qr-scanline absolute start-3 end-3 h-[3px] rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        )}
        {camState === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/85 text-[15px] font-semibold px-6 text-center">
            بنشغّل الكاميرا… اسمح بالوصول للكاميرا لو ظهر طلب الإذن.
          </div>
        )}
        {cameraBlocked && (
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="bg-card text-text rounded-2xl p-4 max-w-[420px] w-full text-center">
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-bad-soft text-bad-text flex items-center justify-center">
                <CameraOff size={24} />
              </div>
              <p className="type-secondary mb-3">{CAMERA_MESSAGES[camState as keyof typeof CAMERA_MESSAGES]}</p>
              <Button
                full
                onClick={() => {
                  setCamState('starting')
                  setAttempt((a) => a + 1)
                }}
              >
                إعادة محاولة الكاميرا
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* التغذية الراجعة الفورية + البدائل */}
      <div className="px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 flex flex-col gap-2.5 bg-black">
        <div aria-live="polite" className="min-h-[52px]">
          {feedback ? (
            <div
              key={feedback.seq}
              className={`qr-feedback-in border rounded-xl px-3 py-2.5 text-[14px] font-bold flex items-start gap-2 ${feedbackClass(feedback)}`}
            >
              {feedback.outcome.kind === 'marked' ? (
                <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
              ) : (
                <TriangleAlert size={20} className="shrink-0 mt-0.5" />
              )}
              <span>{feedbackText(feedback)}</span>
            </div>
          ) : (
            <p className="text-white/70 text-[13.5px] text-center pt-2 mb-0">
              {camState === 'scanning'
                ? 'قرّب كارت الطالب من الكاميرا — التسجيل فوري والمسح بيكمل للطالب اللي بعده'
                : 'تقدر تسجّل يدوياً بالكود أو ترجع لقائمة الحضور'}
            </p>
          )}
        </div>

        {manualOpen ? (
          <div className="flex gap-2">
            <div className="flex-1" dir="ltr">
              <TextInput
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitManual()
                }}
                placeholder="Student code — كود الطالب"
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
              />
            </div>
            <Button onClick={submitManual} disabled={!manualCode.trim()}>
              تسجيل حاضر
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold cursor-pointer bg-white/10 text-white border border-white/25 hover:bg-white/20"
          >
            <Keyboard size={20} />
            إدخال الكود يدوياً
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold cursor-pointer bg-transparent text-white/85 border border-white/25 hover:bg-white/10"
        >
          الرجوع لقائمة الحضور
        </button>
      </div>
    </div>
  )
}
