import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import MapFinderPage from './pages/MapFinderPage.jsx';
import StationDetailPage from './pages/StationDetailPage.jsx';
import MyBookingsPage from './pages/MyBookingsPage.jsx';
import BookingConfirmationPage from './pages/BookingConfirmationPage.jsx';
import OperatorDashboardPage from './pages/OperatorDashboardPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import ServerStatusBanner from './components/ServerStatusBanner.jsx';

export default function App() {
  return (
    <>
      <ServerStatusBanner />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute role="driver">
            <MapFinderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stations/:id"
        element={
          <ProtectedRoute>
            <StationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings"
        element={
          <ProtectedRoute role="driver">
            <MyBookingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings/:id/confirmation"
        element={
          <ProtectedRoute>
            <BookingConfirmationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/operator"
        element={
          <ProtectedRoute role="operator">
            <OperatorDashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
