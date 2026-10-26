'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, X, ArrowRight, Sparkles } from 'lucide-react';
import { BASE_FLOOD_ZONES } from '@/data/floodData';
import { getColorForRainfall, getRiskBadgeClasses } from '@/utils/colorScale';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRegion: (gridId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectRegion,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = React.useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        handleClose();
      }
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const filtered = BASE_FLOOD_ZONES.filter((zone) => {
    const q = query.toLowerCase();
    const p = zone.properties;
    return (
      p.area_name.toLowerCase().includes(q) ||
      p.district.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      p.grid_id.toLowerCase().includes(q) ||
      p.risk_level.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="glass-panel w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="relative flex items-center p-3.5 border-b border-slate-200/60 dark:border-slate-800">
          <Search size={18} className="text-blue-500 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Periksa daerah banjir Jabodetabek (cth: Kemang, Rawajati, Manggarai, Katulampa)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-2"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 text-xs"
          >
            ESC
          </button>
        </div>

        {/* Quick Tag Recommendations */}
        <div className="px-3.5 py-2 bg-slate-900/5 dark:bg-slate-900/30 border-b border-slate-200/40 dark:border-slate-800/40 flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-500" />
            Populer:
          </span>
          {['Kemang', 'Kampung Melayu', 'Manggarai', 'Rawajati', 'Pluit', 'Katulampa'].map(
            (tag) => (
              <button
                key={tag}
                onClick={() => setQuery(tag)}
                className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors"
              >
                {tag}
              </button>
            )
          )}
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/50">
          {filtered.length > 0 ? (
            filtered.map((zone) => {
              const p = zone.properties;
              const badge = getRiskBadgeClasses(p.risk_level);
              return (
                <div
                  key={p.grid_id}
                  onClick={() => {
                    onSelectRegion(p.grid_id);
                    onClose();
                  }}
                  className="p-2.5 rounded-xl hover:bg-blue-500/10 cursor-pointer flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-xs"
                      style={{
                        backgroundColor: getColorForRainfall(p.rainfall_mm) + '25',
                        color: getColorForRainfall(p.rainfall_mm),
                      }}
                    >
                      <MapPin size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {p.area_name}
                      </div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        {p.district}, {p.city} • TMA {p.water_level_cm}cm ({p.siaga_level})
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {badge.label}
                    </span>
                    <ArrowRight
                      size={14}
                      className="text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              Tidak ada daerah yang cocok dengan kata kunci &quot;{query}&quot;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
