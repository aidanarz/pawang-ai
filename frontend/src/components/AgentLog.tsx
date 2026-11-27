'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, LogOut, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AgentDecision, AgentLogResponse } from '@/data/agent';
import { WARNING_LEVELS, changeKindLabel, formatWib, sortWarnings } from '@/utils/warningStyle';

const TOKEN_KEY = 'pawang-admin-token';
const card = 'rounded-2xl border border-[#DADCE0] bg-white p-4 dark:border-[#3C4043] dark:bg-[#202124]';
const muted = 'text-[#5F6368] dark:text-[#9AA0A6]';
const chip = 'rounded-full px-2 py-0.5 text-[10px] font-bold';
const pre =
  'max-h-56 overflow-auto rounded-xl bg-[#F8F9FA] p-2 font-mono text-[10.5px] leading-snug dark:bg-[#292A2D]';

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

type Failure = { kind: 'auth' | 'disabled' | 'down' | 'other'; message: string };

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className={card}>
    <div className={`text-[11px] font-medium ${muted}`}>{label}</div>
    <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    {hint && <div className={`mt-0.5 text-[10.5px] ${muted}`}>{hint}</div>}
  </div>
);

const Json: React.FC<{ value: unknown }> = ({ value }) => (
  <pre className={pre}>{JSON.stringify(value, null, 2)}</pre>
);

