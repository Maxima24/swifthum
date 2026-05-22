import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Dashboard } from './routes/Dashboard';
import { RuleBuilder } from './routes/RuleBuilder';
import { RuleDetail } from './routes/RuleDetail';
import { Settings } from './routes/Settings';

export function App() {
  const location = useLocation();
  return (
    <div className="min-h-dvh bg-tg-bg text-tg-text">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rules/new" element={<RuleBuilder />} />
            <Route path="/rules/:id" element={<RuleDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
