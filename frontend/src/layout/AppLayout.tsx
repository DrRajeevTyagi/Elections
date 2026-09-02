import type { PropsWithChildren } from 'react';
import './AppLayout.css';

export const AppLayout = ({ children }: PropsWithChildren): JSX.Element => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-title">Student Council Elections</span>
          <span className="brand-subtitle">Voting Console</span>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
};
