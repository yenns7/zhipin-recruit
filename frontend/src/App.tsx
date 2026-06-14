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
import { BiPage } from './pages/BiPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { UploadPage } from './pages/UploadPage';
import { CandidateProfilePage } from './pages/CandidateProfilePage';
import { JobsPage } from './pages/JobsPage';
import { JobMatchPage } from './pages/JobMatchPage';
import { PipelinePage } from './pages/PipelinePage';
import { InterviewListPage } from './pages/InterviewListPage';
import { InterviewsPage } from './pages/InterviewsPage';
import { InterviewReportPage } from './pages/InterviewReportPage';
import { AgentPage } from './pages/AgentPage';
import { UsersPage } from './pages/admin/UsersPage';
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
        <Route path="/candidates" element={<CandidatesPage />} />
        <Route path="/candidates/:id" element={<CandidateProfilePage />} />
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
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
