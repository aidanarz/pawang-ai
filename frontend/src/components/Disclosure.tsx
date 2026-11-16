'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

/** A card that is closed until the user clicks its title. */
export const Disclosure: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#22396F] bg-[#FFF9D2]/50 text-[11px] dark:border-[#22396F] dark:bg-[#010736]/50 shadow-xs transition-colors">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-bold text-[#010736] dark:text-[#FCF1D0]"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <ChevronRight size={13} className={`transition-transform text-[#010736] dark:text-[#FCF1D0] ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && children}
    </div>
  );
};
