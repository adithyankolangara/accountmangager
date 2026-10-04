import { Link } from 'react-router';
import { formatFinancialDate, PRIVACY_NOTICE_VERSION } from '@smartfin/shared';
import '../auth/auth.css';

export function Privacy() {
  return (
    <main className="prose">
      <p>
        <Link to="/">← SmartFin</Link>
      </p>
      <h1>Privacy notice</h1>
      <p className="muted">
        Version {formatFinancialDate(PRIVACY_NOTICE_VERSION)}. Draft, pending legal review. It
        describes what this version of SmartFin actually does.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          Your name, email address and a one-way hash of your password (never the password itself).
        </li>
        <li>
          The financial records you enter or import: accounts, transactions, income sources and
          categories.
        </li>
        <li>
          For accounts, only the last four digits of an account number. Never full account numbers,
          card numbers, CVVs, PINs, OTPs or internet-banking passwords.
        </li>
        <li>
          A security log of sign-ins, changes and imports (who did what and when) so you and we can
          investigate problems.
        </li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>
          We don&apos;t connect to your bank or read your bank messages. Everything comes from you.
        </li>
        <li>We don&apos;t sell your data or use advertising or tracking cookies.</li>
        <li>We don&apos;t send your financial data to AI or analytics providers.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        One essential cookie keeps you signed in. It can&apos;t be read by scripts and is only sent
        to SmartFin. Your theme choice is kept in your browser&apos;s local storage.
      </p>

      <h2>Where your data lives</h2>
      <p>
        The SmartFin service and database are hosted by Render (Singapore region). The web app is
        delivered by Vercel. Connections are encrypted (HTTPS).
      </p>

      <h2>Sharing</h2>
      <p>
        Your records are private to you. Family sharing (coming later) will only ever share what you
        explicitly choose, and you can revoke it at any time.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          Edit or delete any record. Deleted transactions can be restored for a while, then are
          removed.
        </li>
        <li>Remove demo data at any time from Settings.</li>
        <li>
          Export of all your data and self-service account deletion are planned. Until then, contact
          the person who runs your SmartFin installation.
        </li>
      </ul>
    </main>
  );
}
