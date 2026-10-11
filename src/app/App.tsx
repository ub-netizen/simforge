import { HashRouter, Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TrussWorkspace } from '../modules/structural/components/TrussWorkspace';

/**
 * Hash routing (/simforge/#/structural/truss) is used because GitHub Pages
 * serves static files only: a refresh on a history-API path such as
 * /simforge/structural/truss would return GitHub's 404 page. With hash
 * routing the server always receives /simforge/, so direct links and
 * refreshes work without redirect hacks.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/structural/truss" element={<TrussWorkspace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
