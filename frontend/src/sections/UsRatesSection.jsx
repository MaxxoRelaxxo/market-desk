import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, StatCard, Status, Tip, Toggle } from "../components/ui";
import { COLORS, axis, signed, ticks, useData } from "../lib";

const STATS = [
  ["DGS2", "UST 2Y"], ["DGS5", "UST 5Y"], ["DGS10", "UST 10Y"], ["DGS30", "UST 30Y"],
  ["DFII10", "TIPS 10Y"], ["T10YIE", "BE 10Y"], ["T5YIFR", "5Y5Y"], ["DFF", "EFFR"],
];
const PANELS = [
  { title: "TREASURY YIELDS (%)", lines: [["DGS2", "2Y"], ["DGS10", "10Y"], ["DGS30", "30Y"], ["DFII10", "TIPS 10Y"]] },
  { title: "KURVLUTNING (PP)", lines: [["T10Y2Y", "10Y−2Y"], ["T10Y3M", "10Y−3M"]], zero: true },
  { title: "INFLATIONSFÖRVÄNTNINGAR (%)", lines: [["T10YIE", "Breakeven 10Y"], ["T5YIFR", "5Y5Y fwd"]] },
  { title: "KREDITSPREADAR (%)", lines: [["BAMLC0A0CM", "IG OAS"], ["BAMLH0A0HYM2", "HY OAS"]] },
];
const RANGES = [{ id: 3, label: "3Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];

export default function UsRatesSection() {
  const state = useData("us_rates.json");
  const [kind, setKind] = useState("nominal");
  const [years, setYears] = useState(10);

  const history = useMemo(() => {
    const h = state.data?.history ?? [];
    if (!h.length) return h;
    const cut = new Date(h[h.length - 1].date);
    cut.setFullYear(cut.getFullYear() - years);
    return h.filter((r) => new Date(r.date) >= cut);
  }, [state.data, years]);

  if (!state.data) return <Status state={state} what="US-räntor" />;
  const { latest, curve } = state.data;
  const byId = Object.fromEntries(latest.map((r) => [r.series_id, r]));
  const xt = ticks(history);

  return (
    <div>
      <div className="section-head">
        <h2>US RATES <span className="muted">| Treasuries, TIPS, inflation & kredit</span></h2>
        <div className="muted">Källa: FRED · senaste obs {byId.DGS10?.date}</div>
      </div>

      <div className="stats">
        {STATS.map(([id, label]) => byId[id] && (
          <StatCard key={id} label={label} value={byId[id].value} unit="%" delta={byId[id].chg_prev} />
        ))}
      </div>

      <div className="grid">
        <Card
          title={`${kind === "nominal" ? "NOMINELL" : "REAL (TIPS)"} KURVA`}
          right={<Toggle value={kind} onChange={setKind} options={[{ id: "nominal", label: "NOM" }, { id: "tips", label: "TIPS" }]} />}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={curve[kind]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="tenor" type="number" ticks={curve[kind].map((r) => r.tenor)} {...axis} unit="Y" />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} />
              <Tooltip content={<Tip unit="%" />} labelFormatter={(t) => `${t}Y`} />
              <Line dataKey="now" name="Nu" stroke={COLORS[0]} strokeWidth={2.5} />
              <Line dataKey="m1" name="−1M" stroke={COLORS[1]} strokeDasharray="4 3" />
              <Line dataKey="y1" name="−1Y" stroke={COLORS[8]} strokeDasharray="2 3" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="FÖRÄNDRING (BP)">
          <table className="table">
            <thead><tr><th>Serie</th><th>Nivå</th><th>1D</th><th>1M</th><th>1Y</th></tr></thead>
            <tbody>
              {latest.map((r) => (
                <tr key={r.series_id}>
                  <td title={r.label}><b>{r.series_id}</b></td>
                  <td>{r.value.toFixed(2)}</td>
                  {["chg_prev", "chg_m1", "chg_y1"].map((c) => (
                    <td key={c} className={r[c] > 0 ? "up" : r[c] < 0 ? "down" : ""}>{signed(r[c], 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {PANELS.map((p, i) => (
          <Card key={p.title} title={p.title} right={i === 0 && <Toggle value={years} onChange={setYears} options={RANGES} />}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={history} syncId="us-hist" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                <XAxis dataKey="date" ticks={xt} {...axis} />
                <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                <Tooltip content={<Tip />} />
                {p.zero && <ReferenceLine y={0} stroke="var(--muted)" />}
                {p.lines.map(([id, name], j) => (
                  <Line key={id} dataKey={id} name={name} stroke={COLORS[j]} dot={false} strokeWidth={1.5} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
    </div>
  );
}
