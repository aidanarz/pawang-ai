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
          className="max-w-[min(22rem,calc(100vw-4.5rem))] rounded-md border border-[#22396F] bg-[#FFEBCC]/95 px-2.5 py-1.5 text-[10px] leading-tight text-[#010736] shadow-lg backdrop-blur-md dark:border-[#22396F] dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0] text-justify transition-colors"
        >
          Sources: BMKG, Google Flood Hub, Satu Data Indonesia, © OpenStreetMap
          contributors
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[#22396F] bg-[#FFEBCC]/95 text-[#010736] shadow-md backdrop-blur-md transition-colors hover:bg-[#FFF9D2] dark:border-[#22396F] dark:bg-[#0D1C42]/95 dark:text-[#FCF1D0] dark:hover:bg-[#22396F]"
        aria-label={isExpanded ? 'Hide map sources' : 'Show map sources'}
        aria-expanded={isExpanded}
        title={isExpanded ? 'Hide map sources' : 'Show map sources'}
      >
        <Info size={14} />
      </button>
    </div>
  );
};
