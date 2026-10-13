import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-red-300 mb-4">403</h1>
        <h2 className="text-2xl font-semibold text-slate-700 mb-2">Unauthorized</h2>
        <p className="text-slate-500 mb-6">You don't have permission to access this page.</p>
        <Link to="/" className="text-primary-600 hover:text-primary-700 font-medium">
          Go to Home
        </Link>
      </div>
    </div>
  );
}
