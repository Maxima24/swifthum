import { Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './routes/Dashboard';
import { RuleBuilder } from './routes/RuleBuilder';
import { RuleDetail } from './routes/RuleDetail';
import { Settings } from './routes/Settings';
import { Pay } from './routes/Pay';
import { Send } from './routes/Send';
import { Receive } from './routes/Receive';
import { TabBar } from './components/TabBar';
import { Sidebar } from './components/Sidebar';
import { Shell } from './components/Shell';
import { AuthGate } from './components/AuthGate';
import { Toaster } from './components/Toaster';

export function App() {
  return (
    <AuthGate>
      <Sidebar />
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/rules" replace />} />
          <Route path="/rules" element={<Dashboard />} />
          <Route path="/rules/new" element={<RuleBuilder />} />
          <Route path="/rules/:id" element={<RuleDetail />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/pay/send" element={<Send />} />
          <Route path="/pay/receive" element={<Receive />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/rules" replace />} />
        </Routes>
      </Shell>
      <TabBar />
      <Toaster />
    </AuthGate>
  );
}
