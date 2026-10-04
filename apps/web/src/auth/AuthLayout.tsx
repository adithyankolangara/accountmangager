import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './auth.css';

export function AuthLayout({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-brand">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          SmartFin
        </Link>
        <h1>{title}</h1>
        {children}
      </div>
      {footer ? <div className="auth-footer">{footer}</div> : null}
    </main>
  );
}
