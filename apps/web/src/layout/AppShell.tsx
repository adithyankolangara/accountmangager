import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { applyThemePreference, readThemePreference, type ThemePreference } from '../theme';
import { navigation } from './navigation';
import './AppShell.css';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <button
          type="button"
          className="btn btn-ghost menu-button"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          <span className="visually-hidden">Menu</span>
        </button>
        <span className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          SmartFin
        </span>
        <ThemeSelect />
      </header>

      <nav id="primary-nav" className="shell-nav" data-open={menuOpen} aria-label="Primary">
        {navigation.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  {item.comingIn ? (
                    <span className="nav-item nav-item-unavailable" aria-disabled="true">
                      {item.label}
                      <span className="nav-soon">
                        Soon
                        <span className="visually-hidden">
                          , not yet available (arrives in {item.comingIn})
                        </span>
                      </span>
                    </span>
                  ) : (
                    <NavLink
                      to={item.to}
                      end
                      className="nav-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {menuOpen ? (
        <div className="nav-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      ) : null}

      <main id="main" className="shell-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

function ThemeSelect() {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  return (
    <label className="theme-select">
      <span className="visually-hidden">Theme</span>
      <select
        className="select"
        value={theme}
        onChange={(e) => {
          const next = e.target.value as ThemePreference;
          setTheme(next);
          applyThemePreference(next);
        }}
      >
        <option value="system">System theme</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
