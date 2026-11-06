import { Navigate } from 'react-router-dom';

/**
 * The month matrix now lives on the Attendance page (/hr/attendance,
 * "Calendar" tab). This route redirects there so old bookmarks keep working.
 */
export default function CalendarMatrixPage() {
  return <Navigate to="/hr/attendance" replace />;
}
