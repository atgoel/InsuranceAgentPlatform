import { useEffect, useRef } from 'react';
import './Tabs.css';

export interface TabDef {
  id: string;
  label: string;
  badge?: number;
}

export interface TabsProps {
  tabs: TabDef[];
  value: string;
  onChange(id: string): void;
  variant?: 'segmented' | 'underline';
}

export function Tabs({ tabs, value, onChange, variant = 'underline' }: TabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = tabsRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tabElements = Array.from(container.querySelectorAll('[role="tab"]') || []);
      const currentIndex = tabElements.findIndex(el => el.getAttribute('aria-selected') === 'true');

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        onChange(nextTab.id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        const prevTab = tabs[prevIndex];
        onChange(prevTab.id);
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [tabs, onChange]);

  return (
    <div className={`tabs tabs-${variant}`} ref={tabsRef} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className="tab"
        >
          {tab.label}
          {tab.badge !== undefined && <span className="tab-badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}
