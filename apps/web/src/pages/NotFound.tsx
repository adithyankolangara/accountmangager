import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Page not found</h1>
        <p className="muted">This page doesn&apos;t exist, or it hasn&apos;t been built yet.</p>
      </header>
      <p>
        <Link to="/">Go to the dashboard</Link>
      </p>
    </div>
  );
}
