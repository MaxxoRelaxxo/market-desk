import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, StatCard, Status, Tip, Toggle } from "../components/ui";
import { COLORS, axis, dateLabel, fmt, signed, timeAxis, useData, withT } from "../lib";

const SHORT = {
  DGS2: "UST 2Y", DGS5: "UST 5Y", DGS7: "UST 7Y", DGS10: "UST 10Y", DGS30: "UST 30Y",
  DFII5: "TIPS 5Y", DFII7: "TIPS 7Y", DFII10: "TIPS 10Y", DFII30: "TIPS 30Y",
};
const PANELS = [
  { title: "TREASURY YIELDS (%)", lines: [["DGS2", "2Y"], ["DGS10", "10Y"], ["DGS30", "30Y"], ["DFII10", "TIPS 10Y"]] },
  { title: "CURVE SLOPE (PP)", lines: [["T10Y2Y", "10Y−2Y"], ["T10Y3M", "10Y−3M"]], zero: true },
  { title: "INFLATION EXPECTATIONS (%)", lines: [["T10YIE", "Breakeven 10Y"], ["T5YIFR", "5Y5Y fwd"]] },
  { title: "CREDIT SPREADS (%)", lines: [["BAMLC0A0CM", "IG OAS"], ["BAMLH0A0HYM2", "HY OAS"]] },
];
const RANGES = [{ id: 3, label: "3Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const CHANGES = [["chg_prev", "1D"], ["chg_w1", "1W"], ["chg_m1", "1M"], ["chg_y1", "1Y"]];

const shift = (iso, { months = 0, years = 0 }) => {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() - months - 12 * years);
  return d.toISOString().slice(0, 10);
};

/** Last row on or before `iso` (rows sorted by date). */
const asOf = (rows, iso) => {
  let lo = 0, hi = rows.length - 1, hit = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].date <= iso) { hit = rows[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return hit;
};

const TimeTip = (props) => <Tip {...props} label={props.label != null ? dateLabel(props.label) : ""} />;

export default function UsRatesSection() {
  const state = useData("us_rates.json");
  const [kind, setKind] = useState("nominal");
  const [years, setYears] = useState(10);
  const [dates, setDates] = useState(null);
  const [draft, setDraft] = useState("");

  const d = state.data;
  const history = useMemo(() => {
    const h = withT(d?.history ?? []);
    if (!h.length) return h;
    const cut = h[h.length - 1].t - years * 365.25 * 864e5;
    return h.filter((r) => r.t >= cut);
  }, [d, years]);

  if (!d) return <Status state={state} what="US rates" />;

  const ch = d.curve_history;
  const last = ch[ch.length - 1];
  const compare = dates ?? [shift(last.date, { months: 1 }), shift(last.date, { years: 1 })];
  const rows = compare.map((iso) => ({ iso, row: asOf(ch, iso) })).filter((x) => x.row);
  const tenors = Object.entries(d.tenors[kind]);
  const curve = tenors.map(([id, tenor]) => ({
    tenor, latest: last[id], ...Object.fromEntries(rows.map(({ iso, row }) => [iso, row[id]])),
  }));
  const add = () => {
    if (draft && !compare.includes(draft)) setDates([...compare, draft].sort().reverse());
    setDraft("");
  };

  return (
    <div>
      <div className="section-head">
        <h2>US RATES <span className="muted">| Treasuries & TIPS</span></h2>
        <div className="muted">Source: FRED · latest obs {last.date}</div>
      </div>

      <div className="stats">
        {d.latest.map((r) => (
          <StatCard key={r.series_id} label={SHORT[r.series_id]} value={r.value} unit="%" delta={r.chg_prev} />
        ))}
      </div>

      <div className="grid">
        <Card
          title={`${kind === "nominal" ? "NOMINAL" : "REAL (TIPS)"} CURVE · LATEST VS DATES`}
          right={<Toggle value={kind} onChange={setKind} options={[{ id: "nominal", label: "NOM" }, { id: "tips", label: "TIPS" }]} />}
        >
          <div className="date-bar">
            <input type="date" className="select" value={draft} max={last.date} min={ch[0].date}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="btn" onClick={add} disabled={!draft}>+ ADD</button>
            {compare.map((iso, i) => (
              <span key={iso} className="chip" style={{ borderColor: COLORS[i + 1] }}>
                {iso}
                <button onClick={() => setDates(compare.filter((x) => x !== iso))}>×</button>
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={curve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="tenor" type="number" domain={[0, 30]} ticks={tenors.map(([, t]) => t)} {...axis} unit="Y" />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} />
              <Tooltip content={<Tip unit="%" />} labelFormatter={(t) => `${t}Y`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="latest" name={`Latest ${last.date}`} stroke={COLORS[0]} strokeWidth={2.5} />
              {rows.map(({ iso }, i) => (
                <Line key={iso} dataKey={iso} name={iso} stroke={COLORS[i + 1]} strokeDasharray="4 3" />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="table-wrap"><table className="table">
            <thead>
              <tr>
                <th>Tenor</th><th>Latest</th>
                {rows.map(({ iso, row }) => <th key={iso} title={`obs ${row.date}`}>Δ vs {iso} (bp)</th>)}
              </tr>
            </thead>
            <tbody>
              {curve.map((c) => (
                <tr key={c.tenor}>
                  <td>{c.tenor}Y</td>
                  <td>{fmt(c.latest)}</td>
                  {rows.map(({ iso }) => {
                    const v = c.latest != null && c[iso] != null ? (c.latest - c[iso]) * 100 : null;
                    return <td key={iso} className={v > 0 ? "up" : v < 0 ? "down" : ""}>{signed(v, 0)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        <Card title="CHANGE (BP)" note="Treasury constant maturity (DGS) and TIPS real yields (DFII), FRED.">
          <div className="table-wrap"><table className="table">
            <thead>
              <tr><th>Series</th><th>ID</th><th>Level %</th>{CHANGES.map(([, l]) => <th key={l}>{l}</th>)}</tr>
            </thead>
            <tbody>
              {d.latest.map((r) => (
                <tr key={r.series_id}>
                  <td>{r.label.replace("Treasury Inflation-Protected Securities", "TIPS")}</td>
                  <td className="muted">{r.series_id}</td>
                  <td>{fmt(r.value)}</td>
                  {CHANGES.map(([c]) => (
                    <td key={c} className={r[c] > 0 ? "up" : r[c] < 0 ? "down" : ""}>{signed(r[c], 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        {PANELS.map((p, i) => {
          const data = history.filter((r) => p.lines.some(([id]) => r[id] != null));
          return (
            <Card key={p.title} title={p.title} right={i === 0 && <Toggle value={years} onChange={setYears} options={RANGES} />}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data} syncId="us-hist" margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(data)} />
                  <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                  <Tooltip content={<TimeTip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {p.zero && <ReferenceLine y={0} stroke="var(--muted)" />}
                  {p.lines.map(([id, name], j) => (
                    <Line key={id} dataKey={id} name={name} stroke={COLORS[j]} dot={false} strokeWidth={1.5} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
