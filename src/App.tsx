import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/AuthProvider'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './features/home/HomePage'
import { AttendancePage } from './features/attendance/AttendancePage'
import { StudentsPage } from './features/students/StudentsPage'
import { StudentDetailPage } from './features/students/StudentDetailPage'
import { GroupsPage } from './features/groups/GroupsPage'
import { InvoicesPage } from './features/invoices/InvoicesPage'
import { InvoiceDetailPage } from './features/invoices/InvoiceDetailPage'
import { SchedulePage } from './features/schedule/SchedulePage'
import { GradesPage } from './features/grades/GradesPage'
import { AssessmentDetailPage } from './features/grades/AssessmentDetailPage'
import { MoneyPage } from './features/money/MoneyPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'
import { PortalPage } from './features/portal/PortalPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ExportPage } from './features/settings/ExportPage'
import { BackupPage } from './features/settings/BackupPage'
import { MorePage } from './features/settings/MorePage'
import { LoginPage } from './features/auth/LoginPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="students/:id" element={<StudentDetailPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="more" element={<MorePage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="grades" element={<GradesPage />} />
              <Route path="assessments/:id" element={<AssessmentDetailPage />} />
              <Route path="money" element={<MoneyPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="export" element={<ExportPage />} />
              <Route path="backup" element={<BackupPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="portal" element={<PortalPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
