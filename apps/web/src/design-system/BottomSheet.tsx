import { useEffect, useRef, ReactNode } from 'react';
import './BottomSheet.css';

export interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    sheetRef.current?.focus();

    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div
        className="bottom-sheet"
        onClick={e => e.stopPropagation()}
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
      >
        <div className="bottom-sheet-header">
          <h2 id="sheet-title" className="bottom-sheet-title">{title}</h2>
          <button className="bottom-sheet-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="bottom-sheet-content">{children}</div>
      </div>
    </div>
  );
}
