import { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Block, Card, Flag, Status, SubNav, Tip, TimeTip, Toggle, chgCls, useSpy } from "../components/ui";
import { FLAG, PrintsTable, RANGES, period, since, wide } from "../components/macro";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const BLOCKS = [["growth", "GROWTH"], ["cli", "LEADING INDICATORS"], ["inflation", "INFLATION"], ["cb", "CENTRAL BANKS"]];
const CLI_RANGES = [{ id: 10, label: "10Y" }, { id: 20, label: "20Y" }, { id: 99, label: "MAX" }];
const INFL_NOTES = {
  US: "Fed target: PCE 2%. BLS (CPI), BEA (PCE).",
  EA: "ECB target: HICP 2%. Core = ex energy, food, alcohol & tobacco.",
  SE: "Riksbank target: CPIF 2%. SCB.",
};
const POLICY = [["effr", "Fed funds effective"], ["ecb_dfr", "ECB deposit rate"], ["SE", "Riksbank policy rate"]];
const mon = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

/** Time-series chart; `children` = array of keyed Recharts elements (Recharts skips fragments). */
const chart = (rows, children, height = 260) => (
  <ResponsiveContainer width="100%" height={height}>
    <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
      {children}
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </ComposedChart>
  </ResponsiveContainer>
);

// ============================================================ GROWTH

function Growth({ d }) {
  const [years, setYears] = useState(5);
  const [bar, setBar] = useState("qoq");
  return (
    <Block id="growth" title="MACRO" sub="growth · inflation · central banks" hero right={<span className="asof">As of {d.asof}</span>}>
      <PrintsTable title="REAL GDP · LATEST (%)" economies={d.economies} prints={d.growth.prints} quarterly
        note="Real GDP, seasonally adjusted: % vs previous quarter and vs a year earlier. Δ in pp vs previous quarter. US: BEA (FRED). Euro area: ECB national accounts. Sweden: SCB, constant prices." />
      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>REAL GDP<span className="muted">%</span></h2>
        <div className="toggles">
          <Toggle value={bar} onChange={setBar} options={[{ id: "qoq", label: "QoQ" }, { id: "saar", label: "QoQ SAAR" }]} />
          <Toggle value={years} onChange={setYears} options={RANGES} />
        </div>
      </div>
      <div className="grid">
        {Object.entries(d.economies).map(([e, name]) => {
          const rows = since(withT(d.growth.gdp.filter((r) => r.economy === e)), years);
          return rows.length > 0 && (
            <Card key={e} title={`${name.toUpperCase()} · REAL GDP`}>
              {chart(rows, [
                <XAxis key="x" {...timeAxis(rows)} />,
                <YAxis key="y" {...axis} width={36} tickFormatter={(v) => fmt(v, 0)} />,
                <Tooltip key="t" content={<TimeTip digits={1} unit="%" />} />,
                <ReferenceLine key="r" y={0} stroke="var(--muted)" />,
                <Bar key="b" dataKey={bar} name={bar === "qoq" ? "QoQ" : "QoQ SAAR"} fill={COLORS[0]} />,
                <Line key="l" dataKey="yoy" name="YoY" stroke={COLORS[3]} strokeWidth={1.8} dot={false} />,
              ])}
            </Card>
          );
        })}
      </div>
    </Block>
  );
}

