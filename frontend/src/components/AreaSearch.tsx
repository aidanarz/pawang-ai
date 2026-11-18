'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, MapPin, Search } from 'lucide-react';

interface AreaOption {
  grid_id: string;
  name: string;
}

/** Search box and dropdown in one: type to filter the kecamatan, pick one to open the map on it. */
export const AreaSearch: React.FC = () => {
  const router = useRouter();
  const [areas, setAreas] = useState<AreaOption[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/v1/areas')
      .then((r) => (r.ok ? r.json() : { areas: [] }))
      .catch(() => ({ areas: [] }))
      .then((j: { areas: AreaOption[] }) => mounted && setAreas(j.areas ?? []));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (areas ?? []).filter((a) => a.name.toLowerCase().includes(q));
  }, [areas, query]);

  const go = (a: AreaOption) => router.push(`/map?area=${encodeURIComponent(a.grid_id)}`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault();
      go(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative w-full">
      <div className="flex items-center gap-2 rounded-xl border border-[#22396F] bg-white/90 px-3 py-2.5 shadow-md dark:bg-[#0D1C42]">
        <Search size={16} className="shrink-0 text-[#22396F] dark:text-[#BFDDF0]" aria-hidden />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="area-listbox"
          aria-label="Cari kecamatan"
          className="w-full bg-transparent text-sm text-[#010736] outline-none placeholder:text-[#22396F]/60 dark:text-[#FCF1D0] dark:placeholder:text-[#BFDDF0]/60"
          placeholder="Cari kecamatan, mis. Menteng"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          aria-label="Tampilkan daftar kecamatan"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded p-1 text-[#22396F] hover:bg-black/10 dark:text-[#BFDDF0]"
        >
          <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      {open && (
        <ul
          id="area-listbox"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#22396F] bg-[#FFEBCC] py-1 shadow-xl dark:bg-[#0D1C42]"
        >
          {areas === null && <li className="px-3 py-2 text-xs text-[#22396F] dark:text-[#BFDDF0]">Memuat daftar...</li>}
          {areas !== null && matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-[#22396F] dark:text-[#BFDDF0]">
              {areas.length === 0 ? 'Daftar kecamatan tidak tersedia.' : 'Kecamatan tidak ditemukan.'}
            </li>
          )}
          {matches.map((a, i) => (
            <li
              key={a.grid_id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(a)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[#010736] dark:text-[#FCF1D0] ${
                i === active ? 'bg-[#8CC0EB]/40 dark:bg-[#22396F]' : ''
              }`}
            >
              <MapPin size={13} className="shrink-0 opacity-60" aria-hidden />
              {a.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
