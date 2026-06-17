// App root: wires the router and auth-gated layout.
// Unauthenticated users always land on the login page; authenticated users
// get the AppShell with role-aware nested routes.

import type { ReactElement } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { defaultRouteForRole } from './lib/nav';
import { featureRoutes } from './app/featureRegistry';
import { BiPage } from './pages/BiPage';
import { UploadPage } from './pages/UploadPage';
import { JobsPage } from './pages/JobsPage';
import { JobMatchPage } from './pages/JobMatchPage';
import { TalentMapPage } from './pages/TalentMapPage';
import { PipelinePage } from './pages/PipelinePage';
import { InterviewListPage } from './pages/InterviewListPage';
import { InterviewsPage } from './pages/InterviewsPage';
import { InterviewReportPage } from './pages/InterviewReportPage';
import { AgentPage } from './pages/AgentPage';
import { NotificationCenterPage } from './pages/NotificationCenterPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AiArchitecturePage } from './pages/admin/AiArchitecturePage';
import { SystemSettingsPage } from './pages/admin/SystemSettingsPage';
import { ToastProvider } from './components/ui';
import type { Role } from './types';

// Gate for the authenticated app area.
function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <AppShell />;
}

// Restrict a route to specific roles; otherwise bounce to the role's home.
function RequireRole({ allow, element }: { allow: Role[]; element: ReactElement }) {
  const { role } = useAuth();
  if (role && !allow.includes(role)) {
    return <Navigate to={defaultRouteForRole()} replace />;
  }
  return element;
}

function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={role ? defaultRouteForRole() : '/login'} replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <HomeRedirect /> : <LoginPage />}
      />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/notifications" element={<NotificationCenterPage />} />
        {featureRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              route.roles
                ? <RequireRole allow={route.roles} element={route.element} />
                : route.element
            }
          />
        ))}
        <Route
          path="/upload"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<UploadPage />}
            />
          }
        />
        <Route
          path="/jobs"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<JobsPage />}
            />
          }
        />
        <Route
          path="/jobs/:id/match"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<JobMatchPage />}
            />
          }
        />
        <Route
          path="/talent-map"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<TalentMapPage />}
            />
          }
        />
        <Route
          path="/pipeline"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin', 'interviewer']}
              element={<PipelinePage />}
            />
          }
        />
        <Route
          path="/interviews"
          element={
            <RequireRole
              allow={['recruiter', 'interviewer', 'manager', 'admin']}
              element={<InterviewListPage />}
            />
          }
        />
        <Route
          path="/interviews/new"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<InterviewsPage />}
            />
          }
        />
        <Route
          path="/interviews/:id"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin', 'interviewer']}
              element={<InterviewReportPage />}
            />
          }
        />
        <Route
          path="/bi"
          element={
            <RequireRole allow={['manager', 'admin']} element={<BiPage />} />
          }
        />
        <Route
          path="/admin/users"
          element={<RequireRole allow={['admin']} element={<UsersPage />} />}
        />
        <Route
          path="/admin/settings"
          element={<RequireRole allow={['admin']} element={<SystemSettingsPage />} />}
        />
        <Route
          path="/admin/ai-architecture"
          element={<RequireRole allow={['admin']} element={<AiArchitecturePage />} />}
        />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
