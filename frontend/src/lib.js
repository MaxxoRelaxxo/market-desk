import { useEffect, useState } from "react";

export const COLORS = ["#FFA028", "#4C9AFF", "#3FB950", "#B794F4", "#F472B6", "#4FD1A5", "#F85149", "#E3B341", "#8A939E", "#56D4DD", "#FF7B72", "#A5D6FF", "#D2A8FF"];
export const UP = "#3FB950";
export const DOWN = "#F85149";

export const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? "–" : v.toFixed(d));
export const signed = (v, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);

export const axis = { tick: { fontSize: 10, fill: "var(--muted)" }, tickLine: false, axisLine: false };

/** Every n-th date as x-ticks, always including the last one. */
export const ticks = (rows, n = 8) => {
  if (!rows?.length) return [];
  const step = Math.max(1, Math.floor(rows.length / n));
  const out = rows.filter((_, i) => i % step === 0).map((r) => r.date);
  const last = rows[rows.length - 1].date;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
};

const cache = {};

/** Fetch ./data/<file> once per session. */
export function useData(file) {
  const [state, setState] = useState(cache[file] ? { data: cache[file] } : {});
  useEffect(() => {
    if (cache[file]) return;
    fetch(`./data/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setState({ data: (cache[file] = d) }))
      .catch((error) => setState({ error }));
  }, [file]);
  return state;
}

const YEAR = 365.25 * 864e5;

/** Props for a real time x-axis (rows need `t` = ms). Even year/month ticks, data-bounded domain. */
export function timeAxis(rows, n = 8) {
  if (!rows?.length) return {};
  const t0 = rows[0].t;
  const t1 = rows[rows.length - 1].t;
  const years = (t1 - t0) / YEAR;
  const ticks = [];
  if (years >= 2) {
    const step = [1, 2, 5, 10].find((s) => years / s <= n) ?? 10;
    const y0 = new Date(t0).getUTCFullYear();
    for (let y = Math.ceil(y0 / step) * step; ; y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t > t1) break;
      if (t >= t0) ticks.push(t);
    }
  } else {
    const step = [1, 2, 3, 6].find((s) => (years * 12) / s <= n) ?? 6;
    const d = new Date(t0);
    for (let m = Math.ceil((d.getUTCMonth() + 1) / step) * step; ; m += step) {
      const t = Date.UTC(d.getUTCFullYear(), m, 1);
      if (t > t1) break;
      ticks.push(t);
    }
  }
  const fmtT = (t) => new Date(t).toISOString().slice(0, years >= 2 ? 4 : 7);
  return {
    dataKey: "t", type: "number", scale: "time", domain: [t0, t1], ticks, tickFormatter: fmtT,
    tick: { fontSize: 10, fill: "var(--muted)" }, tickLine: false, axisLine: false,
  };
}

export const withT = (rows) => rows.map((r) => ({ ...r, t: Date.parse(r.date) }));
export const dateLabel = (t) => new Date(t).toISOString().slice(0, 10);
