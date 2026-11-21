import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, CheckCircle2, Newspaper } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/form'
import { useAuth } from '../../lib/AuthProvider'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import {
  getBrowserPushState,
  subscribeTeacherPush,
  unsubscribeTeacherPush,
  type BrowserPushState,
} from '../../lib/push'
import { useTeacherSettings, useUpdatePushDigestSettings } from './hooks'
import { isValidDigestTime } from './api'

/**
 * بطاقة «إشعارات Push» في الإعدادات (Phase 4 — الخطوة 1: البنية،
 * والخطوة 3: الملخص اليومي).
 *
 * قسم الاشتراك: تفعيل/إيقاف اشتراك متصفح المدرس الحالي عبر lib/push
 * (يُحفظ في push_subscriptions كاشتراك teacher) — عليه تصل التنبيهات
 * الفورية (إثبات دفع جديد/امتحان مُسلَّم، مشغّلات 0015 خادمياً).
 * بنفس نمط بطاقة التثبيت: لا طلب إذن تلقائي أبداً، التفعيل بضغطة
 * صريحة فقط.
 *
 * قسم الملخص اليومي (الخطوة 3، migration ‏0015): مفتاح تفعيل + وقت
 * إرسال (بتوقيت القاهرة) محفوظان في teacher_settings — الإرسال نفسه
 * خادمي بالكامل (pg_cron يفحص كل 15 دقيقة من حان وقته)، والبطاقة هنا
 * تحفظ التفضيل فقط. القسم يظهر للمالك فقط لأن teacher_settings
 * بسياسة مالك فقط أصلاً.
 */
export function PushNotificationsCard() {
  const { user } = useAuth()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  // المالك = دوره في السنتر النشط مالك (0016: أي سنتر يملكه، لا الأساسي فقط)
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const [state, setState] = useState<BrowserPushState | 'loading' | 'error'>('loading')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      setState(await getBrowserPushState(user.id))
    } catch (err) {
      // خطأ قراءة الحالة ليس «غير مشترك» — حالة خطأ صريحة بإعادة محاولة
      // بدل تصنيف خاطئ يخفي مشاكل الخادم (PAT-2)
      console.warn('[push] failed to read browser push state', err)
      setState('error')
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!user) {
        if (!cancelled) setState('unsupported')
        return
      }
      try {
        const s = await getBrowserPushState(user.id)
        if (!cancelled) setState(s)
      } catch (err) {
        console.warn('[push] failed to read browser push state', err)
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleSubscribe = async () => {
    if (!user || !teacherId) return
    setBusy(true)
    setMsg(null)
    try {
      await subscribeTeacherPush({ teacherId, userId: user.id })
      setMsg('تمام — إشعارات Push مفعّلة على المتصفح ده.')
      await refresh()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'حصلت مشكلة في التفعيل — حاول تاني.')
    } finally {
      setBusy(false)
    }
  }

  const handleUnsubscribe = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await unsubscribeTeacherPush()
      setMsg('اتوقفت إشعارات Push على المتصفح ده.')
      await refresh()
    } catch {
      setMsg('حصلت مشكلة في الإيقاف — حاول تاني.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="type-section mt-0 mb-3 flex items-center gap-2">
        <Bell size={22} className="text-primary" /> إشعارات Push
      </h2>
      <p className="text-muted text-[13.5px] mt-0 mb-3">
        فعّل إشعارات المتصفح على الجهاز ده عشان توصلك تنبيهات التطبيق
        (زي إثباتات الدفع الجديدة ونتائج الامتحانات) حتى والتطبيق مقفول.
      </p>
      {state === 'loading' && (
        <p className="text-muted text-[13.5px] mb-0">جارٍ فحص حالة الإشعارات…</p>
      )}
      {state === 'unsupported' && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
          المتصفح ده لا يدعم إشعارات Push. على آيفون: ثبّت التطبيق على
          الشاشة الرئيسية الأول (iOS 16.4 أو أحدث) وافتحه من هناك.
        </p>
      )}
      {state === 'unconfigured' && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
          إشعارات Push لسه مش مضبوطة في نسخة التطبيق دي.
        </p>
      )}
      {state === 'denied' && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
          إذن الإشعارات مرفوض للموقع ده — فعّله من إعدادات إشعارات
          المتصفح للموقع ثم حدّث الصفحة.
        </p>
      )}
      {state === 'subscribed' && (
        <>
          <p className="text-[13.5px] bg-ok-soft text-ok-text rounded-xl px-3 py-2 mb-3 mt-0 flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} className="shrink-0" />
            إشعارات Push مفعّلة على المتصفح ده.
          </p>
          <Button full variant="ghost" onClick={handleUnsubscribe} disabled={busy}>
            <BellOff size={20} />
            {busy ? 'جارٍ الإيقاف…' : 'إيقاف إشعارات Push على الجهاز ده'}
          </Button>
        </>
      )}
      {state === 'error' && (
        <div>
          <p className="text-muted text-[13.5px] mt-0">
            حصلت مشكلة في قراءة حالة الإشعارات على المتصفح ده — ممكن تكون مشكلة شبكة مؤقتة.
          </p>
          <Button variant="soft" disabled={busy} onClick={() => void refresh()}>
            إعادة المحاولة
          </Button>
        </div>
      )}
      {state === 'not-subscribed' && (
        <Button full onClick={handleSubscribe} disabled={busy || !teacherId}>
          <Bell size={20} />
          {busy ? 'جارٍ التفعيل…' : 'تفعيل إشعارات Push على الجهاز ده'}
        </Button>
      )}
      {msg && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0 mt-3">{msg}</p>
      )}
      {isOwner && teacherId && <DailyDigestSection teacherId={teacherId} />}
    </Card>
  )
}