const DecisionRow: React.FC<{ d: AgentDecision }> = ({ d }) => (
  <details className="group rounded-2xl border border-[#DADCE0] bg-white dark:border-[#3C4043] dark:bg-[#202124]">
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-xs">
      <span className="font-semibold tabular-nums">{formatWib(d.at)}</span>
      <span className={muted}>hari prakiraan {d.target_date}</span>
      <span
        className={chip}
        style={{ color: d.triggered ? '#B06000' : '#188038', backgroundColor: d.triggered ? '#F9AB0022' : '#34A85322' }}
      >
        {d.triggered ? 'Terpicu' : 'Tanpa perubahan'}
      </span>
      {d.triggered && (
        <span className={`${chip} bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]`}>
          diputuskan {d.decided_by === 'qwen' ? 'Qwen' : 'aturan'}
        </span>
      )}
      <span className={`ml-auto tabular-nums ${muted}`}>
        {d.changes.length} perubahan · {d.published.length} terbit · {d.suppressed.length} ditahan ·{' '}
        {d.cleared?.length ?? 0} dicabut
      </span>
    </summary>

    <div className="space-y-3 border-t border-[#DADCE0] px-4 py-3 text-xs dark:border-[#3C4043]">
      {d.note && <p className="rounded-xl bg-[#FEF7E0] p-2 text-[#B06000] dark:bg-[#F9AB00]/15 dark:text-[#FDD663]">{d.note}</p>}

      <section>
        <h4 className="mb-1 font-semibold">Perubahan yang terdeteksi aturan ({d.changes.length})</h4>
        {d.changes.length === 0 ? (
          <p className={muted}>Tidak ada. LLM tidak dipanggil.</p>
        ) : (
          <ul className="space-y-1">
            {d.changes.map((c) => (
              <li key={c.grid_id} className="rounded-xl bg-[#F8F9FA] px-3 py-1.5 dark:bg-[#292A2D]">
                <b>{c.area}</b>: {c.kinds.map(changeKindLabel).join(', ')}
                <span className={muted}>
                  {' '}
                  (tier {c.prev_tier ?? 'belum ada'} → {c.tier})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.steps.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold">Langkah agen ({d.steps.length})</h4>
          <ol className="space-y-1.5">
            {d.steps.map((s, i) => (
              <li key={i} className="rounded-xl border border-[#DADCE0] px-3 py-1.5 dark:border-[#3C4043]">
                <div className="flex flex-wrap items-center gap-x-2">
                  <b>{s.step === 'tool' ? `Tool ${s.tool}` : s.step === 'llm' ? `LLM ${s.action ?? ''}` : s.step}</b>
                  {s.grid_id && <span className={muted}>{s.grid_id}</span>}
                  {typeof s.elapsed_ms === 'number' && <span className={`ml-auto tabular-nums ${muted}`}>{s.elapsed_ms} ms</span>}
                </div>
                {(s.error || s.message) && (
                  <p className="mt-0.5 text-[#C5221F] dark:text-[#F28B82]">{s.error ?? s.message}</p>
                )}
                {s.result !== undefined && <Json value={s.result} />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {d.proposal != null && (
        <section>
          <h4 className="mb-1 font-semibold">Usulan LLM</h4>
          <Json value={d.proposal} />
        </section>
      )}

      {d.guardrail_errors.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold text-[#C5221F] dark:text-[#F28B82]">Pagar menolak usulan ({d.guardrail_errors.length})</h4>
          <ul className="list-disc space-y-0.5 pl-5">
            {d.guardrail_errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className={`mt-1 ${muted}`}>Karena itu tindakan bawaan aturan yang dijalankan.</p>
        </section>
      )}

      {d.published.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold">Peringatan diterbitkan ({d.published.length})</h4>
          <ul className="space-y-1">
            {d.published.map((w) => (
              <li key={w.id} className="rounded-xl bg-[#F8F9FA] px-3 py-1.5 dark:bg-[#292A2D]">
                <b style={{ color: WARNING_LEVELS[w.level]?.color }}>{WARNING_LEVELS[w.level]?.label ?? w.level}</b> · {w.area} ·{' '}
                <span className={muted}>{w.decided_by === 'qwen' ? 'ditulis Qwen' : 'teks aturan'}</span>
                <p className="mt-0.5">{w.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.suppressed.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold">Peringatan ditahan ({d.suppressed.length})</h4>
          <ul className="space-y-1">
            {d.suppressed.map((w, i) => (
              <li key={i} className="rounded-xl bg-[#F8F9FA] px-3 py-1.5 dark:bg-[#292A2D]">
                {w.grid_id} ({w.level}): <span className={muted}>{w.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(d.cleared?.length ?? 0) > 0 && (
        <section>
          <h4 className="mb-1 font-semibold">Peringatan dicabut</h4>
          <p>{d.cleared!.join(', ')}</p>
        </section>
      )}

      <p className={`font-mono text-[10px] ${muted}`}>
        siklus {d.cycle_id} · prompt {d.prompt_version}
      </p>
    </div>
  </details>
);

/** Admin page: everything the Flood Watch Agent did. The token is kept for this browser tab only. */
export const AgentLog: React.FC = () => {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [data, setData] = useState<AgentLogResponse | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [onlyTriggered, setOnlyTriggered] = useState(false);
  const [runDate, setRunDate] = useState('');
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Same saved theme as the map.
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('pawang-theme') !== 'light');
    } catch {
      // default (dark)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(readToken());
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken('');
    setData(null);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/agent', { headers: { 'x-admin-token': token } });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.decisions) {
        setData(body as AgentLogResponse);
        setFailure(null);
      } else if (res.status === 401 || res.status === 429) {
        setFailure({ kind: 'auth', message: typeof body?.detail === 'string' ? body.detail : 'Token admin salah.' });
        if (res.status === 401) logout();
      } else if (res.status === 404) {
        setFailure({ kind: 'disabled', message: 'Halaman admin dinonaktifkan di server (PAWANG_ADMIN_TOKEN belum diatur).' });
      } else if (res.status === 503) {
        setFailure({ kind: 'down', message: 'Backend tidak tersedia.' });
      } else {
        setFailure({ kind: 'other', message: 'Log agen tidak bisa dimuat.' });
      }
    } catch {
      setFailure({ kind: 'down', message: 'Log agen tidak bisa dimuat.' });
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!token || !auto) return;
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load, token, auto]);

  const runCycle = async () => {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch('/api/v1/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(runDate ? { date: runDate } : {}),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.cycle_id) {
        setRunMsg(`Siklus selesai: ${body.changes?.length ?? 0} perubahan, ${body.published?.length ?? 0} peringatan terbit.`);
        await load();
      } else {
        setRunMsg(typeof body?.detail === 'string' ? body.detail : 'Siklus tidak bisa dijalankan.');
      }
    } catch {
      setRunMsg('Siklus tidak bisa dijalankan.');
    } finally {
      setRunning(false);
    }
  };

  const shown = (data?.decisions ?? []).filter((d) => !onlyTriggered || d.triggered);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#F8F9FA] text-[#202124] dark:bg-[#171717] dark:text-[#E8EAED]">
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#E8F0FE] text-[#1A73E8] dark:bg-[#1A73E8]/20 dark:text-[#8AB4F8]">
              <Activity size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Log Flood Watch Agent</h1>
              <p className={`text-xs ${muted}`}>Semua aktivitas agen pemantau banjir. Halaman admin.</p>
            </div>
          </div>
          {token && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Muat otomatis (15 dtk)
              </label>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DADCE0] px-3 py-1.5 font-semibold hover:bg-white disabled:opacity-60 dark:border-[#3C4043] dark:hover:bg-[#292A2D]"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Muat ulang
              </button>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DADCE0] px-3 py-1.5 font-semibold hover:bg-white dark:border-[#3C4043] dark:hover:bg-[#292A2D]"
              >
                <LogOut size={12} /> Keluar
              </button>
            </div>
          )}
        </header>

        {!token && (
          <form
            className={`${card} mx-auto max-w-sm space-y-3`}
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              try {
                sessionStorage.setItem(TOKEN_KEY, draft.trim());
              } catch {
                // the token then lives in memory only
              }
              setToken(draft.trim());
              setDraft('');
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={16} className="text-[#1A73E8] dark:text-[#8AB4F8]" /> Masuk admin
            </div>
            <input
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Token admin"
              aria-label="Token admin"
              className="w-full rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2 text-sm dark:border-[#3C4043] dark:bg-[#292A2D]"
            />
            <button type="submit" className="w-full rounded-full bg-[#1A73E8] py-2 text-sm font-semibold text-white hover:bg-[#1765CC]">
              Masuk
            </button>
            <p className={`text-[11px] ${muted}`}>Token diatur di server lewat PAWANG_ADMIN_TOKEN. Disimpan hanya selama tab ini terbuka.</p>
          </form>
        )}

        {failure && (
          <div className="rounded-2xl bg-[#FCE8E6] p-3 text-xs text-[#C5221F] dark:bg-[#F28B82]/15 dark:text-[#F28B82]">{failure.message}</div>
        )}

        {token && data && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Mode data" value={data.data_mode === 'live' ? 'Live' : 'Replay'} />
              <Stat
                label="Penjadwal"
                value={data.agent.scheduler_running ? 'Aktif' : 'Mati'}
                hint={data.agent.interval_s > 0 ? `tiap ${data.agent.interval_s} dtk` : 'interval 0 (hanya manual)'}
              />
              <Stat label="LLM" value={data.agent.llm_enabled ? 'Aktif' : 'Mati'} hint={data.agent.llm_model ?? 'aturan saja'} />
              <Stat label="Area dipantau" value={data.totals.areas_tracked} hint={`jeda ${data.agent.cooldown_h} jam, maks. ${data.agent.max_steps} tool`} />
              <Stat label="Siklus tercatat" value={data.totals.cycles} />
              <Stat label="Terpicu" value={data.totals.triggered} hint={`${data.totals.decided_by_qwen} diputuskan Qwen`} />
              <Stat label="Ditolak pagar" value={data.totals.guardrail_rejected} />
              <Stat label="Peringatan terbit" value={data.totals.warnings_published} />
            </section>

            <section className={card}>
              <h2 className="mb-2 text-sm font-semibold">Peringatan aktif ({data.active.length})</h2>
              {data.active.length === 0 ? (
                <p className={`text-xs ${muted}`}>Tidak ada peringatan aktif.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={muted}>
                      <tr>
                        <th className="py-1 pr-3">Kecamatan</th>
                        <th className="py-1 pr-3">Level</th>
                        <th className="py-1 pr-3">Sejak</th>
                        <th className="py-1">Pesan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortWarnings(data.active).map((w) => (
                        <tr key={w.grid_id} className="border-t border-[#DADCE0] align-top dark:border-[#3C4043]">
                          <td className="py-1.5 pr-3 font-semibold">{w.area}</td>
                          <td className="py-1.5 pr-3 font-bold" style={{ color: WARNING_LEVELS[w.level]?.color }}>
                            {WARNING_LEVELS[w.level]?.label ?? w.level}
                          </td>
                          <td className="py-1.5 pr-3 tabular-nums">{formatWib(w.since)}</td>
                          <td className="py-1.5">{w.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={`${card} flex flex-wrap items-end gap-3 text-xs`}>
              <div>
                <label htmlFor="run-date" className={`block text-[11px] font-medium ${muted}`}>
                  Jalankan siklus sekarang (tanggal prakiraan, wajib di mode replay)
                </label>
                <input
                  id="run-date"
                  type="date"
                  value={runDate}
                  onChange={(e) => setRunDate(e.target.value)}
                  className="mt-1 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 dark:border-[#3C4043] dark:bg-[#292A2D]"
                />
              </div>
              <button
                type="button"
                onClick={runCycle}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1A73E8] px-4 py-2 font-semibold text-white hover:bg-[#1765CC] disabled:opacity-60"
              >
                <Play size={12} /> {running ? 'Menjalankan...' : 'Jalankan siklus'}
              </button>
              {runMsg && <span className={muted}>{runMsg}</span>}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Riwayat siklus ({shown.length})</h2>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={onlyTriggered} onChange={(e) => setOnlyTriggered(e.target.checked)} /> Hanya yang terpicu
                </label>
              </div>
              {shown.length === 0 ? (
                <p className={`text-xs ${muted}`}>Belum ada siklus. Agen mencatat tiap siklus di sini, juga yang tanpa perubahan.</p>
              ) : (
                shown.map((d) => <DecisionRow key={d.cycle_id} d={d} />)
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};
