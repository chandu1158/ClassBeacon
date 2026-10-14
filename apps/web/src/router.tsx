import { createBrowserRouter } from 'react-router-dom';
import RequireAuth from '@cb/components/RequireAuth';
import LoginPage from '@cb/pages/LoginPage';
import DashboardPage from '@cb/pages/DashboardPage';
import UnauthorizedPage from '@cb/pages/UnauthorizedPage';
import AdminDashboardPage from '@cb/pages/AdminDashboardPage';
import StaffDashboardPage from '@cb/pages/StaffDashboardPage';
import StaffReportsPage from '@cb/pages/StaffReportsPage';
import StudentDashboardPage from '@cb/pages/StudentDashboardPage';
import StudentDataPage from '@cb/pages/StudentDataPage';
import LessonPlayerPage from '@cb/pages/LessonPlayerPage';
import PrivacyNoticePage from '@cb/pages/PrivacyNoticePage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/privacy',
    element: <PrivacyNoticePage />,
  },
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <DashboardPage />,
      },
      {
        element: <RequireAuth allowedRoles={['admin']} />,
        children: [
          {
            path: '/admin',
            element: <AdminDashboardPage />,
          },
        ],
      },
      {
        element: <RequireAuth allowedRoles={['staff', 'admin']} />,
        children: [
          {
            path: '/staff',
            element: <StaffDashboardPage />,
          },
          {
            path: '/staff/reports',
            element: <StaffReportsPage />,
          },
        ],
      },
      {
        element: <RequireAuth allowedRoles={['student']} />,
        children: [
          {
            path: '/student',
            element: <StudentDashboardPage />,
          },
          {
            path: '/student/data',
            element: <StudentDataPage />,
          },
          {
            path: '/student/lesson/:assignmentId',
            element: <LessonPlayerPage />,
          },
        ],
      },
    ],
  },
]);
