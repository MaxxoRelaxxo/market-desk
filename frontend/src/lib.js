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
