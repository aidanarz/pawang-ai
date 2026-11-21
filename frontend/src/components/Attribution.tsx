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
          className="max-w-[min(22rem,calc(100vw-4.5rem))] rounded-xl border border-[#DADCE0] bg-white/95 px-3 py-1.5 text-[10px] leading-relaxed text-[#5F6368] shadow-md backdrop-blur-md transition-colors dark:border-[#3C4043] dark:bg-[#202124]/95 dark:text-[#9AA0A6]"
        >
          Sources: BMKG, Google Flood Hub, Satu Data Indonesia, © OpenStreetMap
          contributors
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="grid h-8 w-8 place-items-center rounded-full border border-[#DADCE0] bg-white/95 text-[#5F6368] shadow-md backdrop-blur-md transition hover:bg-[#F8F9FA] hover:text-[#1A73E8] dark:border-[#5F6368] dark:bg-[#292A2D]/95 dark:text-[#9AA0A6] dark:hover:bg-[#3C4043] dark:hover:text-[#8AB4F8]"
        aria-label={isExpanded ? 'Hide map sources' : 'Show map sources'}
        aria-expanded={isExpanded}
        title={isExpanded ? 'Hide map sources' : 'Show map sources'}
      >
        <Info size={14} />
      </button>
    </div>
  );
};
