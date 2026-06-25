// App root: wires the router and auth-gated layout.
// Unauthenticated users always land on the login page; authenticated users
// get the AppShell with role-aware nested routes.

import { lazy, Suspense, type ReactElement } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { defaultRouteForRole } from './lib/nav';
import { featureRoutes } from './app/featureRegistry';
import { ToastProvider } from './components/ui';
import type { Role } from './types';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AgentPage = lazy(() => import('./pages/AgentPage').then((module) => ({ default: module.AgentPage })));
const NotificationCenterPage = lazy(() => import('./pages/NotificationCenterPage').then((module) => ({ default: module.NotificationCenterPage })));
const UploadPage = lazy(() => import('./pages/UploadPage').then((module) => ({ default: module.UploadPage })));
const JobsPage = lazy(() => import('./pages/JobsPage').then((module) => ({ default: module.JobsPage })));
const JobMatchPage = lazy(() => import('./pages/JobMatchPage').then((module) => ({ default: module.JobMatchPage })));
const TalentMapPage = lazy(() => import('./pages/TalentMapPage').then((module) => ({ default: module.TalentMapPage })));
const PipelinePage = lazy(() => import('./pages/PipelinePage').then((module) => ({ default: module.PipelinePage })));
const InterviewListPage = lazy(() => import('./pages/InterviewListPage').then((module) => ({ default: module.InterviewListPage })));
const InterviewsPage = lazy(() => import('./pages/InterviewsPage').then((module) => ({ default: module.InterviewsPage })));
const InterviewReportPage = lazy(() => import('./pages/InterviewReportPage').then((module) => ({ default: module.InterviewReportPage })));
const BiPage = lazy(() => import('./pages/BiPage').then((module) => ({ default: module.BiPage })));
const UsersPage = lazy(() => import('./pages/admin/UsersPage').then((module) => ({ default: module.UsersPage })));
const SystemSettingsPage = lazy(() => import('./pages/admin/SystemSettingsPage').then((module) => ({ default: module.SystemSettingsPage })));
const AiArchitecturePage = lazy(() => import('./pages/admin/AiArchitecturePage').then((module) => ({ default: module.AiArchitecturePage })));

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
        <Route
          path="/agent"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<AgentPage />}
            />
          }
        />
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
              allow={['recruiter', 'manager', 'admin']}
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
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center text-sm text-muted">
                加载中…
              </div>
            }
          >
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
