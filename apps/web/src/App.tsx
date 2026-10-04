import { lazy, type ComponentType } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { SignIn } from './auth/SignIn';
import { SignUp } from './auth/SignUp';
import { AppShell } from './layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { Privacy } from './pages/Privacy';

// Screens beyond the dashboard load on first visit (AppShell wraps them in <Suspense>).
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const Transactions = page(() => import('./pages/Transactions'), 'Transactions');
const TransactionEditor = page(() => import('./pages/TransactionEditor'), 'TransactionEditor');
const ImportStatement = page(() => import('./pages/ImportStatement'), 'ImportStatement');
const Accounts = lazy(() => import('./pages/Accounts').then((m) => ({ default: m.Accounts })));
const AccountEditor = page(() => import('./pages/AccountEditor'), 'AccountEditor');
const AccountDetail = page(() => import('./pages/AccountDetail'), 'AccountDetail');
const Income = page(() => import('./pages/Income'), 'Income');
const Reports = page(() => import('./pages/Reports'), 'Reports');
const Settings = page(() => import('./pages/Settings'), 'Settings');

export function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="transactions/new" element={<TransactionEditor />} />
        <Route path="transactions/import" element={<ImportStatement />} />
        <Route path="transactions/:id" element={<TransactionEditor />} />
        <Route path="accounts" element={<Accounts mode="bank" />} />
        <Route path="cash" element={<Accounts mode="cash" />} />
        <Route path="accounts/new" element={<AccountEditor />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="accounts/:id/edit" element={<AccountEditor />} />
        <Route path="income" element={<Income />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
