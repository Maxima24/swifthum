import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Dashboard } from './routes/Dashboard';
import { RuleBuilder } from './routes/RuleBuilder';
import { RuleDetail } from './routes/RuleDetail';
import { Settings } from './routes/Settings';
import { Pay } from './routes/Pay';
import { Send } from './routes/Send';
import { SendToUser } from './routes/SendToUser';
import { Receive } from './routes/Receive';
import { GiftCreate } from './routes/GiftCreate';
import { GiftList } from './routes/GiftList';
import { Receipts } from './routes/Receipts';
import { ReceiptView } from './routes/ReceiptView';
import { EscrowCreate } from './routes/EscrowCreate';
import { EscrowList } from './routes/EscrowList';
import { EscrowDetail } from './routes/EscrowDetail';
import { Markets } from './routes/Markets';
import { MarketsTransactions } from './routes/MarketsTransactions';
import { Landing } from './routes/Landing';
import { isInsideTelegram } from './lib/tg';
import { useMocks } from './lib/api';
import { TabBar } from './components/TabBar';
import { Sidebar } from './components/Sidebar';
import { Shell } from './components/Shell';
import { MobileBrandBar } from './components/MobileBrandBar';
import { AuthGate } from './components/AuthGate';

export function App() {
  const { pathname, search } = useLocation();

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

  // Browser visitors (no Telegram session) get the marketing landing page with a
  // CTA into the bot. Dev/mock mode still loads the app; `?landing=1` previews the
  // landing, `?landing=0` forces the app.
  const landingParam = new URLSearchParams(search).get('landing');
  if (landingParam === '1' || (landingParam !== '0' && !isInsideTelegram() && !useMocks)) {
    return <Landing />;
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
          <Route path="/pay/send-to-user" element={<SendToUser />} />
          <Route path="/pay/receive" element={<Receive />} />
          <Route path="/pay/gifts" element={<GiftCreate />} />
          <Route path="/pay/gifts/my" element={<GiftList />} />
          <Route path="/pay/receipts" element={<Receipts />} />
          <Route path="/pay/escrow" element={<EscrowList />} />
          <Route path="/pay/escrow/new" element={<EscrowCreate />} />
          <Route path="/pay/escrow/:id" element={<EscrowDetail />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/transactions" element={<MarketsTransactions />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/rules" replace />} />
        </Routes>
      </Shell>
      <TabBar />
    </AuthGate>
  );
}
