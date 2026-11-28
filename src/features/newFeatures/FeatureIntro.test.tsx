import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureIntro } from './FeatureIntro'
import { NEW_FEATURES } from './registry'

// انتقالات حالة «شوهدت» (المهمة 24 — 0073): البطاقة تظهر مرة واحدة
// لأي خاصية غير مختومة، والختم يخفيها فوراً ويكتب الحالة خادمياً؛
// غياب الجدول (قبل تطبيق 0073) = لا بطاقة إطلاقاً.
const apiState = {
  seen: [] as string[],
  fail: false,
  markSeen: vi.fn(
    async (_teacherId: string, _featureId: string, _userId: string | null) => {},
  ),
}
vi.mock('./api', () => ({
  fetchSeenFeatureIds: async () => {
    if (apiState.fail) throw new Error('relation "teacher_feature_seen" does not exist')
    return apiState.seen
  },
  markFeatureSeen: (teacherId: string, featureId: string, userId: string | null) => {
    // يحاكي الخادم الحقيقي: بعد الختم ترجع القراءة التالية الخاصية مختومة
    apiState.seen = [...apiState.seen, featureId]
    return apiState.markSeen(teacherId, featureId, userId)
  },
}))
vi.mock('../../hooks/useCurrentTeacher', () => ({
  useCurrentTeacher: () => ({ status: 'ready', teacherId: 'teacher-1', role: 'owner' }),
}))
vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

function renderIntro(featureId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <FeatureIntro featureId={featureId} />
    </QueryClientProvider>,
  )
}

const SOME_FEATURE = NEW_FEATURES[0]

describe('FeatureIntro — seen-state transitions', () => {
  beforeEach(() => {
    apiState.seen = []
    apiState.fail = false
    apiState.markSeen = vi.fn(
      async (_teacherId: string, _featureId: string, _userId: string | null) => {},
    )
  })
  afterEach(() => cleanup())

  it('shows the intro card once for an unseen feature', async () => {
    renderIntro(SOME_FEATURE.id)
    expect(await screen.findByText('خاصية جديدة')).toBeTruthy()
    expect(screen.getByRole('button', { name: /فهمت/ })).toBeTruthy()
  })

  it('renders nothing when the feature is already seen', async () => {
    apiState.seen = [SOME_FEATURE.id]
    const { container } = renderIntro(SOME_FEATURE.id)
    await waitFor(() => expect(container.firstChild).toBeNull())
    expect(screen.queryByText('خاصية جديدة')).toBeNull()
  })

  it('renders nothing for an unregistered feature id', async () => {
    const { container } = renderIntro('not-a-feature')
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('fails closed (no card) while the seen table is unavailable', async () => {
    apiState.fail = true
    const { container } = renderIntro(SOME_FEATURE.id)
    await waitFor(() => expect(container.firstChild).toBeNull())
    expect(screen.queryByText('خاصية جديدة')).toBeNull()
  })

  it('dismiss stamps the feature seen and hides the card immediately', async () => {
    renderIntro(SOME_FEATURE.id)
    const btn = await screen.findByRole('button', { name: /فهمت/ })
    fireEvent.click(btn)
    await waitFor(() => expect(screen.queryByText('خاصية جديدة')).toBeNull())
    expect(apiState.markSeen).toHaveBeenCalledWith('teacher-1', SOME_FEATURE.id, 'user-1')
  })
})
