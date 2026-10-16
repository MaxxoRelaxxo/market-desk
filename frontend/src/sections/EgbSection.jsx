import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, Status, Tip, Toggle } from "../components/ui";
import { COLORS, DOWN, UP, axis, fmt, signed, ticks, useData } from "../lib";

const FACTOR_LABEL = { debt: "Debt", tds: "TDS" };
const SIGNAL_COLOR = { CHEAP: UP, RICH: DOWN, NEUTRAL: "#E8EDF2" };
const SIGNAL_CLS = { CHEAP: "sig-cheap", RICH: "sig-rich", NEUTRAL: "" };

function FairTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="tt">
      <div className="tt-label">{r.name}</div>
      <div className="tt-row"><span className="tt-name">Actual</span><span className="tt-val">{fmt(r.spread, 1)} bp</span></div>
      <div className="tt-row"><span className="tt-name">Fitted</span><span className="tt-val">{fmt(r.fair, 1)} bp</span></div>
      <div className="tt-row"><span className="tt-name">Residual</span><span className="tt-val">{signed(r.residual, 1)} bp</span></div>
      <div className="tt-row"><span className="tt-name">Signal</span><span className="tt-val">{r.signal}</span></div>
    </div>
  );
}

export default function EgbSection() {
  const state = useData("egb.json");
  const [country, setCountry] = useState("FR");
  const [freq, setFreq] = useState("daily");

  const d = state.data;
  if (!d) return <Status state={state} what="EGB data" />;

  const { fit, snapshot: snap, factors } = d;
  const countries = Object.keys(d.names);
  const series = (freq === "daily" ? d.daily : d.series)[country] ?? [];
  const sel = snap.find((r) => r.country === country);
  const equation = `Spread = ${fmt(fit.alpha_full, 1)} ${factors.map((f) => `${signed(fit[`b_full_${f}`], 2)}·${f}`).join(" ")}`;

  const all = snap.flatMap((r) => [r.fair, r.spread]);
  const lo = Math.floor(Math.min(0, ...all) / 20) * 20;
  const hi = Math.ceil(Math.max(...all) / 20) * 20 + 20;
  const fvTicks = Array.from({ length: (hi - lo) / 20 + 1 }, (_, i) => lo + i * 20);
  const dot = ({ cx, cy, payload: r }) => (
    <g style={{ cursor: "pointer" }}>
      <circle cx={cx} cy={cy} r={5} fill={SIGNAL_COLOR[r.signal]} stroke={r.country === country ? "var(--accent)" : "none"} strokeWidth={2} />
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#AAB3BF" fontSize={10}>{r.country}</text>
    </g>
  );
  const decomp = snap.map((r) => ({ ...r, ...Object.fromEntries(factors.map((f) => [f, r[`c_${f}`]])) }));

  return (
    <div>
      <div className="section-head">
        <h2>EGB RELATIVE VALUE <span className="muted">| 10Y spread vs Bund</span></h2>
      </div>
      <div className="eq-line">
        {d.asof} | {equation} | R² {fmt(fit.r2, 2)} | N {fit.n} | σ {fmt(fit.sigma, 1)} bps | lag {d.lag_days}d
      </div>

      <div className="grid">
        <Card title="RELATIVE VALUE MONITOR" span={2}
          note="Debt, budget, current account: % of GDP, last full year (AMECO) with publication lag. TDS = −(budget + current account) / 2. Fitted = leave-one-out: each country priced off a fit on the other countries only. Residual = actual − fitted (bp, > 0 = cheap). z cross-sec. = residual / √(mean squared LOO residual); signal at |z| > 1. z 104w = residual vs its own 104-week history. Click a row for details.">
          <div className="table-wrap">
            <table className="table rv">
              <thead>
                <tr>
                  <th>Country</th><th>Debt</th><th>Budget</th><th>Current acc.</th><th>TDS</th>
                  <th>Actual</th><th>Fitted</th><th>Residual</th><th>z cross-sec.</th><th>z 104w</th><th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {snap.map((r) => (
                  <tr key={r.country} className={r.country === country ? "selected" : ""} onClick={() => setCountry(r.country)}>
                    <td>{r.name}</td>
                    <td>{fmt(r.debt)}</td>
                    <td>{fmt(r.fiscal)}</td>
                    <td>{fmt(r.ca)}</td>
                    <td>{fmt(r.tds)}</td>
                    <td>{fmt(r.spread)}</td>
                    <td>{fmt(r.fair)}</td>
                    <td>{fmt(r.residual)}</td>
                    <td>{fmt(r.z_cs)}</td>
                    <td>{fmt(r.z_ts)}</td>
                    <td className={`sig ${SIGNAL_CLS[r.signal]}`}>{r.signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`FAIR VALUE ${d.asof} (ABOVE LINE = CHEAP)`}
          note="Fitted = a + b·debt + c·TDS fitted on the other countries (leave-one-out, ex Germany). Green/red: |z cross-sec.| > 1. Click a dot for details.">
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis type="number" dataKey="fair" name="Fitted" domain={[lo, hi]} ticks={fvTicks} {...axis}
                label={{ value: `Fitted spread (bp) — ${factors.join(" + ")}`, position: "bottom", fill: "var(--muted)", fontSize: 10 }} />
              <YAxis type="number" dataKey="spread" name="Actual" domain={[lo, hi]} ticks={fvTicks} {...axis} width={45}
                label={{ value: "Actual spread vs Bund (bp)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10 }} />
              <ZAxis range={[70, 70]} />
              <Tooltip content={<FairTip />} cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke="var(--accent)" strokeWidth={1.5} />
              <Scatter data={snap} shape={dot} onClick={(r) => setCountry(r.country)} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card title="FAIR VALUE DECOMPOSITION (BP)"
          note="Actual = intercept + β·debt + β·TDS + residual, with each country's own LOO coefficients.">
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={decomp} layout="vertical" stackOffset="sign" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={(e) => e?.activeLabel && setCountry(e.activeLabel)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" horizontal={false} />
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="country" {...axis} width={30} />
              <Tooltip content={<Tip digits={1} unit=" bp" />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine x={0} stroke="var(--muted)" />
              {factors.map((f, i) => (
                <Bar key={f} dataKey={f} name={FACTOR_LABEL[f]} stackId="a" fill={COLORS[i + 1]} />
              ))}
              <Bar dataKey="residual" name="Residual" stackId="a" fill={COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title={`${d.names[country]?.toUpperCase()} · ACTUAL VS FITTED`}
          span={2}
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <Toggle value={freq} onChange={setFreq} options={[{ id: "daily", label: "2Y DAILY" }, { id: "weekly", label: "MAX WEEKLY" }]} />
              <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
                {countries.map((c) => <option key={c} value={c}>{d.names[c]}</option>)}
              </select>
            </div>
          }
          note={sel && `Latest: actual ${fmt(sel.spread, 1)} bp = intercept ${fmt(sel.alpha, 1)}${factors.map((f) => ` + ${f} ${signed(sel[`c_${f}`], 1)}`).join("")} + residual ${signed(sel.residual, 1)}.`}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={series} syncId="egb-country" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(series)} {...axis} />
              <YAxis {...axis} width={45} />
              <Tooltip content={<Tip digits={1} unit=" bp" />} />
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
              <Bar dataKey="z_cs" name="z cross-sec.">
                {series.map((r) => <Cell key={r.date} fill={r.z_cs > 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="10Y SPREAD VS BUND (BP)" span={2} note="Weekly. Selected country highlighted.">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={d.spreads} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(d.spreads)} {...axis} />
              <YAxis {...axis} width={45} />
              <Tooltip content={<Tip digits={0} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {countries.map((c, i) => (
                <Line key={c} dataKey={c} name={c} dot={false} connectNulls
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={c === country ? 2.5 : 1}
                  strokeOpacity={c === country ? 1 : 0.4} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="LEAVE-ONE-OUT VS ALL COUNTRIES"
          note="All countries: one regression incl. the country itself (equation line above). LOO: the country is left out and priced off the rest — used for the signal. A big gap = high-leverage country that pulls the all-country line towards itself.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={snap} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="country" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<Tip digits={1} unit=" bp" />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Bar dataKey="residual_full" name="Residual (all countries)" fill={COLORS[8]} />
              <Bar dataKey="residual" name="Residual (LOO)" fill={COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
          <table className="table">
            <thead>
              <tr>
                <th>Country</th><th>Fitted (all)</th><th>Resid. (all)</th><th>Fitted (LOO)</th><th>Resid. (LOO)</th>
                {factors.map((f) => <th key={f}>LOO β {f}</th>)}
              </tr>
            </thead>
            <tbody>
              {snap.map((r) => (
                <tr key={r.country} onClick={() => setCountry(r.country)}>
                  <td>{r.name}</td>
                  <td>{fmt(r.fair_full, 1)}</td>
                  <td>{signed(r.residual_full, 1)}</td>
                  <td>{fmt(r.fair, 1)}</td>
                  <td className={r.residual > 0 ? "up" : "down"}>{signed(r.residual, 1)}</td>
                  {factors.map((f) => <td key={f}>{fmt(r[`b_${f}`], 2)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="BACKTEST · MEAN REVERSION (3M)"
          note="Correlation of residual with the spread change over the next 63 business days (negative = residual closes). Hit rate = share of days where the spread then moved towards fair. Overlapping windows.">
          <table className="table">
            <thead><tr><th>Country</th><th>Corr</th><th>Hit rate</th><th>N</th></tr></thead>
            <tbody>
              {d.mean_reversion.map((r) => (
                <tr key={r.country}>
                  <td>{d.names[r.country]}</td>
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
          Each day: spread<sub>i</sub> = a + b·debt<sub>i</sub> + c·TDS<sub>i</sub> + ε<sub>i</sub>, OLS across countries ex Germany.
          Fair value is leave-one-out: each country is priced off the regression on the other countries.
          Fundamentals are AMECO levels for the last full year, used from {d.lag_days} days after year-end.
          TDS (twin deficit score) = −(budget balance + current account) / 2. Yields: daily 10Y from Riksbank SWEA,
          Banca d'Italia and Banco de España.
        </p>
        <p className="muted">With N = {fit.n} countries and 3 parameters the fit has {fit.n - 3} degrees of freedom — read residuals with care. AMECO is the latest vintage, so the backtest has look-ahead.</p>
      </div>
    </div>
  );
}
