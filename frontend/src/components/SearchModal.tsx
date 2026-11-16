'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, X, ArrowRight, Sparkles } from 'lucide-react';
import type { GeoJSONGridFeature } from '@/data/types';
import { getColorForRainfall, getRiskBadgeClasses } from '@/utils/colorScale';

interface SearchModalProps {
  /** Areas currently on the map. */
  features: GeoJSONGridFeature[];
  isOpen: boolean;
  onClose: () => void;
  onSelectRegion: (gridId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  features,
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

  const topAreas = [...features]
    .filter((f) => Number.isFinite(f.properties.flood_probability))
    .sort((a, b) => b.properties.flood_probability - a.properties.flood_probability)
    .slice(0, 5)
    .map((f) => f.properties.area_name);

  const filtered = features.filter((zone) => {
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl border border-[#22396F] bg-[#FFEBCC] dark:border-[#22396F] dark:bg-[#0D1C42] overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="relative flex items-center p-3.5 border-b border-[#22396F] dark:border-[#22396F]">
          <Search size={18} className="text-[#8CC0EB] dark:text-[#FCF1D0] mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Cari kecamatan (cth: Menteng, Kebayoran Lama, Cakung)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-[#010736] dark:text-[#FCF1D0] placeholder-[#22396F]/60 dark:placeholder-[#BFDDF0]/50 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-[#22396F] hover:text-[#010736] dark:text-[#BFDDF0] dark:hover:text-[#FCF1D0] mr-2"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-[#22396F] hover:text-[#010736] dark:text-[#BFDDF0] dark:hover:text-[#FCF1D0] hover:bg-[#8CC0EB]/20 text-xs font-mono"
          >
            ESC
          </button>
        </div>

        {/* Quick Tag Recommendations */}
        <div className="px-3.5 py-2 bg-[#FFF9D2]/70 dark:bg-[#010736]/70 border-b border-[#22396F] dark:border-[#22396F] flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <span className="text-[#22396F] dark:text-[#BFDDF0] font-semibold shrink-0 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-500" />
            Risiko tertinggi:
          </span>
          {topAreas.map(
            (tag) => (
              <button
                key={tag}
                onClick={() => setQuery(tag)}
                className="px-2 py-0.5 rounded-md bg-[#FFEBCC] dark:bg-[#22396F] text-[#010736] dark:text-[#FCF1D0] hover:bg-[#8CC0EB]/40 border border-[#22396F] dark:border-[#22396F] whitespace-nowrap transition-colors font-medium"
              >
                {tag}
              </button>
            )
          )}
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[#BFDDF0]/60 dark:divide-[#22396F]/60">
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
                  className="p-2.5 rounded-xl hover:bg-[#BFDDF0]/50 dark:hover:bg-[#22396F]/40 cursor-pointer flex items-center justify-between group transition-all"
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
                      <div className="text-xs font-bold text-[#010736] dark:text-[#FCF1D0] group-hover:text-[#8CC0EB] dark:group-hover:text-[#FCF1D0] transition-colors">
                        {p.area_name}
                      </div>
                      <div className="text-[10.5px] text-[#22396F] dark:text-[#BFDDF0]">
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
                      className="text-[#22396F] dark:text-[#BFDDF0] group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-[#22396F] dark:text-[#BFDDF0] text-xs text-justify">
              Tidak ada daerah yang cocok dengan kata kunci &quot;{query}&quot;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