function Cli({ c }) {
  const [years, setYears] = useState(20);
  const rows = since(withT(c.history), years);
  return (
    <Block id="cli" title="LEADING INDICATORS" sub="OECD CLI · amplitude adjusted · 100 = trend"
      right={<Toggle value={years} onChange={setYears} options={CLI_RANGES} />}>
      <div className="grid">
        <Card title="COMPOSITE LEADING INDICATOR"
          note="Above 100 = activity above its long-term trend; turning points lead the cycle by ~6–9 months. Major 4 Europe = France, Germany, Italy, UK.">
          {chart(rows, [
            <XAxis key="x" {...timeAxis(rows)} />,
            <YAxis key="y" {...axis} width={40} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 0)} />,
            <Tooltip key="t" content={<TimeTip digits={2} />} />,
            <ReferenceLine key="r" y={100} stroke="var(--muted)" />,
            ...Object.entries(c.labels).map(([k, name], j) => <Line key={k} dataKey={k} name={name} stroke={COLORS[j]} strokeWidth={1.6} dot={false} connectNulls />),
          ], 280)}
        </Card>
        <Card title="CLI · LATEST" note="Phase from level vs 100 and the 1M change: expansion (> 100, rising), downturn (> 100, falling), slowdown (< 100, falling), recovery (< 100, rising).">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Region</th><th>Month</th><th>Level</th><th>1M</th><th>6M</th><th>Phase</th></tr></thead>
            <tbody>
              {c.latest.map((r) => (
                <tr key={r.series_id}>
                  <td>{c.labels[r.series_id]}</td>
                  <td className="muted">{period(r.date)}</td>
                  <td>{fmt(r.value, 2)}</td>
                  <td className={chgCls(r.chg_1m)}>{signed(r.chg_1m, 2)}</td>
                  <td className={chgCls(r.chg_6m)}>{signed(r.chg_6m, 2)}</td>
                  <td>{r.phase}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>
    </Block>
  );
}

// ============================================================ INFLATION

function Inflation({ d }) {
  const x = d.inflation;
  const [years, setYears] = useState(5);
  const data = useMemo(() => wide(x.history, "series_id", "yoy"), [x]);
  const ids = (e) => Object.keys(x.series).filter((k) => x.series[k].economy === e);
  return (
    <Block id="inflation" title="INFLATION" sub="YoY % · target 2%" right={<Toggle value={years} onChange={setYears} options={RANGES} />}>
      <div style={{ marginBottom: 14 }}>
        <PrintsTable title="LATEST PRINTS (YOY %)" economies={d.economies} prints={x.prints}
          note="Δ in pp vs previous month. 5Y range: low–high of the last 5 years and where the latest print sits. US/EA: FRED (BLS, BEA, Eurostat). Sweden: SCB." />
      </div>
      <div className="grid">
        {Object.entries(d.economies).filter(([e]) => ids(e).length).map(([e, name]) => {
          const ks = ids(e);
          const rows = since(data.filter((r) => ks.some((k) => r[k] != null)), years);
          return (
            <Card key={e} title={`${name.toUpperCase()} · YOY`} note={INFL_NOTES[e]}>
              {chart(rows, [
                <XAxis key="x" {...timeAxis(rows)} />,
                <YAxis key="y" {...axis} width={36} tickFormatter={(v) => fmt(v, 0)} />,
                <Tooltip key="t" content={<TimeTip digits={1} unit="%" />} />,
                <ReferenceLine key="r" y={2} stroke="var(--muted)" strokeDasharray="4 4" />,
                ...ks.map((k, j) => (
                  <Line key={k} dataKey={k} name={x.series[k].label} stroke={COLORS[j % COLORS.length]}
                    strokeWidth={x.series[k].headline ? 1.8 : 1.4} dot={false} connectNulls />
                )),
              ])}
            </Card>
          );
        })}
        {x.kpif_groups.length > 0 && (
          <Card title="SWEDEN · CPIF BY PRODUCT GROUP (YOY %)" note={`SCB, COICOP 2018 divisions, ${period(x.kpif_groups[0].date)}. Δ in pp vs previous month.`}>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Group</th><th>Latest</th><th>Prev</th><th>Δ pp</th><th>1Y ago</th></tr></thead>
              <tbody>
                {x.kpif_groups.map((r) => (
                  <tr key={r.group} style={r.group === "00" ? { fontWeight: 600 } : undefined}>
                    <td>{r.group_label}</td>
                    <td>{fmt(r.value, 1)}</td>
                    <td className="muted">{fmt(r.prev, 1)}</td>
                    <td className={chgCls(r.value - r.prev)}>{signed(r.value - r.prev, 1)}</td>
                    <td className="muted">{fmt(r.y1, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>
    </Block>
  );
}

// ============================================================ CENTRAL BANKS

function BankTile({ e, name, b }) {
  const next = b.meetings[0];
  return (
    <div className="stat">
      <div className="stat-body">
        <div className="stat-label" title={name}><Flag code={FLAG[e]} /> {b.label}</div>
        <div className="stat-value">
          {b.upper != null ? `${fmt(b.lower, 2)}–${fmt(b.upper, 2)}` : fmt(b.rate, 2)}<span className="stat-unit">%</span>
        </div>
        <div className={`stat-delta ${next ? chgCls(next.chg) : ""}`}>
          {b.next ? `Next ${mon(b.next)}` : "–"}{next && ` · ${signed(next.chg, 1)} bp priced`}
        </div>
      </div>
    </div>
  );
}

function FedMeetings({ b }) {
  const rows = b.meetings.map((m) => ({ ...m, label: mon(m.date) }));
  return (
    <Card title="FED · PRICING PER FOMC MEETING (BP VS TODAY'S EFFR)" right={<span className="muted">{b.asof}</span>}
      note="30-day Fed funds futures (CBOT, Yahoo Finance), CME FedWatch method: monthly average EFFR = 100 − price; rate after a meeting from the next month without a meeting, else solved from the meeting month. Implied target = mid of today's range + cumulative. 1W/1M build up from daily snapshots.">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
          <XAxis dataKey="label" {...axis} interval={0} tick={{ fontSize: 9, fill: "var(--muted)" }} />
          <YAxis {...axis} width={40} domain={[(lo) => Math.min(0, lo), (hi) => Math.max(0, hi)]} tickFormatter={(v) => fmt(v, 0)} />
          <Tooltip content={<Tip digits={1} unit=" bp" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Bar dataKey="cum" name="Cumulative, now" fill={COLORS[0]} />
          {rows.some((r) => r.cum_w1 != null) && <Line dataKey="cum_w1" name="1W ago" stroke={COLORS[1]} dot={{ r: 2 }} strokeDasharray="4 3" />}
          {rows.some((r) => r.cum_m1 != null) && <Line dataKey="cum_m1" name="1M ago" stroke={COLORS[2]} dot={{ r: 2 }} strokeDasharray="4 3" />}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="table-wrap"><table className="table">
        <thead>
          <tr><th>Meeting</th><th>Implied target mid</th><th>Implied EFFR</th><th>Δ meeting bp</th><th>Cum. bp</th><th>25bp moves</th><th>Δ 1W bp</th><th>Δ 1M bp</th></tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const dw = m.cum_w1 != null ? m.cum - m.cum_w1 : null;
            const dm = m.cum_m1 != null ? m.cum - m.cum_m1 : null;
            return (
              <tr key={m.date}>
                <td>{m.label}</td>
                <td>{fmt(m.policy, 3)}</td>
                <td className="muted">{fmt(m.rate, 3)}</td>
                <td className={chgCls(m.chg)}>{signed(m.chg, 1)}</td>
                <td className={chgCls(m.cum)}>{signed(m.cum, 1)}</td>
                <td>{signed(m.cum / 25, 2)}</td>
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

function CentralBanks({ d }) {
  const { banks, history } = d.policy;
  const [years, setYears] = useState(5);
  const rows = since(withT(history), years);
  return (
    <Block id="cb" title="CENTRAL BANKS" sub="policy rates · Fed pricing per meeting" right={<Toggle value={years} onChange={setYears} options={RANGES} />}>
      <div style={{ marginBottom: 14 }}>
        <Card title="POLICY RATES (%)" note="Weekly, last obs. Fed funds effective rate and ECB deposit facility rate (FRED), Riksbank policy rate (SWEA).">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis {...timeAxis(rows)} />
              <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 1)} />
              <Tooltip content={<TimeTip digits={2} unit="%" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {POLICY.map(([k, name], j) => <Line key={k} dataKey={k} name={name} stroke={COLORS[j]} strokeWidth={1.6} dot={false} type="stepAfter" connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {Object.entries(d.economies).filter(([e]) => banks[e]).map(([e, name]) => <BankTile key={e} e={e} name={name} b={banks[e]} />)}
      </div>
      {banks.US?.meetings.length > 0 && <FedMeetings b={banks.US} />}
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
      <Growth d={d} />
      <Cli c={d.cli} />
      <Inflation d={d} />
      <CentralBanks d={d} />
    </div>
  );
}
