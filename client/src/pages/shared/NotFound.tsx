export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-300 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-slate-700 mb-2">Page Not Found</h2>
        <p className="text-slate-500 mb-6">The page you're looking for doesn't exist.</p>
        <a href="/" className="text-primary-600 hover:text-primary-700 font-medium">
          Go to Home
        </a>
      </div>
    </div>
  );
}
