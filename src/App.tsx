import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/AuthProvider'
import { registerRouteLoaders } from './lib/routePrefetch'
import { ToastProvider } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import { LoadingState } from './components/ui/states'
import { HomePage } from './features/home/HomePage'
import { LoginPage } from './features/auth/LoginPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { NotFoundGate } from './features/notfound/NotFoundGate'

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
const ExamPage = lazy(() =>
  import('./features/exams/ExamPage').then((m) => ({ default: m.ExamPage })),
)
const StudentPortalPage = lazy(() =>
  import('./features/student-portal/StudentPortalPage').then((m) => ({
    default: m.StudentPortalPage,
  })),
)
const EnrolPage = lazy(() =>
  import('./features/enrol/EnrolPage').then((m) => ({ default: m.EnrolPage })),
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
const AnalyticsPage = lazy(() =>
  import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const AtRiskPage = lazy(() =>
  import('./features/atrisk/AtRiskPage').then((m) => ({ default: m.AtRiskPage })),
)
/* صفحة 404 لا تُعرَّف هنا: بوابتها (features/notfound/NotFoundGate)
   تحملها كسولاً بنفسها — انظر تعليق مسار `*` العلوي أسفل الشجرة */

/*
 * تسخين الحزم (3A-312 — بند ٢): تسجيل نفس import() الخاص بكل مسار
 * كسول في سجلّ الجلب المقدم (lib/routePrefetch) — عناصر التنقّل
 * (صفوف «المزيد» وتبويبات الشريط السفلي) تُسخّن وجهتها عند بدء اللمس،
 * وصفحة «المزيد» تُسخّن وجهاتها كلها عند الخمول، فلا تدفع أول ضغطة
 * ثمن الجلب والتحليل. نفس محمّلات الصفحات العامة (البوابات/الامتحان/
 * الحجز) غير مسجّلة عمداً: لا تُفتح من تنقّل داخلي.
 */
registerRouteLoaders({
  '/attendance': () => import('./features/attendance/AttendancePage'),
  '/homework': () => import('./features/homework/HomeworkPage'),
  '/students': () => import('./features/students/StudentsPage'),
  '/groups': () => import('./features/groups/GroupsPage'),
  '/invoices': () => import('./features/invoices/InvoicesPage'),
  '/schedule': () => import('./features/schedule/SchedulePage'),
  '/grades': () => import('./features/grades/GradesPage'),
  '/money': () => import('./features/money/MoneyPage'),
  '/notifications': () => import('./features/notifications/NotificationsPage'),
  '/settings': () => import('./features/settings/SettingsPage'),
  '/export': () => import('./features/settings/ExportPage'),
  '/backup': () => import('./features/settings/BackupPage'),
  '/more': () => import('./features/settings/MorePage'),
  '/activity-log': () => import('./features/activity/ActivityLogPage'),
  '/analytics': () => import('./features/analytics/AnalyticsPage'),
  '/at-risk': () => import('./features/atrisk/AtRiskPage'),
  '/portal-links': () => import('./features/portal/PortalManagePage'),
})

/** غلاف Suspense بسقوط Skeleton الموحّد — يُستخدم لكل مسار كسول */
function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>
}

// إعدادات الكاش (3A-296، بعد إصلاح خريطة الإبطال PAT-1): staleTime
// ‏30 ثانية آمن الآن لأن كل طفرة تُبطل الوحدات المشتقة منها مركزياً
// (lib/invalidate) — التنقّل بين الشاشات خلال النافذة يعيد استخدام
// الكاش بدل إعادة جلب كل شيء عند كل تركيب (السلوك القديم staleTime=0
// كان سبباً رئيسياً في تضخّم عدد الطلبات). retry مرة واحدة يقلّل
// إعادة محاولات الشبكة المتقطعة بلا إخفاء للأخطاء الحقيقية.
// سياسة إعادة المحاولة (توحيد موثق 3A-383 لملاحظة مراجعة #11 عن تفاوت
// الصفحات): الافتراضي للمصادَق retry:1، والطفرات retry:0 دائماً؛
// والاستثناء الوحيد المقصود هو أسطح التوكنات العامة (بوابة ولي الأمر
// وبوابة الطالب والامتحان العام والتسجيل) بـ retry:false — رمز
// خاطئ/منتهٍ لن يتصلّح بإعادة المحاولة، والتكرار هناك يضخّم الحمل
// ويؤخّر رسالة الانتهاء الواضحة. أي سطح جديد يختار من هذين بوعي.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            {/* الامتحان الإلكتروني: صفحة عامة بلا جلسة — الاعتماد هو
                رابط الامتحان الموقّع (?t=) + كود الطالب عبر RPC فقط */}
            <Route
              path="/exam"
              element={
                <LazyRoute>
                  <ExamPage />
                </LazyRoute>
              }
            />
            {/* بوابة الطالب: صفحة عامة بلا جلسة — الاعتماد هو رابط
                الطالب الموقّع (?t=) وحده عبر RPC قراءة فقط */}
            <Route
              path="/student-portal"
              element={
                <LazyRoute>
                  <StudentPortalPage />
                </LazyRoute>
              }
            />
            {/* صفحة الحجز العامة: بلا جلسة — الاعتماد هو رابط السنتر
                (?t=) وحده عبر دالتي RPC مقيدتين، والطلبات تهبط في
                قوائم انتظار المجموعات بمصدر «صفحة الحجز» (0019) */}
            <Route
              path="/book"
              element={
                <LazyRoute>
                  <EnrolPage />
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
              <Route
                path="analytics"
                element={
                  <LazyRoute>
                    <AnalyticsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="at-risk"
                element={
                  <LazyRoute>
                    <AtRiskPage />
                  </LazyRoute>
                }
              />
            </Route>
            </Route>
            {/* catch-all وحيد واعٍ بالجلسة (إصلاح 3A-331): كان هنا
                مساران `*` متنافسان — هذا وآخر متداخل داخل فرع
                RequireAuth>AppShell أُزيل — فكان RequireAuth يبتلع
                المسار المجهول لغير المسجّل ويحوّله إلى /login قبل
                رسم أي 404. البوابة الواحدة هنا لا تُبلَغ إلا لمسار
                لم يطابق أي مسار معروف (المسارات المعروفة أعلى درجة
                من `*` فتُحسم أولاً: الداخلية منها عبر RequireAuth
                وتحويله إلى /login محفوظ، والعامة كما هي)، وداخلها:
                تحميل الجلسة → MascotSplash، بلا جلسة → 404 منفردة،
                بجلسة → 404 داخل القشرة */}
            <Route path="*" element={<NotFoundGate />} />
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
