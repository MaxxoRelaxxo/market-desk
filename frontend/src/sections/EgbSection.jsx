import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, StatCard, Status, Tip } from "../components/ui";
import { COLORS, DOWN, UP, axis, fmt, signed, ticks, useData } from "../lib";

const FACTOR_LABEL = { debt: "Debt", fiscal: "Fiscal balance", ca: "Current account" };
const SIGNAL_COLOR = { CHEAP: UP, RICH: DOWN, FAIR: "#E8EDF2" };
const SIGNAL_CLS = { CHEAP: "up", RICH: "down", FAIR: "" };

function FairTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="tt">
      <div className="tt-label">{r.country} · {r.name}</div>
      <div className="tt-row"><span className="tt-name">Actual</span><span className="tt-val">{fmt(r.spread, 0)} bp</span></div>
      <div className="tt-row"><span className="tt-name">Fitted</span><span className="tt-val">{fmt(r.fair, 0)} bp</span></div>
      <div className="tt-row"><span className="tt-name">Residual</span><span className="tt-val">{signed(r.residual, 0)} bp</span></div>
      <div className="tt-row"><span className="tt-name">Signal</span><span className="tt-val">{r.signal}</span></div>
    </div>
  );
}

export default function EgbSection() {
  const state = useData("egb.json");
  const [country, setCountry] = useState("IT");

  const d = state.data;
  if (!d) return <Status state={state} what="EGB data" />;

  const series = d.series[country] ?? [];
  const bund = d.bund;
  const bundLast = bund[bund.length - 1];
  const bundPrev = bund[bund.length - 2];
  const snap = d.snapshot;
  const snapDate = snap[0]?.date;
  const base = snap[0]?.base;
  const ranked = snap.filter((r) => r.z != null);
  const cheap = ranked[0];
  const rich = ranked[ranked.length - 1];
  const beta = d.betas[d.betas.length - 1];
  const countries = Object.keys(d.names);
  const sel = snap.find((r) => r.country === country);

  const lo = Math.floor(Math.min(0, ...snap.flatMap((r) => [r.fair, r.spread])) / 20) * 20;
  const hi = Math.ceil(Math.max(...snap.flatMap((r) => [r.fair, r.spread])) / 20) * 20 + 20;
  const fvTicks = Array.from({ length: (hi - lo) / 20 + 1 }, (_, i) => lo + i * 20);
  const dot = ({ cx, cy, payload: r }) => (
    <g style={{ cursor: "pointer" }}>
      <circle cx={cx} cy={cy} r={5} fill={SIGNAL_COLOR[r.signal]} stroke={r.country === country ? "var(--accent)" : "none"} strokeWidth={2} />
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#AAB3BF" fontSize={10}>{r.country}</text>
    </g>
  );
  const decomp = snap.map((r) => ({ ...r, ...Object.fromEntries(d.factors.map((f) => [f, r[`c_${f}`]])) }));

  return (
    <div>
      <div className="section-head">
        <h2>EGB SPREADS <span className="muted">| Fair value vs fundamentals</span></h2>
        <div className="muted">10Y spread vs Bund · model date {snapDate?.slice(0, 7)}</div>
      </div>

      <div className="stats">
        <StatCard label="Bund 10Y" value={bundLast.bund} unit="%" delta={(bundLast.bund - bundPrev.bund) * 100} />
        <StatCard label={`Cheapest · ${cheap.name}`} value={cheap.residual} unit="bp" digits={0} />
        <StatCard label={`Richest · ${rich.name}`} value={rich.residual} unit="bp" digits={0} />
        <StatCard label="β debt" value={beta.debt} unit="bp/pp" />
        <StatCard label="β fiscal" value={beta.fiscal} unit="bp/pp" />
        <StatCard label="β current acc." value={beta.ca} unit="bp/pp" />
      </div>

      <div className="grid">
        <Card
          title={`FAIR VALUE ${snapDate?.slice(0, 7)} (ABOVE LINE = CHEAP)`}
          note="Fitted spread = cross-country average + β · (country gap vs Germany − average gap). Green/red: |z| > 1. Click a dot for details."
        >
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis type="number" dataKey="fair" name="Fitted" domain={[lo, hi]} ticks={fvTicks} {...axis}
                label={{ value: "Fitted spread (bp) — debt + fiscal + CA", position: "bottom", fill: "var(--muted)", fontSize: 10 }} />
              <YAxis type="number" dataKey="spread" name="Actual" domain={[lo, hi]} ticks={fvTicks} {...axis} width={45}
                label={{ value: "Actual spread vs Bund (bp)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10 }} />
              <ZAxis range={[70, 70]} />
              <Tooltip content={<FairTip />} cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke="var(--accent)" strokeWidth={1.5} />
              <Scatter data={snap} shape={dot} onClick={(r) => setCountry(r.country)} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title="FAIR VALUE DECOMPOSITION (BP)"
          note={`Each bar sums to the spread minus the cross-country average (${fmt(base, 0)} bp). Factor bar = β × the country's gap vs Germany relative to the average gap. Same β for every country.`}
        >
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={decomp} layout="vertical" stackOffset="sign" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={(e) => e?.activeLabel && setCountry(e.activeLabel)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" horizontal={false} />
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="country" {...axis} width={30} />
              <Tooltip content={<Tip digits={0} unit=" bp" />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine x={0} stroke="var(--muted)" />
              {d.factors.map((f, i) => (
                <Bar key={f} dataKey={f} name={FACTOR_LABEL[f]} stackId="a" fill={COLORS[i + 1]} />
              ))}
              <Bar dataKey="residual" name="Residual" stackId="a" fill={COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="RELATIVE VALUE MONITOR" span={2}
          note="Residual = actual − fitted (bp, > 0 = cheap). z = residual / the country's own 36M residual volatility. Gaps = country minus Germany, % of GDP, 12M forward. Click a row for details.">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Country</th><th>10Y</th><th>Spread</th><th>Fitted</th><th>Residual</th><th>z</th><th>Signal</th>
                  <th>Debt gap</th><th>Fiscal gap</th><th>CA gap</th>
                </tr>
              </thead>
              <tbody>
                {snap.map((r) => (
                  <tr key={r.country} className={r.country === country ? "selected" : ""} onClick={() => setCountry(r.country)}>
                    <td><b>{r.country}</b> <span className="muted">{r.name}</span></td>
                    <td>{fmt(r.yield)}</td>
                    <td>{fmt(r.spread, 0)}</td>
                    <td>{fmt(r.fair, 0)}</td>
                    <td className={r.residual > 0 ? "up" : "down"}>{signed(r.residual, 0)}</td>
                    <td className={SIGNAL_CLS[r.signal]}>{signed(r.z, 2)}</td>
                    <td className={SIGNAL_CLS[r.signal]}>{r.signal}</td>
                    <td>{signed(r.debt, 0)}</td>
                    <td>{signed(r.fiscal, 1)}</td>
                    <td>{signed(r.ca, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title={`${d.names[country]?.toUpperCase()} · ACTUAL VS FITTED`}
          span={2}
          right={
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map((c) => <option key={c} value={c}>{c} · {d.names[c]}</option>)}
            </select>
          }
          note={sel && `Latest: actual ${fmt(sel.spread, 0)} bp = average ${fmt(sel.base, 0)} + debt ${signed(sel.c_debt, 0)} + fiscal ${signed(sel.c_fiscal, 0)} + CA ${signed(sel.c_ca, 0)} + residual ${signed(sel.residual, 0)}.`}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={series} syncId="egb-country" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(series)} {...axis} />
              <YAxis {...axis} width={45} />
              <Tooltip content={<Tip digits={0} unit=" bp" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="spread" name="Actual" stroke={COLORS[0]} dot={false} strokeWidth={1.8} />
              <Line dataKey="fair" name="Fitted" stroke={COLORS[1]} dot={false} strokeWidth={1.5} strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={series} syncId="egb-country" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="date" ticks={ticks(series)} {...axis} />
              <YAxis {...axis} width={45} domain={[-3, 3]} allowDataOverflow />
              <Tooltip content={<Tip />} />
              <ReferenceLine y={1} stroke={UP} strokeDasharray="3 3" />
              <ReferenceLine y={-1} stroke={DOWN} strokeDasharray="3 3" />
              <Bar dataKey="z" name="Residual z">
                {series.map((r) => <Cell key={r.date} fill={r.z > 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="10Y SPREAD VS BUND (BP)" span={2} note="Selected country highlighted.">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={d.spreads} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(d.spreads)} {...axis} />
              <YAxis {...axis} width={45} />
              <Tooltip content={<Tip digits={0} />} />
              {countries.map((c, i) => (
                <Line key={c} dataKey={c} name={c} dot={false} connectNulls
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={c === country ? 2.5 : 1}
                  strokeOpacity={c === country ? 1 : 0.35} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="PRICE OF FUNDAMENTALS · POOLED β (36M ROLLING)"
          note="One cross-country regression per month, not per country and not leave-one-out: every country shares the same β. Read as bp of spread per 1pp of GDP gap vs Germany (debt > 0 and fiscal/CA < 0 expected). Large swings 2013–2017 = debt and fiscal are collinear.">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.betas} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(d.betas, 5)} {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<Tip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              {d.factors.map((f, i) => (
                <Line key={f} dataKey={f} name={FACTOR_LABEL[f]} stroke={COLORS[i + 1]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="BACKTEST · MEAN REVERSION (3M)"
          note="Correlation of residual with the next 3M spread change (negative = residual closes). Hit rate = share of months where the spread moved towards fair.">
          <table className="table">
            <thead><tr><th>Country</th><th>Corr</th><th>Hit rate</th><th>N</th></tr></thead>
            <tbody>
              {d.mean_reversion.map((r) => (
                <tr key={r.country}>
                  <td><b>{r.country}</b> <span className="muted">{d.names[r.country]}</span></td>
                  <td className={r.corr < 0 ? "up" : "down"}>{signed(r.corr, 2)}</td>
                  <td className={r.hit_rate > 0.5 ? "up" : "down"}>{fmt(r.hit_rate * 100, 0)}%</td>
                  <td className="muted">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="info">
        <b>Model</b>
        <p>
          spread<sub>i,t</sub> = α<sub>t</sub> + β<sub>t</sub> · [debt, fiscal balance, current account]<sub>i,t</sub> + ε<sub>i,t</sub>.
          Pooled OLS with month fixed effects over a rolling 36M window — pure cross-country relative value.
          Fundamentals from AMECO (incl. Commission forecasts) as gaps vs Germany, blended 12M forward
          (month m puts weight m/12 on next year). Yields: FRED/OECD monthly 10Y averages.
        </p>
        <p className="muted">Caveat: AMECO is the latest vintage — historical fundamentals are revised, so the backtest has look-ahead.</p>
      </div>
    </div>
  );
}
