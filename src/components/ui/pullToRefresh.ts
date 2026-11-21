// ===========================================================================
// آلة حالات إيماءة «السحب للتحديث» النقية (خطة الهوية P-11 — 3A-307).
//
// بلا أي React أو DOM: مكوّن PullToRefresh يُطعمها أحداث اللمس الخام
// (إحداثيات + سياق: هل الصفحة عند القمة؟ هل ثمة سطح مفتوح فوقها؟)
// فتقرر حالة الإيماءة ومسافة السحب البصرية ومتى يُطلَق التحديث.
// القواعد:
// ١) لا انخراط إلا من قمة الصفحة (scrollY = 0) وبلا سطح مفتوح فوقها
//    (شيت/مودال يقفل تمرير الخلفية أصلاً) وبلا تحديث جارٍ.
// ٢) قفل اتجاه بعد مسافة تردد (slop): حركة أفقية غالبة (رقائق الفلاتر)
//    تُجهض الإيماءة نهائياً حتى نهاية اللمسة — لا صراع مع التمرير
//    الأفقي ولا مع تمرير الصفحة العمودي الطبيعي (السحب لأعلى أو
//    البدء من غير القمة لا ينخرط أصلاً).
// ٣) مقاومة خطية: المسافة البصرية = الخام × 0.5 بسقف — إحساس سحب
//    حقيقي بلا ابتعاد المؤشر عن الإصبع تماماً.
// ٤) الإفلات فوق العتبة = تحديث؛ دونها = إلغاء صامت. الإلغاء
//    (touchcancel/لمسة ثانية) لا يُطلق تحديثاً أبداً.
// ===========================================================================

/** مسافة التردد قبل قفل الاتجاه (px) — اللمسات العادية لا تتجاوزها */
export const PTR_SLOP_PX = 10
/** عتبة السحب البصري للإطلاق (px) */
export const PTR_THRESHOLD_PX = 64
/** سقف السحب البصري (px) */
export const PTR_MAX_PULL_PX = 92
/** معامل المقاومة: البصري = الخام × هذا المعامل */
export const PTR_RESISTANCE = 0.5

export type PtrPhase = 'idle' | 'tracking' | 'refreshing'
export type PtrDirection = 'none' | 'vertical' | 'horizontal'

export interface PtrState {
  phase: PtrPhase
  startX: number
  startY: number
  direction: PtrDirection
  /** مسافة السحب البصرية الحالية (px) — صفر ما لم تنخرط عمودياً */
  pull: number
  /** تجاوزت المسافة العتبة؟ (يُسلَّح التحديث عند الإفلات) */
  armed: boolean
}

export const initialPtrState: PtrState = {
  phase: 'idle',
  startX: 0,
  startY: 0,
  direction: 'none',
  pull: 0,
  armed: false,
}

/** مسافة السحب البصرية من إزاحة خام لأسفل — مقاومة خطية بسقف */
export function ptrDisplayPull(rawDy: number): number {
  if (rawDy <= 0) return 0
  return Math.min(rawDy * PTR_RESISTANCE, PTR_MAX_PULL_PX)
}

/** سياق بدء اللمسة كما يقرؤه المكوّن من الصفحة لحظة touchstart */
export interface PtrStartContext {
  /** الصفحة عند قمتها (لا تمرير لأعلى متبقٍّ) */
  atTop: boolean
  /** سطح مفتوح فوق الصفحة (شيت/مودال) أو تحديث جارٍ أصلاً */
  blocked: boolean
}

/** بدء لمسة: تنخرط الآلة في التتبع فقط إن سمح السياق، وإلا تبقى خاملة */
export function ptrStart(
  state: PtrState,
  x: number,
  y: number,
  ctx: PtrStartContext,
): PtrState {
  if (state.phase === 'refreshing' || !ctx.atTop || ctx.blocked) return state
  return { phase: 'tracking', startX: x, startY: y, direction: 'none', pull: 0, armed: false }
}

/** حركة اللمسة: قفل اتجاه ثم تحديث مسافة السحب البصرية وحالة التسليح */
export function ptrMove(state: PtrState, x: number, y: number): PtrState {
  if (state.phase !== 'tracking') return state
  const dx = x - state.startX
  const dy = y - state.startY

  let direction = state.direction
  if (direction === 'none') {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < PTR_SLOP_PX) return state
    direction = Math.abs(dy) >= Math.abs(dx) ? 'vertical' : 'horizontal'
  }
  if (direction === 'horizontal') {
    // إجهاض نهائي لهذه اللمسة: لا سحب ولا تسليح مهما تغيّرت الحركة بعدها
    return state.pull === 0 && !state.armed && state.direction === 'horizontal'
      ? state
      : { ...state, direction, pull: 0, armed: false }
  }
  const pull = ptrDisplayPull(dy)
  const armed = pull >= PTR_THRESHOLD_PX
  if (pull === state.pull && armed === state.armed && direction === state.direction) {
    return state
  }
  return { ...state, direction, pull, armed }
}

/**
 * إفلات اللمسة: فوق العتبة → طور التحديث وإطلاق واحد؛ دونها → خمول
 * صامت. تعيد نفس المرجع عند غياب أي تغيير (استقرار اشتقاقي).
 */
export function ptrEnd(state: PtrState): { state: PtrState; trigger: boolean } {
  if (state.phase !== 'tracking') return { state, trigger: false }
  if (state.armed) {
    return {
      state: { ...initialPtrState, phase: 'refreshing', pull: PTR_THRESHOLD_PX, armed: true },
      trigger: true,
    }
  }
  return { state: initialPtrState, trigger: false }
}

/** إلغاء اللمسة (touchcancel/لمسة ثانية/فتح سطح): خمول بلا إطلاق أبداً */
export function ptrCancel(state: PtrState): PtrState {
  return state.phase === 'tracking' ? initialPtrState : state
}

/** انتهاء التحديث: عودة للخمول من أي طور */
export function ptrRefreshed(state: PtrState): PtrState {
  return state.phase === 'refreshing' ? initialPtrState : state
}