/**
 * إعدادات الملخص اليومي — تفضيل محفوظ في teacher_settings (تفعيل +
 * وقت بتوقيت القاهرة). الحفظ فوري عند تغيير المفتاح أو الوقت معاً
 * عبر updatePushDigestSettings الجزئي (لا يمسّ بقية الإعدادات).
 */
function DailyDigestSection({ teacherId }: { teacherId: string }) {
  const settingsQ = useTeacherSettings(teacherId, true)
  const updateDigest = useUpdatePushDigestSettings(teacherId)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const row = settingsQ.data ?? null
  const effEnabled = enabled ?? row?.push_daily_digest_enabled ?? true
  const effTime = time ?? row?.push_daily_digest_time?.slice(0, 5) ?? '07:30'

  const save = (next: { enabled: boolean; time: string }) => {
    setMsg(null)
    if (!isValidDigestTime(next.time)) {
      setMsg('اختار وقتاً صالحاً للملخص اليومي.')
      return
    }
    updateDigest.mutate(next, {
      onSuccess: () => setMsg('تم حفظ إعدادات الملخص اليومي.'),
      onError: (err) =>
        setMsg(err instanceof Error ? err.message : 'تعذّر حفظ إعدادات الملخص — حاول تاني.'),
    })
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="type-section mt-0 mb-2 flex items-center gap-2 text-[15px]">
        <Newspaper size={20} className="text-primary" /> الملخص اليومي
      </h3>
      <p className="text-muted text-[13.5px] mt-0 mb-3">
        Push واحد كل يوم فيه حصص اليوم وعدد المتأخرات وقيمتها — بيتبعت
        في الوقت اللي تختاره (بتوقيت القاهرة) لأجهزتك المشتركة فوق.
      </p>
      {settingsQ.isPending ? (
        <p className="text-muted text-[13.5px] mb-0">جارٍ تحميل إعدادات الملخص…</p>
      ) : settingsQ.isError ? (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0">
          تعذّر تحميل إعدادات الملخص اليومي دلوقتي — حدّث الصفحة وحاول تاني.
        </p>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3 mb-3 cursor-pointer">
            <span className="text-[14px] font-semibold">تفعيل الملخص اليومي</span>
            <input
              type="checkbox"
              className="h-6 w-6 shrink-0 accent-primary"
              checked={effEnabled}
              disabled={updateDigest.isPending}
              onChange={(e) => {
                setEnabled(e.target.checked)
                save({ enabled: e.target.checked, time: effTime })
              }}
            />
          </label>
          <label className="block mb-1 text-[13.5px] font-semibold" htmlFor="digest-time">
            وقت إرسال الملخص
          </label>
          <TextInput
            id="digest-time"
            type="time"
            value={effTime}
            disabled={!effEnabled || updateDigest.isPending}
            onChange={(e) => {
              setTime(e.target.value)
              if (isValidDigestTime(e.target.value)) {
                save({ enabled: effEnabled, time: e.target.value })
              }
            }}
          />
          {row?.push_daily_digest_last_sent_on && (
            <p className="text-muted text-[12.5px] mb-0 mt-2">
              آخر ملخص اتبعت بتاريخ {row.push_daily_digest_last_sent_on}.
            </p>
          )}
        </>
      )}
      {msg && (
        <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-0 mt-3">{msg}</p>
      )}
    </div>
  )
}
