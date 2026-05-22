import { useEffect } from 'react';
import { backButton } from '@telegram-apps/sdk-react';

export function useBackButton(onBack: () => void) {
  useEffect(() => {
    try {
      backButton.show();
    } catch {
      /* not in telegram */
    }
    return () => {
      try {
        backButton.hide();
      } catch {
        /* */
      }
    };
  }, []);

  useEffect(() => {
    try {
      const off = backButton.onClick(onBack);
      return off;
    } catch {
      return undefined;
    }
  }, [onBack]);
}
