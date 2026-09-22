import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { KioskProvider } from './context/KioskContext';
import { ActivationPage } from './pages/ActivationPage';
import { AdminLandingPage } from './pages/AdminLandingPage';
import { ClosePollingPage } from './pages/ClosePollingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportPage } from './pages/ReportPage';
import { TurnoutReportPage } from './pages/TurnoutReportPage';
import { VotePage } from './pages/VotePage';
import { WelcomePage } from './pages/WelcomePage';

const App = (): JSX.Element => {
  return (
    <KioskProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/kiosk" replace />} />
          <Route path="/kiosk" element={<WelcomePage />} />
          <Route path="/kiosk/activate" element={<ActivationPage />} />
          <Route path="/kiosk/close-booth" element={<ClosePollingPage />} />
          <Route path="/kiosk/vote" element={<VotePage />} />
          <Route path="/admin" element={<AdminLandingPage />} />
          <Route path="/admin/report" element={<ReportPage />} />
          <Route path="/admin/report/turnout" element={<TurnoutReportPage />} />
          <Route path="/admin/report/:archiveId" element={<ReportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppLayout>
    </KioskProvider>
  );
};

export default App;
