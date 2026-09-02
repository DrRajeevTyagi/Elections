import { Link } from 'react-router-dom';
import './Page.css';

export const NotFoundPage = (): JSX.Element => {
  return (
    <section className="page-card">
      <h1>Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <div className="page-actions">
        <Link className="button" to="/">
          Go Home
        </Link>
      </div>
    </section>
  );
};
