import { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Block, Card, Flag, StatCard, Status, SubNav, Tip, TimeTip, Toggle, chgCls, useSpy } from "../components/ui";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const BLOCKS = [["overview", "OVERVIEW"], ["growth", "GROWTH"], ["inflation", "INFLATION"], ["pricing", "POLICY PRICING"], ["expectations", "INFLATION EXPECTATIONS"]];
const FLAG = { US: "us", EA: "eu", SE: "se" };
const HEADLINE = { US: "us_cpi", EA: "ea_hicp", SE: "se_hicp" };
const CORE = { US: "us_core_pce", EA: "ea_core_hicp", SE: "se_core_hicp" };
const BANK = { US: "FED · SOFR FUTURES", EA: "ECB · AAA FORWARD CURVE", SE: "RIKSBANK · T-BILL FORWARDS" };
const RANGES = [{ id: 5, label: "5Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const YEAR = 365.25 * 864e5;
const STRIPS = [["now", "Now"], ["w1", "1W ago"], ["m1", "1M ago"]];

const period = (iso, q) => (q ? `${iso.slice(0, 4)} Q${Math.floor(+iso.slice(5, 7) / 3) + 1}` : iso.slice(0, 7));
const since = (rows, years) => rows.filter((r) => r.t >= rows.at(-1).t - years * YEAR);
const wide = (rows, key, val) => {
  const by = {};
  rows.forEach((r) => ((by[r.date] ??= { date: r.date })[r[key]] = r[val]));
  return withT(Object.values(by).sort((a, b) => a.date.localeCompare(b.date)));
};

// ============================================================ OVERVIEW

function Overview({ d }) {
  const print = (e, label) => d.prints.find((r) => r.economy === e && r.label === label);
  const infl = (e, k) => print(e, d.inflation_series[k]?.label);
  const priced = (p) => p?.points.filter((x) => x.h <= 13).at(-1);

  return (
    <Block id="overview" title="MACRO" sub="growth · inflation · market pricing" hero
      right={<span className="asof">As of {d.asof}</span>}>
      {Object.entries(d.economies).map(([e, name]) => {
        const p = d.paths[e];
        const pr = priced(p);
        const tiles = [
          ["GDP QoQ", print(e, "GDP QoQ"), true],
          ["GDP YoY", print(e, "GDP YoY"), true],
          [`${d.inflation_series[HEADLINE[e]]?.label} YoY`, infl(e, HEADLINE[e])],
          [`${d.inflation_series[CORE[e]]?.label} YoY`, infl(e, CORE[e])],
        ].filter(([, r]) => r);
        return (
          <div key={e}>
            <div className="stats-label"><Flag code={FLAG[e]} />{name.toUpperCase()}</div>
            <div className="stats">
              {tiles.map(([label, r, q]) => (
                <StatCard key={label} label={`${label} · ${period(r.date, q)}`} value={r.value} unit="%"
                  delta={r.value - r.prev} deltaUnit="pp vs prev" deltaDigits={2} color="var(--accent)" />
              ))}
              {p?.policy.value != null && <StatCard label={p.policy.label} value={p.policy.value} unit="%" color="var(--accent)" />}
              {pr && <StatCard label={`Priced by ${pr.label} (${fmt(pr.h, 0)}M)`} value={signed(pr.bp, 0)} unit="bp"
                delta={pr.w1 != null ? (pr.now - pr.w1) * 100 : undefined} deltaUnit="bp 1W" />}
            </div>
          </div>
        );
      })}
      <Card title="LATEST PRINTS (%)"
        note="GDP: real, seasonally adjusted, % vs previous quarter and vs a year earlier. Inflation: YoY % of the index (HICP for the euro area and Sweden, CPI/PCE for the US). Prev = previous release; Δ in pp. 5Y range: low–high of the last 5 years and where the latest print sits. FRED (BEA, BLS, Eurostat); euro area GDP: ECB.">
        <div className="table-wrap"><table className="table">
          <thead>
            <tr><th>Indicator</th><th>Period</th><th>Latest</th><th>Prev</th><th>Δ pp</th><th>1Y ago</th><th>5Y avg</th><th>5Y low</th><th>5Y range</th><th>5Y high</th></tr>
          </thead>
          <tbody>
            {Object.entries(d.economies).flatMap(([e, name]) => [
              <tr key={e} className="group"><td colSpan={10}>{name.toUpperCase()}</td></tr>,
              ...d.prints.filter((r) => r.economy === e).map((r) => {
                const pos = r.hi_5y > r.lo_5y ? (r.value - r.lo_5y) / (r.hi_5y - r.lo_5y) : 0.5;
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="muted">{period(r.date, r.label.startsWith("GDP"))}</td>
                    <td>{fmt(r.value, 1)}</td>
                    <td className="muted">{fmt(r.prev, 1)}</td>
                    <td className={chgCls(r.value - r.prev)}>{signed(r.value - r.prev, 1)}</td>
                    <td className="muted">{fmt(r.y1, 1)}</td>
                    <td className="muted">{fmt(r.avg_5y, 1)}</td>
                    <td className="muted">{fmt(r.lo_5y, 1)}</td>
                    <td><div className="range"><span style={{ left: `${pos * 100}%` }} /></div></td>
                    <td className="muted">{fmt(r.hi_5y, 1)}</td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table></div>
      </Card>
    </Block>
  );
}

// ============================================================ GROWTH

function Growth({ d }) {
  const [years, setYears] = useState(5);
  const [bar, setBar] = useState("qoq");
  return (
    <Block id="growth" title="GROWTH" sub="real GDP · %"
      right={<div className="toggles">
        <Toggle value={bar} onChange={setBar} options={[{ id: "qoq", label: "QoQ" }, { id: "saar", label: "QoQ SAAR" }]} />
        <Toggle value={years} onChange={setYears} options={RANGES} />
      </div>}>
      <div className="grid">
        {Object.entries(d.economies).map(([e, name]) => {
          const rows = since(withT(d.gdp.filter((r) => r.economy === e)), years);
          return rows.length > 0 && (
            <Card key={e} title={`${name.toUpperCase()} · REAL GDP`}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(rows)} />
                  <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip content={<TimeTip digits={1} unit="%" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="var(--muted)" />
                  <Bar dataKey={bar} name={bar === "qoq" ? "QoQ" : "QoQ SAAR"} fill={COLORS[0]} />
                  <Line dataKey="yoy" name="YoY" stroke={COLORS[3]} strokeWidth={1.8} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
    </Block>
  );
}

// ============================================================ INFLATION

function Inflation({ d }) {
  const [years, setYears] = useState(5);
  const [measure, setMeasure] = useState("yoy");
  const data = useMemo(() => wide(d.inflation, "series_id", measure), [d, measure]);
  const series = Object.entries(d.inflation_series).filter(([, s]) => measure === "yoy" || s.sa);
  const economies = Object.entries(d.economies).filter(([e]) => series.some(([, s]) => s.economy === e));
  return (
    <Block id="inflation" title="INFLATION" sub="% · target 2%"
      right={<div className="toggles">
        <Toggle value={measure} onChange={setMeasure} options={[{ id: "yoy", label: "YoY" }, { id: "m3", label: "3M ANN. (SA)" }]} />
        <Toggle value={years} onChange={setYears} options={RANGES} />
      </div>}>
      <div className="grid">
        {economies.map(([e, name]) => {
          const ids = series.filter(([, s]) => s.economy === e).map(([k]) => k);
          const rows = since(data.filter((r) => ids.some((k) => r[k] != null)), years);
          return (
            <Card key={e} title={`${name.toUpperCase()} · ${measure === "yoy" ? "YOY" : "3M/3M ANNUALISED"}`}
              note={e === "SE" ? "HICP; the Riksbank targets CPIF (SCB), not on FRED." : e === "US" ? "Fed target: PCE." : null}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(rows)} />
                  <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip content={<TimeTip digits={1} unit="%" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={2} stroke="var(--muted)" strokeDasharray="4 4" />
                  {ids.map((k, j) => (
                    <Line key={k} dataKey={k} name={d.inflation_series[k].label} stroke={COLORS[j % COLORS.length]}
                      strokeWidth={d.inflation_series[k].headline ? 1.8 : 1.4} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
    </Block>
  );
}

// ============================================================ POLICY PRICING

const NOTES = {
  US: "3M SOFR futures (CME, Yahoo Finance): implied rate = 100 − price, compounded SOFR over the IMM quarter starting in the labelled month; x = months to the middle of that quarter. 1W/1M strips build up from daily snapshots.",
  EA: "Instantaneous forwards of the ECB AAA euro area government curve at 3M–3Y, €STR at 0. AAA bonds trade at a spread to €STR OIS: read changes and shape, not the level.",
  SE: "Forwards implied by Riksbank T-bill benchmarks (1M, 3M, 6M). T-bills trade below the policy rate (scarcity), so the level is biased low.",
};

function PathCard({ e, p }) {
  // y-domain spans every strip and the policy rate, so the policy line is always visible
  const vals = [p.policy.value, ...p.points.flatMap((x) => STRIPS.map(([k]) => x[k]))].filter((v) => v != null);
  const pad = Math.max(0.05, (Math.max(...vals) - Math.min(...vals)) * 0.1);
  return (
    <Card title={`${BANK[e]} (%)`} note={NOTES[e]} right={<span className="muted">{p.asof}</span>}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={p.points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
          <XAxis dataKey="h" type="number" domain={[0, "dataMax"]} {...axis} tickFormatter={(v) => `${fmt(v, 0)}M`} />
          <YAxis {...axis} width={40} domain={[Math.min(...vals) - pad, Math.max(...vals) + pad]} tickFormatter={(v) => fmt(v, 2)} />
          <Tooltip content={(t) => <Tip {...t} label={p.points.find((x) => x.h === t.label)?.label} digits={2} unit="%" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {p.policy.value != null && <ReferenceLine y={p.policy.value} stroke="var(--muted)" strokeDasharray="4 4"
            label={{ value: p.policy.label, fill: "var(--muted)", fontSize: 10, position: "insideTopRight" }} />}
          {STRIPS.filter(([k]) => p.points.some((x) => x[k] != null)).map(([k, name], j) => (
            <Line key={k} dataKey={k} name={name} stroke={COLORS[j]} strokeWidth={j ? 1.2 : 2} strokeDasharray={j ? "4 3" : undefined} dot={{ r: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Horizon</th><th>Rate</th><th>vs policy bp</th><th>Δ1W bp</th><th>Δ1M bp</th></tr></thead>
        <tbody>
          {p.points.map((x) => {
            const dw = x.w1 != null ? (x.now - x.w1) * 100 : null;
            const dm = x.m1 != null ? (x.now - x.m1) * 100 : null;
            return (
              <tr key={x.label}>
                <td>{x.label}</td>
                <td>{fmt(x.now, 3)}</td>
                <td className={chgCls(x.bp)}>{signed(x.bp, 0)}</td>
                <td className={chgCls(dw)}>{signed(dw, 1)}</td>
                <td className={chgCls(dm)}>{signed(dm, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </Card>
  );
}

function Pricing({ d }) {
  const [years, setYears] = useState(5);
  const rows = since(withT(d.policy_history), years);
  return (
    <Block id="pricing" title="POLICY PRICING" sub="market-implied path vs policy rate">
      <div className="grid" style={{ marginBottom: 14 }}>
        {Object.keys(d.economies).filter((e) => d.paths[e]).map((e) => <PathCard key={e} e={e} p={d.paths[e]} />)}
        <Card title="POLICY RATES (%)" right={<Toggle value={years} onChange={setYears} options={RANGES} />}
          note="Weekly, last obs. US: SOFR (FRED); ECB deposit facility rate (FRED); Riksbank policy rate (SWEA).">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis {...timeAxis(rows)} />
              <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 1)} />
              <Tooltip content={<TimeTip digits={2} unit="%" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.entries(d.policy).map(([e, label], j) => (
                <Line key={e} dataKey={e} name={label} stroke={COLORS[j]} strokeWidth={1.6} dot={false} type="stepAfter" connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </Block>
  );
}

// ============================================================ INFLATION EXPECTATIONS

function Expectations({ x }) {
  const [years, setYears] = useState(10);
  const rows = since(withT(x.history), years);
  const ids = Object.keys(x.labels);
  return (
    <Block id="expectations" title="INFLATION EXPECTATIONS" sub="market & surveys · %"
      right={<Toggle value={years} onChange={setYears} options={RANGES} />}>
      <div className="stats">
        {x.latest.map((r) => (
          <StatCard key={r.series_id} label={`${r.label} · ${r.date}`} value={r.value} unit="%"
            delta={r.chg_m1} deltaUnit="bp 1M" deltaDigits={0} color="var(--accent)" />
        ))}
      </div>
      <Card title="INFLATION EXPECTATIONS (%)"
        note="US breakevens: nominal − TIPS (FRED). 5Y5Y: 5Y breakeven 5Y forward. Michigan: households, 1Y ahead median. Cleveland Fed: model 1Y expected inflation. EA SPF: ECB Survey of Professional Forecasters, HICP ~5Y ahead (quarterly). Dashed line 2%.">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
            <XAxis {...timeAxis(rows)} />
            <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 1)} />
            <Tooltip content={<TimeTip digits={2} unit="%" />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={2} stroke="var(--muted)" strokeDasharray="4 4" />
            {ids.map((k, j) => (
              <Line key={k} dataKey={k} name={x.labels[k]} stroke={COLORS[j % COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </Block>
  );
}

// ============================================================ PAGE

export default function MacroPage() {
  const s = useData("macro.json");
  const current = useSpy(BLOCKS.map(([id]) => id), !!s.data);
  if (!s.data) return <Status state={s} what="macro" />;
  const d = s.data;

  return (
    <div>
      <SubNav blocks={BLOCKS} current={current} />
      <Overview d={d} />
      <Growth d={d} />
      <Inflation d={d} />
      <Pricing d={d} />
      <Expectations x={d.expectations} />
    </div>
  );
}
