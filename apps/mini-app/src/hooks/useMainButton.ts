import { useEffect } from 'react';
import { mainButton } from '@telegram-apps/sdk-react';

interface Params {
  text: string;
  isEnabled?: boolean;
  isVisible?: boolean;
  onClick: () => void;
}

export function useMainButton({ text, isEnabled = true, isVisible = true, onClick }: Params) {
  useEffect(() => {
    try {
      mainButton.setParams({ text, isEnabled, isVisible });
    } catch {
      /* not in telegram */
    }
    return () => {
      try {
        mainButton.setParams({ isVisible: false });
      } catch {
        /* */
      }
    };
  }, [text, isEnabled, isVisible]);

  useEffect(() => {
    try {
      const off = mainButton.onClick(onClick);
      return off;
    } catch {
      return undefined;
    }
  }, [onClick]);
}
