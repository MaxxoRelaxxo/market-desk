import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Block, Card, Flag, StatCard, Status, SubNav, TimeTip, Toggle, useSpy } from "../components/ui";
import { FLAG, PrintsTable, RANGES, period, since, wide } from "../components/macro";
import { COLORS, axis, fmt, timeAxis, useData } from "../lib";

const BLOCKS = [["overview", "OVERVIEW"], ["charts", "DEVELOPMENT"]];
const NOTES = {
  US: "Fed target: PCE 2%. BLS (CPI), BEA (PCE), seasonally adjusted.",
  EA: "ECB target: HICP 2%. Core = ex energy, food, alcohol & tobacco. Eurostat via FRED.",
  SE: "Riksbank target: CPIF 2%. SCB, 2020=100.",
};

function Overview({ d }) {
  const ids = (e) => Object.keys(d.series).filter((k) => d.series[k].economy === e);
  const print = (k) => d.prints.find((r) => r.economy === d.series[k].economy && r.label === d.series[k].label);
  return (
    <Block id="overview" title="INFLATION" sub="YoY % · target 2%" hero right={<span className="asof">As of {d.asof}</span>}>
      {Object.entries(d.economies).filter(([e]) => ids(e).length).map(([e, name]) => (
        <div key={e}>
          <div className="stats-label"><Flag code={FLAG[e]} />{name.toUpperCase()}</div>
          <div className="stats">
            {ids(e).map((k) => print(k)).filter(Boolean).map((r) => (
              <StatCard key={r.label} label={`${r.label} YoY · ${period(r.date)}`} value={r.value} unit="%"
                delta={r.value - r.prev} deltaUnit="pp vs prev" deltaDigits={2} color="var(--accent)" />
            ))}
          </div>
        </div>
      ))}
      <PrintsTable title="LATEST PRINTS (YOY %)" economies={d.economies} prints={d.prints}
        note="YoY % of the index. Prev = previous month; Δ in pp. 5Y range: low–high of the last 5 years and where the latest print sits." />
    </Block>
  );
}

function Charts({ d }) {
  const [years, setYears] = useState(5);
  const [measure, setMeasure] = useState("yoy");
  const data = useMemo(() => wide(d.history, "series_id", measure), [d, measure]);
  const ids = (e) => Object.keys(d.series).filter((k) => d.series[k].economy === e && (measure === "yoy" || d.series[k].sa));
  return (
    <Block id="charts" title="DEVELOPMENT" sub="%"
      right={<div className="toggles">
        <Toggle value={measure} onChange={setMeasure} options={[{ id: "yoy", label: "YoY" }, { id: "m3", label: "3M ANN. (SA)" }]} />
        <Toggle value={years} onChange={setYears} options={RANGES} />
      </div>}>
      <div className="grid">
        {Object.entries(d.economies).filter(([e]) => ids(e).length).map(([e, name]) => {
          const ks = ids(e);
          const rows = since(data.filter((r) => ks.some((k) => r[k] != null)), years);
          return (
            <Card key={e} title={`${name.toUpperCase()} · ${measure === "yoy" ? "YOY" : "3M/3M ANNUALISED"}`} note={NOTES[e]}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(rows)} />
                  <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip content={<TimeTip digits={1} unit="%" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={2} stroke="var(--muted)" strokeDasharray="4 4" />
                  {ks.map((k, j) => (
                    <Line key={k} dataKey={k} name={d.series[k].label} stroke={COLORS[j % COLORS.length]}
                      strokeWidth={d.series[k].headline ? 1.8 : 1.4} dot={false} connectNulls />
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

export default function InflationPage() {
  const s = useData("inflation.json");
  const current = useSpy(BLOCKS.map(([id]) => id), !!s.data);
  if (!s.data) return <Status state={s} what="inflation" />;
  return (
    <div>
      <SubNav blocks={BLOCKS} current={current} />
      <Overview d={s.data} />
      <Charts d={s.data} />
    </div>
  );
}
