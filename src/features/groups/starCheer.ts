// ===========================================================================
// منطق احتفالات «النجم» عند محطات المجموعات (خطة الهوية P-12 — 3A-307).
//
// نقي بلا React: يُشتق من بيانات موجودة أصلاً على صفحة المجموعة
// (عدد المسجلين من قائمتها + عدد الحصص من بصمتها) — لا استعلامات
// جديدة ولا هجرة قاعدة. المحطات بقواعد الخطة: إنجازات حقيقية قليلة
// حتى لا تتحول المكافأة لضجيج (أحجام قائمة متدرجة + حصص متراكمة).
//
// «مرة واحدة لكل محطة لكل مجموعة» تُحفظ في التخزين المحلي بمفتاح
// مدرس+مجموعة (قيمة JSON بقائمة المحطات المحتفَل بها) — الجهاز هو
// سياق الاحتفال أصلاً، فلا حاجة لمزامنة خادمية. عند عرض احتفال
// تُعلَّم كل المحطات المحققة لحظتها «محتفَلاً بها» دفعة واحدة:
// العتبات تراكمية (وصول ٢٥ يعني أن ١٠ تحققت قبله) فالاحتفال بالأعلى
// هو الخبر، ولا فيض احتفالات متتالية عند أول فتح لمجموعة كبيرة.
// ===========================================================================

type MilestoneKind = 'students' | 'sessions'

export interface GroupMilestone {
  id: string
  kind: MilestoneKind
  threshold: number
}

/** المحطات المعرفة — ترتيب تصاعدي داخل كل نوع */
const GROUP_MILESTONES: readonly GroupMilestone[] = [
  { id: 'students-10', kind: 'students', threshold: 10 },
  { id: 'students-25', kind: 'students', threshold: 25 },
  { id: 'students-50', kind: 'students', threshold: 50 },
  { id: 'sessions-10', kind: 'sessions', threshold: 10 },
  { id: 'sessions-30', kind: 'sessions', threshold: 30 },
]

export interface GroupMilestoneStats {
  /** عدد طلاب المجموعة المسجلين — null = لم تصل البيانات بعد */
  students: number | null
  /** عدد حصص المجموعة — null = غير متاح (تحميل/دور بلا بصمة) */
  sessions: number | null
}

/** المحطات المحققة من الإحصاءات الحالية — نوع بلا بيانات لا يُقيَّم */
export function reachedMilestones(stats: GroupMilestoneStats): GroupMilestone[] {
  return GROUP_MILESTONES.filter((m) => {
    const value = m.kind === 'students' ? stats.students : stats.sessions
    return value !== null && value >= m.threshold
  })
}

/**
 * اختيار احتفال النجم التالي: أعلى محطة محققة لم يُحتفل بها بعد
 * (الأعلى عتبة؛ وعند التعادل طلاباً قبل حصصاً). null = لا جديد.
 */
export function pickStarCelebration(
  reached: readonly GroupMilestone[],
  celebrated: ReadonlySet<string>,
): GroupMilestone | null {
  let best: GroupMilestone | null = null
  for (const m of reached) {
    if (celebrated.has(m.id)) continue
    if (
      best === null ||
      m.threshold > best.threshold ||
      (m.threshold === best.threshold && m.kind === 'students' && best.kind === 'sessions')
    ) {
      best = m
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// تخزين «احتُفل بها» — محلي لكل جهاز، بمفتاح مدرس+مجموعة كما قررت الخطة.
// الفشل (وضع خاص/تخزين ممتلئ) يسقط لذاكرة الجلسة فقط: الاحتفال رفاهية
// لحظية، وتكراره المحتمل في متصفح مقيد أهون من كسر الصفحة.
// ---------------------------------------------------------------------------

export function starCheerStorageKey(teacherId: string, groupId: string): string {
  return `teacher-app-star-cheer:${teacherId}:${groupId}`
}

export function loadCelebratedMilestones(teacherId: string, groupId: string): Set<string> {
  try {
    const raw = localStorage.getItem(starCheerStorageKey(teacherId, groupId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    // تخزين غير متاح أو قيمة فاسدة: نبدأ من الصفر بلا كسر
    return new Set()
  }
}

export function saveCelebratedMilestones(
  teacherId: string,
  groupId: string,
  ids: ReadonlySet<string>,
): void {
  try {
    localStorage.setItem(starCheerStorageKey(teacherId, groupId), JSON.stringify([...ids]))
  } catch {
    // التخزين غير متاح: الاحتفال المعروض لا يتكرر في هذه الجلسة
    // (حارس عمر الصفحة في المكوّن)، والتكرار في زيارة مقبلة مقبول
  }
}
