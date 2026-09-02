import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { KioskProvider } from './context/KioskContext';
import { ActivationPage } from './pages/ActivationPage';
import { AdminLandingPage } from './pages/AdminLandingPage';
import { HouseSelectionPage } from './pages/HouseSelectionPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { VotePage } from './pages/VotePage';
import { WelcomePage } from './pages/WelcomePage';

const App = (): JSX.Element => {
  return (
    <KioskProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/kiosk" replace />} />
          <Route path="/kiosk" element={<WelcomePage />} />
          <Route path="/kiosk/select-house" element={<HouseSelectionPage />} />
          <Route path="/kiosk/activate" element={<ActivationPage />} />
          <Route path="/kiosk/vote" element={<VotePage />} />
          <Route path="/admin" element={<AdminLandingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppLayout>
    </KioskProvider>
  );
};

export default App;
