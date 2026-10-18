import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Block, Card, StatCard, Status, SubNav, TimeTip, Toggle, chgCls, useSpy } from "../components/ui";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const BLOCKS = [["overview", "OVERVIEW"], ["development", "DEVELOPMENT"], ["g10", "G10 MATRIX"], ["ppp", "SEK PPP"]];
const SHORT = { "BZ=F": "Brent", "CL=F": "WTI", "GC=F": "Gold", "SI=F": "Silver", "HG=F": "Copper" };
const DIGITS = { "USD/SEK": 4, "EUR/SEK": 4, "EUR/USD": 4, "USD/JPY": 2, "GC=F": 1, "HG=F": 3 };
const CHANGES = [["chg_prev", "1D"], ["chg_w1", "1W"], ["chg_m1", "1M"], ["chg_ytd", "YTD"], ["chg_y1", "1Y"]];
const RANGES = [{ id: 1, label: "1Y" }, { id: 3, label: "3Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const PANELS = [
  { src: "fx", title: "USD/SEK", lines: [["USD/SEK", "USD/SEK"]] },
  { src: "fx", title: "EUR/SEK", lines: [["EUR/SEK", "EUR/SEK"]] },
  { src: "fx", title: "EUR/USD", lines: [["EUR/USD", "EUR/USD"]] },
  { src: "fx", title: "USD/JPY", lines: [["USD/JPY", "USD/JPY"]] },
  { src: "comm", title: "OIL ($/BBL)", lines: [["BZ=F", "Brent"], ["CL=F", "WTI"]] },
  { src: "comm", title: "GOLD ($/OZ)", lines: [["GC=F", "Gold"]] },
  { src: "comm", title: "SILVER ($/OZ)", lines: [["SI=F", "Silver"]] },
  { src: "comm", title: "COPPER ($/LB)", lines: [["HG=F", "Copper"]] },
];
const HORIZONS = [
  { id: "latest", label: "LEVEL" }, { id: "prev", label: "1D" }, { id: "w1", label: "1W" },
  { id: "m1", label: "1M" }, { id: "ytd", label: "YTD" }, { id: "y1", label: "1Y" },
];
const label = (r) => SHORT[r.series_id] ?? r.label;
const digits = (id) => DIGITS[id] ?? 2;

// ============================================================ OVERVIEW

function Overview({ d }) {
  const groups = [
    ["FX", d.fx_latest, d.fx, "(Riksbank fixings)"],
    ["COMMODITIES", d.comm_latest, d.comm, "(front-month futures, USD)"],
  ];
  const spark = (hist, id) => hist.slice(-52).map((r) => r[id]).filter((v) => v != null);

  return (
    <Block id="overview" title="FX & COMMODITIES" sub="SEK · G10 · oil & metals" hero
      right={<span className="asof">As of {d.asof}</span>}>
      {groups.map(([g, rows, hist, note]) => (
        <div key={g}>
          <div className="stats-label">{g}<span className="muted">{note}</span></div>
          <div className="stats">
            {rows.map((r) => (
              <StatCard key={r.series_id} label={label(r)} value={r.value} digits={digits(r.series_id)}
                delta={r.chg_prev} deltaUnit="%" deltaDigits={2} spark={spark(hist, r.series_id)} />
            ))}
          </div>
        </div>
      ))}
      <Card title="LEVELS, CHANGES (%) & RANGE"
        note="Change vs previous obs / 1W / 1M / last obs of previous year (YTD) / 1Y. 1Y range: low–high and where today sits. 5Y pct: share of the last 5 years with a level at or below today. EUR/USD and USD/JPY are crosses of the Riksbank SEK fixings. Commodities are continuous front-month futures (Yahoo Finance); rolls can cause jumps.">
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Series</th><th>Obs</th><th>Level</th>{CHANGES.map(([, l]) => <th key={l}>{l}</th>)}
              <th>1Y low</th><th>1Y range</th><th>1Y high</th><th>5Y pct</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap(([g, rows]) => [
              <tr key={g} className="group"><td colSpan={13}>{g}</td></tr>,
              ...rows.map((r) => {
                const pos = r.hi_1y > r.lo_1y ? (r.value - r.lo_1y) / (r.hi_1y - r.lo_1y) : 0.5;
                const n = digits(r.series_id);
                return (
                  <tr key={r.series_id}>
                    <td>{r.label}</td>
                    <td className="muted">{r.date}</td>
                    <td>{fmt(r.value, n)}</td>
                    {CHANGES.map(([c]) => <td key={c} className={chgCls(r[c])}>{signed(r[c], 2)}</td>)}
                    <td className="muted">{fmt(r.lo_1y, n)}</td>
                    <td><div className="range"><span style={{ left: `${pos * 100}%` }} /></div></td>
                    <td className="muted">{fmt(r.hi_1y, n)}</td>
                    <td>{fmt(r.pct_5y, 0)}</td>
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

// ============================================================ DEVELOPMENT

function Development({ d }) {
  const [years, setYears] = useState(3);
  const hist = useMemo(() => {
    const cut = (rows) => {
      const h = withT(rows);
      const t0 = h[h.length - 1].t - years * 365.25 * 864e5;
      return h.filter((r) => r.t >= t0);
    };
    return { fx: cut(d.fx), comm: cut(d.comm) };
  }, [d, years]);

  return (
    <Block id="development" title="DEVELOPMENT" sub="weekly"
      right={<Toggle value={years} onChange={setYears} options={RANGES} />}>
      <div className="grid">
        {PANELS.map((p) => {
          const data = hist[p.src].filter((r) => p.lines.some(([id]) => r[id] != null));
          const n = digits(p.lines[0][0]);
          return (
            <Card key={p.title} title={p.title}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(data)} />
                  <YAxis {...axis} width={48} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, Math.min(n, 2))} />
                  <Tooltip content={<TimeTip digits={n} />} />
                  {p.lines.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {p.lines.map(([id, name], j) => (
                    <Line key={id} dataKey={id} name={name} stroke={COLORS[j % COLORS.length]} dot={false} strokeWidth={1.5} connectNulls />
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

// ============================================================ G10 MATRIX

function Matrix({ g10 }) {
  const [h, setH] = useState("m1");
  const { ccys, spot } = g10;
  const now = spot.latest, then = spot[h];
  const level = h === "latest";
  // Cell (row b, col q) = units of q per 1 b. Change > 0 = row currency stronger vs column.
  const value = (b, q) => (level ? now[b] / now[q] : ((now[b] / now[q]) / (then[b] / then[q]) - 1) * 100);
  const avg = (b) => ccys.filter((q) => q !== b).reduce((s, q) => s + value(b, q), 0) / (ccys.length - 1);
  const max = level ? 1 : Math.max(...ccys.flatMap((b) => ccys.map((q) => Math.abs(value(b, q))))) || 1;
  const heat = (v) => (level || v == null ? undefined : {
    background: `rgba(${v > 0 ? "74, 222, 128" : "248, 113, 113"}, ${(0.06 + (0.5 * Math.abs(v)) / max).toFixed(2)})`,
  });

  return (
    <Block id="g10" title="G10 MATRIX" sub={level ? `cross rates · ${now.date}` : `% change · ${then.date} → ${now.date}`}
      right={<Toggle value={h} onChange={setH} options={HORIZONS} />}>
      <Card title={level ? "CROSS RATES: COLUMN PER 1 ROW" : "ROW VS COLUMN (%)"}
        note={level
          ? "Units of the column currency per 1 unit of the row currency (row EUR, column USD = EUR/USD). Crosses of the Riksbank SEK fixings."
          : "% change of row/column over the horizon. Green = row currency stronger vs the column. Avg = row vs the other nine, equal weight (a G10 strength ranking)."}>
        <div className="table-wrap"><table className="table matrix">
          <thead>
            <tr><th />{ccys.map((q) => <th key={q}>{q}</th>)}{!level && <th>Avg</th>}</tr>
          </thead>
          <tbody>
            {ccys.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                {ccys.map((q) => {
                  if (q === b) return <td key={q} className="diag">—</td>;
                  const v = value(b, q);
                  return <td key={q} style={heat(v)}>{level ? v.toPrecision(5) : signed(v, 2)}</td>;
                })}
                {!level && <td className={`avg ${chgCls(avg(b))}`}>{signed(avg(b), 2)}</td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </Block>
  );
}

// ============================================================ SEK PPP

function Ppp({ ppp }) {
  const hist = useMemo(() => withT(ppp.history), [ppp]);
  const [b0, b1] = ppp.base.map((x) => x.slice(0, 4));

  return (
    <Block id="ppp" title="SEK VS PPP" sub={`relative PPP · CPI · base ${b0}–${b1}`}>
      <div className="grid">
        <Card title="SEK MISVALUATION VS PPP (%)" span={2} note="> 0 = SEK overvalued, < 0 = SEK undervalued vs its PPP-implied rate. Weekly.">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hist} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis {...timeAxis(hist)} />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} />
              <Tooltip content={<TimeTip digits={1} unit="%" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              {ppp.ccys.map((c, i) => (
                <Line key={c} dataKey={`${c}_dev`} name={`vs ${c}`} stroke={COLORS[i]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="info">
        <b>Model</b>
        <p>
          Relative PPP: fair CCY/SEK = average spot over {b0}–{b1} × (CPI Sweden / its base average) ÷ (CPI foreign / its base average).
          Misvaluation = fair ÷ spot − 1. CPI: HICP for Sweden, the euro area and Norway, CPI-U for the US (monthly, FRED),
          carried forward to the daily Riksbank fixing. The level depends on the base period: it assumes SEK was fairly valued on average then.
        </p>
      </div>
    </Block>
  );
}

// ============================================================ PAGE

export default function FxPage() {
  const s = useData("fx.json");
  const current = useSpy(BLOCKS.map(([id]) => id), !!s.data);
  if (!s.data) return <Status state={s} what="FX & commodities" />;
  const d = s.data;

  return (
    <div>
      <SubNav blocks={BLOCKS} current={current} />
      <Overview d={d} />
      <Development d={d} />
      <Matrix g10={d.g10} />
      <Ppp ppp={d.ppp} />
    </div>
  );
}
