'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';

export const Attribution: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
      {isExpanded && (
        <div
          role="status"
          className="max-w-[min(22rem,calc(100vw-4.5rem))] rounded-md border border-slate-200/70 bg-white/90 px-2.5 py-1.5 text-[10px] leading-tight text-slate-600 shadow-lg backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/90 dark:text-slate-300"
        >
          Sources: BMKG, Google Flood Hub, Satu Data Indonesia, © OpenStreetMap
          contributors
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-md backdrop-blur-md transition-colors hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label={isExpanded ? 'Hide map sources' : 'Show map sources'}
        aria-expanded={isExpanded}
        title={isExpanded ? 'Hide map sources' : 'Show map sources'}
      >
        <Info size={14} />
      </button>
    </div>
  );
};
