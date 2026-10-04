import { Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
