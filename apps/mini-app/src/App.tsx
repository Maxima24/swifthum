import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Dashboard } from './routes/Dashboard';
import { RuleBuilder } from './routes/RuleBuilder';
import { RuleDetail } from './routes/RuleDetail';
import { Settings } from './routes/Settings';
import { Pay } from './routes/Pay';
import { Send } from './routes/Send';
import { Receive } from './routes/Receive';
import { GiftCreate } from './routes/GiftCreate';
import { GiftList } from './routes/GiftList';
import { Receipts } from './routes/Receipts';
import { ReceiptView } from './routes/ReceiptView';
import { TabBar } from './components/TabBar';
import { Sidebar } from './components/Sidebar';
import { Shell } from './components/Shell';
import { MobileBrandBar } from './components/MobileBrandBar';
import { AuthGate } from './components/AuthGate';

export function App() {
  const { pathname } = useLocation();

  // Public, unauthenticated receipt links (`/r/:id?token=…`) render OUTSIDE the
  // AuthGate so a shared receipt opens for anyone in any browser — no Telegram
  // session, no Shell/TabBar.
  if (pathname.startsWith('/r/')) {
    return (
      <Routes>
        <Route path="/r/:receiptId" element={<ReceiptView />} />
        <Route path="*" element={<Navigate to="/rules" replace />} />
      </Routes>
    );
  }

  return (
    <AuthGate>
      <Sidebar />
      <MobileBrandBar />
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/rules" replace />} />
          <Route path="/rules" element={<Dashboard />} />
          <Route path="/rules/new" element={<RuleBuilder />} />
          <Route path="/rules/:id" element={<RuleDetail />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/pay/send" element={<Send />} />
          <Route path="/pay/receive" element={<Receive />} />
          <Route path="/pay/gifts" element={<GiftCreate />} />
          <Route path="/pay/gifts/my" element={<GiftList />} />
          <Route path="/pay/receipts" element={<Receipts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/rules" replace />} />
        </Routes>
      </Shell>
      <TabBar />
    </AuthGate>
  );
}
