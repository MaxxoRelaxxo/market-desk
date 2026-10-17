import { useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, StatCard, Status, Tip, Toggle } from "../components/ui";
import { COLORS, axis, dateLabel, fmt, signed, timeAxis, useData, withT } from "../lib";
import EgbSection from "./EgbSection";

const BLOCKS = [
  ["overview", "OVERVIEW"], ["development", "DEVELOPMENT"], ["curve", "CURVE"], ["egb", "EGB RV"], ["tp", "SE TERM PREMIUM"],
];
const US_SHORT = {
  DGS2: "UST 2Y", DGS5: "UST 5Y", DGS7: "UST 7Y", DGS10: "UST 10Y", DGS30: "UST 30Y",
  DFII5: "TIPS 5Y", DFII7: "TIPS 7Y", DFII10: "TIPS 10Y", DFII30: "TIPS 30Y",
};
const CHANGES = [["chg_prev", "1D"], ["chg_w1", "1W"], ["chg_m1", "1M"], ["chg_y1", "1Y"]];
const RANGES = [{ id: 3, label: "3Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const PANELS = [
  { src: "se", title: "SWEDEN · SGB YIELDS (%)", lines: [["SEGVB2YC", "2Y"], ["SEGVB5YC", "5Y"], ["SEGVB7YC", "7Y"], ["SEGVB10YC", "10Y"]] },
  { src: "se", title: "SWEDEN · CURVE (BP)", lines: [["s2s10", "10Y−2Y"], ["s5s10", "10Y−5Y"]], zero: true },
  { src: "egb", title: "EURO AREA · 10Y YIELDS (%)", span: 2 },
  { src: "us", title: "US · TREASURY NOMINAL (%)", lines: [["DGS2", "2Y"], ["DGS10", "10Y"], ["DGS30", "30Y"]] },
  { src: "us", title: "US · TIPS REAL (%)", lines: [["DFII5", "5Y"], ["DFII7", "7Y"], ["DFII10", "10Y"], ["DFII30", "30Y"]] },
  { src: "us", title: "US · CURVE (BP)", lines: [["T10Y2Y", "10Y−2Y"], ["T10Y3M", "10Y−3M"]], zero: true, mult: 100 },
  { src: "us", title: "US · INFLATION EXPECTATIONS (%)", lines: [["T10YIE", "Breakeven 10Y"], ["T5YIFR", "5Y5Y fwd"]] },
  { src: "us", title: "US · CREDIT SPREADS (%)", lines: [["BAMLC0A0CM", "IG OAS"], ["BAMLH0A0HYM2", "HY OAS"]] },
];
const TP_MATS = ["2Y", "5Y", "7Y", "10Y"];

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

const tenorLabel = (t) => (t < 1 ? `${Math.round(t * 12)}M` : `${t}Y`);
const chgCls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
const TimeTip = (props) => <Tip {...props} label={props.label != null ? dateLabel(props.label) : ""} />;

function Block({ id, title, sub, right, children }) {
  return (
    <section id={id} className="block">
      <div className="section-head">
        <h2>{title} {sub && <span className="muted">| {sub}</span>}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// ============================================================ OVERVIEW

function Overview({ se, us, egb }) {
  const markets = [
    ["SWEDEN", se?.latest, (r) => r.label],
    ["EURO AREA 10Y", egb?.yields_latest, (r) => r.label],
    ["UNITED STATES", us?.latest, (r) => US_SHORT[r.series_id]],
  ].filter(([, rows]) => rows);

  return (
    <Block id="overview" title="RATES" sub="Sweden · Euro area · US">
      {markets.map(([m, rows, label]) => (
        <div key={m}>
          <div className="stats-label">{m}</div>
          <div className="stats">
            {rows.map((r) => <StatCard key={r.series_id} label={label(r)} value={r.value} unit="%" delta={r.chg_prev} />)}
          </div>
        </div>
      ))}
      <Card title="LEVELS, CHANGES (BP) & RANGE"
        note="Change vs previous obs / 1W / 1M / 1Y. 1Y range: low–high and where today sits. 5Y pct: share of the last 5 years with a level at or below today.">
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Series</th><th>Obs</th><th>Level %</th>{CHANGES.map(([, l]) => <th key={l}>{l}</th>)}
              <th>1Y low</th><th>1Y range</th><th>1Y high</th><th>5Y pct</th>
            </tr>
          </thead>
          <tbody>
            {markets.flatMap(([m, rows, label]) => [
              <tr key={m} className="group"><td colSpan={12}>{m}</td></tr>,
              ...rows.map((r) => {
                const pos = r.hi_1y > r.lo_1y ? (r.value - r.lo_1y) / (r.hi_1y - r.lo_1y) : 0.5;
                return (
                  <tr key={`${m}-${r.series_id}`}>
                    <td>{label(r)}</td>
                    <td className="muted">{r.date}</td>
                    <td>{fmt(r.value)}</td>
                    {CHANGES.map(([c]) => <td key={c} className={chgCls(r[c])}>{signed(r[c], 0)}</td>)}
                    <td className="muted">{fmt(r.lo_1y)}</td>
                    <td><div className="range"><span style={{ left: `${pos * 100}%` }} /></div></td>
                    <td className="muted">{fmt(r.hi_1y)}</td>
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

function Development({ se, us, egb }) {
  const [years, setYears] = useState(10);
  const hist = useMemo(() => {
    const cut = (rows) => {
      const h = withT(rows ?? []);
      if (!h.length) return h;
      const t0 = h[h.length - 1].t - years * 365.25 * 864e5;
      return h.filter((r) => r.t >= t0);
    };
    return { se: cut(se?.history), us: cut(us?.history), egb: cut(egb?.yields) };
  }, [se, us, egb, years]);
  const egbLines = egb ? egb.yields_latest.map((r) => [r.series_id, r.series_id]) : [];

  return (
    <Block id="development" title="DEVELOPMENT" sub="weekly"
      right={<Toggle value={years} onChange={setYears} options={RANGES} />}>
      <div className="grid">
        {PANELS.map((p) => {
          const lines = p.lines ?? egbLines;
          const m = p.mult ?? 1;
          const data = hist[p.src]
            .filter((r) => lines.some(([id]) => r[id] != null))
            .map((r) => (m === 1 ? r : { ...r, ...Object.fromEntries(lines.map(([id]) => [id, r[id] == null ? null : r[id] * m])) }));
          if (!data.length) return null;
          return (
            <Card key={p.title} title={p.title} span={p.span}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(data)} />
                  <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                  <Tooltip content={<TimeTip digits={p.zero ? 0 : 2} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {p.zero && <ReferenceLine y={0} stroke="var(--muted)" />}
                  {lines.map(([id, name], j) => (
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

// ============================================================ CURVE ANALYSIS

function CurveAnalysis({ curves }) {
  const codes = Object.keys(curves ?? {});
  const [code, setCode] = useState(codes[0]);
  const [dates, setDates] = useState(null);
  const [draft, setDraft] = useState("");
  const c = curves?.[code] ?? curves?.[codes[0]];
  if (!c) return null;
  const tenors = Object.entries(c.tenors);
  const ch = c.history;
  const last = ch[ch.length - 1];
  const compare = dates ?? [shift(last.date, { months: 1 }), shift(last.date, { years: 1 })];
  const rows = compare.map((iso) => ({ iso, row: asOf(ch, iso) })).filter((x) => x.row);
  const curve = tenors.map(([id, tenor]) => ({
    id, tenor, latest: last[id], ...Object.fromEntries(rows.map(({ iso, row }) => [iso, row[id]])),
  }));
  const at = (t) => curve.find((x) => x.tenor === t)?.latest;
  const add = () => {
    if (draft && !compare.includes(draft)) setDates([...compare, draft].sort().reverse());
    setDraft("");
  };

  // Spreads/fly on the curve's own points, latest vs comparison dates
  const pts = curve.map((x) => x.tenor);
  const lo = pts[0], hi = Math.max(...pts), mid = pts.includes(5) ? 5 : null, ten = pts.includes(10) ? 10 : hi;
  const shape = (get) => ({
    slope: (get(hi) - get(lo)) * 100,
    fly: mid != null ? (2 * get(mid) - get(lo) - get(ten)) * 100 : null,
  });
  const shapeRows = [
    { label: `Latest ${last.date}`, ...shape(at) },
    ...rows.map(({ iso, row }) => ({ label: iso, ...shape((t) => row[curve.find((x) => x.tenor === t).id]) })),
  ];

  return (
    <Block id="curve" title="CURVE ANALYSIS" sub="government bonds · latest vs dates"
      right={<Toggle value={code} onChange={setCode} options={codes.map((k) => ({ id: k, label: curves[k].name.toUpperCase() }))} />}>
      <div className="grid">
        <Card title={`${c.name.toUpperCase()} · GOVERNMENT CURVE (%)`}>
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
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={curve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="tenor" type="number" domain={[0, hi]} ticks={pts} tickFormatter={tenorLabel} {...axis} />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} />
              <Tooltip content={<Tip unit="%" />} labelFormatter={tenorLabel} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="latest" name={`Latest ${last.date}`} stroke={COLORS[0]} strokeWidth={2.5} />
              {rows.map(({ iso }, i) => (
                <Line key={iso} dataKey={iso} name={iso} stroke={COLORS[i + 1]} strokeDasharray="4 3" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="CHANGE VS DATES (BP)"
          note={`Slope = ${tenorLabel(hi)} − ${tenorLabel(lo)}${mid != null ? `, fly = 2·${tenorLabel(mid)} − ${tenorLabel(lo)} − ${tenorLabel(ten)}` : ""}. Δ > 0 = steeper / cheaper belly.`}>
          <div className="table-wrap"><table className="table">
            <thead>
              <tr>
                <th>Tenor</th><th>Latest</th>
                {rows.map(({ iso, row }) => <th key={iso} title={`obs ${row.date}`}>Δ vs {iso}</th>)}
              </tr>
            </thead>
            <tbody>
              {curve.map((x) => (
                <tr key={x.tenor}>
                  <td>{tenorLabel(x.tenor)}</td>
                  <td>{fmt(x.latest)}</td>
                  {rows.map(({ iso }) => {
                    const v = x.latest != null && x[iso] != null ? (x.latest - x[iso]) * 100 : null;
                    return <td key={iso} className={chgCls(v)}>{signed(v, 0)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="table-wrap" style={{ marginTop: 10 }}><table className="table">
            <thead><tr><th>Shape (bp)</th><th>Slope</th>{mid != null && <th>Fly</th>}</tr></thead>
            <tbody>
              {shapeRows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td><td>{fmt(r.slope, 0)}</td>{mid != null && <td>{fmt(r.fly, 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>
    </Block>
  );
}

// ============================================================ SE TERM PREMIUM (ACM)

function TermPremium({ se }) {
  const [hidden, setHidden] = useState({});
  const a = se?.acm;
  const decomp = useMemo(() => withT(a?.decomp ?? []).map((r) => ({ ...r, band: [r.risk_neutral, r.fitted] })), [a]);
  const tp = useMemo(() => withT(a?.tp ?? []), [a]);
  if (!a) return null;

  const { latest: l, y1 } = a;
  const d1y = (k) => (l[k] - y1[k]) * 100;
  const toggle = (e) => setHidden((h) => ({ ...h, [e.dataKey]: !h[e.dataKey] }));

  return (
    <Block id="tp" title="SWEDISH TERM PREMIUM" sub={`ACM (2013) · ${a.k} PCs · monthly ${a.start.slice(0, 7)}–${a.asof.slice(0, 7)}`}>
      <div className="stats">
        <StatCard label="SGB 10Y observed" value={l.observed} unit="%" delta={d1y("observed")} deltaUnit="bp 1Y" />
        <StatCard label="10Y model fit" value={l.fitted} unit="%" delta={d1y("fitted")} deltaUnit="bp 1Y" />
        <StatCard label="10Y risk-neutral" value={l.risk_neutral} unit="%" delta={d1y("risk_neutral")} deltaUnit="bp 1Y" />
        <StatCard label="10Y term premium" value={l.term_premium} unit="%" delta={d1y("term_premium")} deltaUnit="bp 1Y" />
        {TP_MATS.slice(0, -1).map((m) => <StatCard key={m} label={`${m} term premium`} value={a.tp_latest[m]} unit="%" />)}
      </div>
      <div className="grid">
        <Card title="SGB 10Y DECOMPOSITION (%)" span={2}
          note="Model yield = risk-neutral (expected average short rate) + term premium (shaded). Observed − model = pricing error.">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={decomp} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis {...timeAxis(decomp)} />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} />
              <Tooltip content={<TimeTip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Area dataKey="band" name="Term premium band" stroke="none" fill={COLORS[1]} fillOpacity={0.25} legendType="square" tooltipType="none" />
              <Line dataKey="observed" name="Observed" stroke={COLORS[0]} dot={false} strokeWidth={1.8} />
              <Line dataKey="risk_neutral" name="Risk-neutral" stroke={COLORS[1]} dot={false} strokeWidth={1.5} />
              <Line dataKey="term_premium" name="Term premium" stroke={COLORS[2]} dot={false} strokeWidth={1.5} strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="TERM PREMIUM BY MATURITY (%)" note="Click a legend item to hide/show.">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={tp} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis {...timeAxis(tp)} />
              <YAxis {...axis} width={40} domain={["auto", "auto"]} />
              <Tooltip content={<TimeTip />} />
              <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }} onClick={toggle} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              {TP_MATS.map((m, i) => (
                <Line key={m} dataKey={m} name={m} hide={hidden[m]} stroke={COLORS[i]} dot={false} strokeWidth={m === "10Y" ? 2 : 1.3} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="PRICING ERRORS (BP)" note={`Observed − model yield, ${a.n_obs} monthly obs. Small, unbiased errors = the 3-factor model prices the curve.`}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Maturity</th><th>Mean</th><th>Std</th></tr></thead>
            <tbody>
              {a.errors.map((r) => (
                <tr key={r.maturity_m}>
                  <td>{tenorLabel(r.maturity_m / 12)}</td><td>{signed(r.mean_bp, 1)}</td><td>{fmt(r.sd_bp, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>
      <div className="info">
        <b>Model</b>
        <p>
          Month-end SWEA T-bills (1M, 3M, 6M) and SGB benchmarks (2Y, 5Y, 7Y, 10Y), PCHIP-interpolated to 1–120 months.
          Factors = first {a.k} yield PCs. (1) VAR(1) on factors, (2) excess returns on factor innovations and lagged factors,
          (3) prices of risk λ₀, λ₁ by cross-sectional regression. Risk-neutral yields use the same recursion with λ = 0;
          term premium = model − risk-neutral. 1M T-bill gaps are filled with the policy rate.
        </p>
      </div>
    </Block>
  );
}

// ============================================================ PAGE

export default function RatesPage() {
  const se = useData("se_rates.json");
  const us = useData("us_rates.json");
  const egb = useData("egb.json");
  const curves = useData("curves.json");
  const states = [[se, "Swedish rates"], [egb, "EGB data"], [us, "US rates"], [curves, "curves"]];
  if (states.every(([s]) => !s.data)) return <Status state={se.error ? se : us} what="rates" />;
  const args = { se: se.data, us: us.data, egb: egb.data, curves: curves.data };

  return (
    <div>
      <nav className="subnav">
        {BLOCKS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        }}>{label}</a>)}
      </nav>
      {states.filter(([s]) => s.error).map(([, what]) => <Status key={what} state={{ error: true }} what={what} />)}
      <Overview {...args} />
      <Development {...args} />
      <CurveAnalysis {...args} />
      {egb.data && <section id="egb" className="block"><EgbSection /></section>}
      <TermPremium {...args} />
    </div>
  );
}
