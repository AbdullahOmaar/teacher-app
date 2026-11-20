import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/AuthProvider'
import { ToastProvider } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import { LoadingState } from './components/ui/states'
import { HomePage } from './features/home/HomePage'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'

/*
 * تقسيم المسارات (Phase 2 — الخطوة 12): كل شاشة غير أولية تُحمَّل كسولاً
 * بـ React.lazy فتخرج في chunk مستقل يُجلب عند أول زيارة فقط.
 * يبقى في الحزمة الأولية عمداً: القشرة (AppShell) + الدخول (أول ما يراه
 * غير المسجّل) + الرئيسية (وجهة ما بعد الدخول) — أصغر سطح إقلاع ممكن
 * بلا أي وميض تحميل في أهم مسارين. باقي الشاشات (الحضور، الطلاب،
 * الفواتير، الفلوس، الدرجات، الجدول، الإعدادات/التصدير/النسخ، البوابة…)
 * كسولة كلها، والثقيلة منها أول المستفيدين.
 * السقوط الموحّد: LoadingState (Skeleton البطاقات من نظام المكونات)،
 * ويظهر داخل منطقة محتوى القشرة فقط فتبقى الترويسة والشريط السفلي ثابتة.
 */
const AttendancePage = lazy(() =>
  import('./features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })),
)
const HomeworkPage = lazy(() =>
  import('./features/homework/HomeworkPage').then((m) => ({ default: m.HomeworkPage })),
)
const StudentsPage = lazy(() =>
  import('./features/students/StudentsPage').then((m) => ({ default: m.StudentsPage })),
)
const StudentDetailPage = lazy(() =>
  import('./features/students/StudentDetailPage').then((m) => ({ default: m.StudentDetailPage })),
)
const GroupsPage = lazy(() =>
  import('./features/groups/GroupsPage').then((m) => ({ default: m.GroupsPage })),
)
const GroupDetailPage = lazy(() =>
  import('./features/groups/GroupDetailPage').then((m) => ({ default: m.GroupDetailPage })),
)
const InvoicesPage = lazy(() =>
  import('./features/invoices/InvoicesPage').then((m) => ({ default: m.InvoicesPage })),
)
const InvoiceDetailPage = lazy(() =>
  import('./features/invoices/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })),
)
const SchedulePage = lazy(() =>
  import('./features/schedule/SchedulePage').then((m) => ({ default: m.SchedulePage })),
)
const GradesPage = lazy(() =>
  import('./features/grades/GradesPage').then((m) => ({ default: m.GradesPage })),
)
const AssessmentDetailPage = lazy(() =>
  import('./features/grades/AssessmentDetailPage').then((m) => ({
    default: m.AssessmentDetailPage,
  })),
)
const MoneyPage = lazy(() =>
  import('./features/money/MoneyPage').then((m) => ({ default: m.MoneyPage })),
)
const NotificationsPage = lazy(() =>
  import('./features/notifications/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
)
const PortalPage = lazy(() =>
  import('./features/portal/PortalPage').then((m) => ({ default: m.PortalPage })),
)
const PortalManagePage = lazy(() =>
  import('./features/portal/PortalManagePage').then((m) => ({ default: m.PortalManagePage })),
)
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const ExportPage = lazy(() =>
  import('./features/settings/ExportPage').then((m) => ({ default: m.ExportPage })),
)
const BackupPage = lazy(() =>
  import('./features/settings/BackupPage').then((m) => ({ default: m.BackupPage })),
)
const MorePage = lazy(() =>
  import('./features/settings/MorePage').then((m) => ({ default: m.MorePage })),
)
const ActivityLogPage = lazy(() =>
  import('./features/activity/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })),
)

/** غلاف Suspense بسقوط Skeleton الموحّد — يُستخدم لكل مسار كسول */
function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>
}

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* بوابة ولي الأمر: صفحة عامة بلا جلسة مدرس — الاعتماد هو
                الرابط الموقّع في الاستعلام (?student=&t=) عبر RPC فقط */}
            <Route
              path="/portal"
              element={
                <LazyRoute>
                  <PortalPage />
                </LazyRoute>
              }
            />
            <Route
              path="/portal/:studentId"
              element={
                <LazyRoute>
                  <PortalPage />
                </LazyRoute>
              }
            />
            <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route
                path="attendance"
                element={
                  <LazyRoute>
                    <AttendancePage />
                  </LazyRoute>
                }
              />
              <Route
                path="homework"
                element={
                  <LazyRoute>
                    <HomeworkPage />
                  </LazyRoute>
                }
              />
              <Route
                path="students"
                element={
                  <LazyRoute>
                    <StudentsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="students/:id"
                element={
                  <LazyRoute>
                    <StudentDetailPage />
                  </LazyRoute>
                }
              />
              <Route
                path="invoices"
                element={
                  <LazyRoute>
                    <InvoicesPage />
                  </LazyRoute>
                }
              />
              <Route
                path="invoices/:id"
                element={
                  <LazyRoute>
                    <InvoiceDetailPage />
                  </LazyRoute>
                }
              />
              <Route
                path="more"
                element={
                  <LazyRoute>
                    <MorePage />
                  </LazyRoute>
                }
              />
              <Route
                path="schedule"
                element={
                  <LazyRoute>
                    <SchedulePage />
                  </LazyRoute>
                }
              />
              <Route
                path="groups"
                element={
                  <LazyRoute>
                    <GroupsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="groups/:id"
                element={
                  <LazyRoute>
                    <GroupDetailPage />
                  </LazyRoute>
                }
              />
              <Route
                path="grades"
                element={
                  <LazyRoute>
                    <GradesPage />
                  </LazyRoute>
                }
              />
              <Route
                path="assessments/:id"
                element={
                  <LazyRoute>
                    <AssessmentDetailPage />
                  </LazyRoute>
                }
              />
              <Route
                path="money"
                element={
                  <LazyRoute>
                    <MoneyPage />
                  </LazyRoute>
                }
              />
              <Route
                path="notifications"
                element={
                  <LazyRoute>
                    <NotificationsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="export"
                element={
                  <LazyRoute>
                    <ExportPage />
                  </LazyRoute>
                }
              />
              <Route
                path="backup"
                element={
                  <LazyRoute>
                    <BackupPage />
                  </LazyRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <LazyRoute>
                    <SettingsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="portal-links"
                element={
                  <LazyRoute>
                    <PortalManagePage />
                  </LazyRoute>
                }
              />
              <Route
                path="activity-log"
                element={
                  <LazyRoute>
                    <ActivityLogPage />
                  </LazyRoute>
                }
              />
            </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
