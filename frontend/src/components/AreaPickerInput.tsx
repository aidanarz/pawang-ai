'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONGridFeature } from '@/data/types';

interface AreaPickerInputProps {
  id: string;
  features: GeoJSONGridFeature[];
  /** Name shown while the box is not being edited. */
  valueLabel: string | null;
  placeholder: string;
  icon?: React.ReactNode;
  onChoose: (gridId: string) => void;
}

/** A search box with a list of the kecamatan on the map: type to filter, pick one. Dark mode stays dark when focused. */
export const AreaPickerInput: React.FC<AreaPickerInputProps> = ({ id, features, valueLabel, placeholder, icon, onChoose }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features
      .filter((f) => f.properties.area_name.toLowerCase().includes(q))
      .sort((a, b) => a.properties.area_name.localeCompare(b.properties.area_name));
  }, [features, query]);

  const choose = (f: GeoJSONGridFeature) => {
    onChoose(f.properties.grid_id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <div className="relative flex items-center">
        {icon && <span className="pointer-events-none absolute left-3 flex">{icon}</span>}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          autoComplete="off"
          value={open ? query : (valueLabel ?? '')}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`w-full rounded-xl border border-[#DADCE0] bg-white py-2 pr-3 text-[13px] text-[#202124] placeholder:text-[#5F6368] focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30 dark:border-[#3C4043] dark:bg-[#202124] dark:text-[#E8EAED] dark:placeholder:text-[#9AA0A6] dark:focus:border-[#8AB4F8] dark:focus:ring-[#8AB4F8]/30 ${
            icon ? 'pl-9' : 'pl-3'
          }`}
        />
      </div>

      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#DADCE0] bg-white py-1 text-[13px] shadow-xl dark:border-[#3C4043] dark:bg-[#292A2D]"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-[#5F6368] dark:text-[#9AA0A6]">Daerah tidak ditemukan</li>
          )}
          {matches.map((f, i) => (
            <li
              key={f.properties.grid_id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(f)}
              className={`cursor-pointer px-3 py-1.5 text-[#202124] dark:text-[#E8EAED] ${
                i === active ? 'bg-[#E8F0FE] dark:bg-[#3C4043]' : ''
              }`}
            >
              {f.properties.area_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
