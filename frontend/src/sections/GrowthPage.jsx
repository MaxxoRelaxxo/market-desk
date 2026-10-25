import { useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Block, Card, Flag, StatCard, Status, SubNav, TimeTip, Toggle, chgCls, useSpy } from "../components/ui";
import { FLAG, PrintsTable, RANGES, period, since } from "../components/macro";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const BLOCKS = [["overview", "OVERVIEW"], ["gdp", "GDP"], ["cli", "LEADING INDICATORS"]];
const CLI_RANGES = [{ id: 10, label: "10Y" }, { id: 20, label: "20Y" }, { id: 99, label: "MAX" }];

function Overview({ d }) {
  const print = (e, label) => d.prints.find((r) => r.economy === e && r.label === label);
  return (
    <Block id="overview" title="GROWTH" sub="real GDP · OECD leading indicators" hero
      right={<span className="asof">As of {d.asof}</span>}>
      {Object.entries(d.economies).map(([e, name]) => {
        const tiles = ["GDP QoQ", "GDP YoY"].map((l) => [l, print(e, l)]).filter(([, r]) => r);
        return tiles.length > 0 && (
          <div key={e}>
            <div className="stats-label"><Flag code={FLAG[e]} />{name.toUpperCase()}</div>
            <div className="stats">
              {tiles.map(([label, r]) => (
                <StatCard key={label} label={`${label} · ${period(r.date, true)}`} value={r.value} unit="%"
                  delta={r.value - r.prev} deltaUnit="pp vs prev" deltaDigits={2} color="var(--accent)" />
              ))}
            </div>
          </div>
        );
      })}
      <PrintsTable title="LATEST GDP PRINTS (%)" economies={d.economies} prints={d.prints} quarterly
        note="Real GDP, seasonally adjusted: % vs previous quarter and vs a year earlier. Prev = previous quarter; Δ in pp. 5Y range: low–high of the last 5 years. US: BEA (FRED). Euro area: ECB national accounts. Sweden: SCB, constant prices." />
    </Block>
  );
}

function Gdp({ d }) {
  const [years, setYears] = useState(5);
  const [bar, setBar] = useState("qoq");
  return (
    <Block id="gdp" title="REAL GDP" sub="%"
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

function Cli({ d }) {
  const [years, setYears] = useState(20);
  const ids = Object.keys(d.cli_labels);
  const rows = since(withT(d.cli), years);
  return (
    <Block id="cli" title="LEADING INDICATORS" sub="OECD CLI · amplitude adjusted · 100 = trend"
      right={<Toggle value={years} onChange={setYears} options={CLI_RANGES} />}>
      <div className="stats">
        {d.cli_latest.map((r) => (
          <StatCard key={r.series_id} label={`${d.cli_labels[r.series_id]} · ${period(r.date)} · ${r.phase}`} value={r.value}
            delta={r.chg_1m} deltaUnit="1M" deltaDigits={2} />
        ))}
      </div>
      <div className="grid">
        <Card title="COMPOSITE LEADING INDICATOR"
          note="OECD CLI, amplitude adjusted: above 100 = activity above its long-term trend; turning points lead the business cycle by ~6–9 months. Major 4 Europe = France, Germany, Italy, UK.">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis {...timeAxis(rows)} />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 0)} />
              <Tooltip content={<TimeTip digits={2} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={100} stroke="var(--muted)" />
              {ids.map((k, j) => <Line key={k} dataKey={k} name={d.cli_labels[k]} stroke={COLORS[j]} strokeWidth={1.6} dot={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="CLI · PHASE" note="Phase from level vs 100 and the 1M change: expansion (> 100, rising), downturn (> 100, falling), slowdown (< 100, falling), recovery (< 100, rising).">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Region</th><th>Month</th><th>Level</th><th>1M</th><th>6M</th><th>Phase</th></tr></thead>
            <tbody>
              {d.cli_latest.map((r) => (
                <tr key={r.series_id}>
                  <td>{d.cli_labels[r.series_id]}</td>
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

export default function GrowthPage() {
  const s = useData("growth.json");
  const current = useSpy(BLOCKS.map(([id]) => id), !!s.data);
  if (!s.data) return <Status state={s} what="growth" />;
  return (
    <div>
      <SubNav blocks={BLOCKS} current={current} />
      <Overview d={s.data} />
      <Gdp d={s.data} />
      <Cli d={s.data} />
    </div>
  );
}
