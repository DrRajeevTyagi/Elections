import { NavLink } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import './AppLayout.css';

const links = [
  { to: '/kiosk', label: 'Kiosk' },
  { to: '/admin', label: 'Admin' }
];

export const AppLayout = ({ children }: PropsWithChildren): JSX.Element => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-title">Student Council Elections</span>
          <span className="brand-subtitle">Voting Console</span>
        </div>
        <nav className="app-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link-active' : 'nav-link'
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
};
