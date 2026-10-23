import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Block, Card, StatCard, Status, SubNav, TimeTip, Toggle, chgCls, useSpy } from "../components/ui";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const BLOCKS = [["overview", "OVERVIEW"], ["development", "DEVELOPMENT"], ["fundamentals", "HYPERSCALERS VS SEMIS"]];
const CHANGES = [["chg_prev", "1D"], ["chg_w1", "1W"], ["chg_m1", "1M"], ["chg_ytd", "YTD"], ["chg_y1", "1Y"]];
const RANGES = [{ id: "ytd", label: "YTD" }, { id: 1, label: "1Y" }, { id: 3, label: "3Y" }, { id: 5, label: "5Y" }, { id: 10, label: "10Y" }];
const FUND_RANGES = [{ id: 3, label: "3Y" }, { id: 5, label: "5Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const GLOBAL = ["^GSPC", "^STOXX50E", "^OMX", "^N225", "^HSI"];
const METRICS = [["ni", "Net income", undefined], ["fcf", "FCF", "5 3"]];
const YEAR = 365.25 * 864e5;
const digits = (v) => (v >= 1000 ? 0 : 2);

// ============================================================ OVERVIEW

function Overview({ d }) {
  const spark = (id) => d.history.slice(-52).map((r) => r[id]).filter((v) => v != null);
  const rows = (ids) => ids.map((id) => d.latest.find((r) => r.series_id === id)).filter(Boolean);

  return (
    <Block id="overview" title="EQUITY" sub="global indices · local currency" hero
      right={<span className="asof">As of {d.asof}</span>}>
      {Object.entries(d.regions).map(([region, ids]) => (
        <div key={region}>
          <div className="stats-label">{region.toUpperCase()}</div>
          <div className="stats">
            {rows(ids).map((r) => (
              <StatCard key={r.series_id} label={r.label} value={r.value} digits={digits(r.value)}
                delta={r.chg_prev} deltaUnit="%" deltaDigits={2} spark={spark(r.series_id)} />
            ))}
          </div>
        </div>
      ))}
      <Card title="LEVELS, CHANGES (%) & RANGE"
        note="Price indices in local currency (DAX is a total return index). Change vs previous close / 1W / 1M / last close of previous year (YTD) / 1Y. 1Y range: low–high and where today sits. 5Y pct: share of the last 5 years with a level at or below today. Yahoo Finance daily closes.">
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Index</th><th>Obs</th><th>Level</th>{CHANGES.map(([, l]) => <th key={l}>{l}</th>)}
              <th>1Y low</th><th>1Y range</th><th>1Y high</th><th>5Y pct</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(d.regions).flatMap(([region, ids]) => [
              <tr key={region} className="group"><td colSpan={13}>{region.toUpperCase()}</td></tr>,
              ...rows(ids).map((r) => {
                const pos = r.hi_1y > r.lo_1y ? (r.value - r.lo_1y) / (r.hi_1y - r.lo_1y) : 0.5;
                const n = digits(r.value);
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
  const [range, setRange] = useState(1);
  const panels = [
    ...Object.entries(d.regions).filter(([r]) => r !== "Volatility").map(([r, ids]) => [r.toUpperCase(), ids]),
    ["GLOBAL", GLOBAL.filter((id) => d.labels[id])],
  ];
  const ids = panels.flatMap(([, x]) => x);
  // Weekly closes rebased to 100 at the first obs in the window (YTD: last obs of the previous year)
  const data = useMemo(() => {
    const h = withT(d.history);
    const last = h[h.length - 1].t;
    const t0 = range === "ytd" ? Date.UTC(new Date(last).getUTCFullYear(), 0, 1) : last - range * YEAR;
    const i = h.findIndex((r) => r.t >= t0);
    const w = h.slice(Math.max(0, range === "ytd" ? i - 1 : i));
    const base = Object.fromEntries(ids.map((id) => [id, w.find((r) => r[id] != null)?.[id]]));
    return w.map((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, r[id] == null ? null : (r[id] / base[id]) * 100])) }));
  }, [d, range]);

  return (
    <Block id="development" title="DEVELOPMENT" sub="weekly · rebased to 100 · local currency"
      right={<Toggle value={range} onChange={setRange} options={RANGES} />}>
      <div className="grid">
        {panels.map(([title, pids]) => (
          <Card key={title} title={title}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                <XAxis {...timeAxis(data)} />
                <YAxis {...axis} width={40} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 0)} />
                <Tooltip content={<TimeTip digits={1} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={100} stroke="var(--muted)" />
                {pids.map((id, j) => (
                  <Line key={id} dataKey={id} name={d.labels[id]} stroke={COLORS[j % COLORS.length]} dot={false} strokeWidth={1.5} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
    </Block>
  );
}

// ============================================================ FUNDAMENTALS

function Fundamentals({ f }) {
  const [years, setYears] = useState(10);
  const baskets = Object.keys(f.baskets);
  const key = (b, m) => `${b}_${m}`;
  const rows = useMemo(() => {
    const by = {};
    f.ttm.forEach((r) => {
      by[r.date] ??= { date: r.date };
      METRICS.forEach(([m]) => (by[r.date][key(r.basket, m)] = r[m]));
    });
    return withT(Object.values(by).sort((a, b) => a.date.localeCompare(b.date)));
  }, [f]);
  const data = rows.filter((r) => r.t >= rows[rows.length - 1].t - years * YEAR);
  // Latest complete quarter per basket and its TTM one year earlier
  const latest = (b) => {
    const h = f.ttm.filter((r) => r.basket === b);
    const r = h[h.length - 1];
    return r && { ...r, y1: h.find((x) => x.date === `${+r.date.slice(0, 4) - 1}${r.date.slice(4)}`) };
  };
  const yoy = (r, m) => (r.y1?.[m] > 0 ? (r[m] / r.y1[m] - 1) * 100 : null);

  return (
    <Block id="fundamentals" title="HYPERSCALERS VS SEMIS" sub="net income & free cash flow · TTM · USD bn"
      right={<Toggle value={years} onChange={setYears} options={FUND_RANGES} />}>
      {baskets.map((b) => {
        const r = latest(b);
        return r && (
          <div key={b}>
            <div className="stats-label">{b.toUpperCase()}<span className="muted">{f.baskets[b] && Object.keys(f.baskets[b]).join(" · ")}</span></div>
            <div className="stats">
              {METRICS.map(([m, name]) => (
                <StatCard key={m} label={`${name} · TTM ${r.date.slice(0, 7)}`} value={r[m]} digits={0} unit="bn"
                  delta={yoy(r, m)} deltaUnit="% YoY" deltaDigits={1} />
              ))}
              <StatCard label="Capex · TTM" value={r.capex} digits={0} unit="bn" delta={yoy(r, "capex")} deltaUnit="% YoY" deltaDigits={1} />
            </div>
          </div>
        );
      })}
      <Card title="NET INCOME VS FREE CASH FLOW (TTM, USD BN)"
        note="Sum over the basket, quarters where every member has reported (latest quarter waits for the last reporter). FCF = operating cash flow − purchases of PP&E. Solid: net income, dashed: FCF. A widening gap = cash going into capex. Fiscal quarters mapped to the calendar quarter of their midpoint.">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
            <XAxis {...timeAxis(data)} />
            <YAxis {...axis} width={44} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 0)} />
            <Tooltip content={<TimeTip digits={0} unit=" bn" />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="var(--muted)" />
            {baskets.flatMap((b, j) => METRICS.map(([m, name, dash]) => (
              <Line key={key(b, m)} dataKey={key(b, m)} name={`${b} ${name}`} stroke={COLORS[j % COLORS.length]}
                strokeDasharray={dash} strokeWidth={1.6} dot={false} connectNulls />
            )))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="BY COMPANY (TTM, USD BN)"
        note="Latest reported fiscal quarter per company (SEC 10-K/10-Q XBRL, as filed incl. restatements). FCF/NI = cash conversion. YoY vs TTM one year earlier; blank when the base is ≤ 0.">
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Company</th><th>Quarter end</th><th>Net income</th><th>NI YoY %</th><th>OCF</th><th>Capex</th>
              <th>FCF</th><th>FCF YoY %</th><th>FCF / NI %</th>
            </tr>
          </thead>
          <tbody>
            {baskets.flatMap((b) => [
              <tr key={b} className="group"><td colSpan={9}>{b.toUpperCase()}</td></tr>,
              ...f.companies.filter((r) => r.basket === b).map((r) => (
                <tr key={r.ticker}>
                  <td>{r.ticker}</td>
                  <td className="muted">{r.end}</td>
                  <td>{fmt(r.ni, 1)}</td>
                  <td className={chgCls(r.ni_yoy)}>{signed(r.ni_yoy, 0)}</td>
                  <td>{fmt(r.ocf, 1)}</td>
                  <td>{fmt(r.capex, 1)}</td>
                  <td>{fmt(r.fcf, 1)}</td>
                  <td className={chgCls(r.fcf_yoy)}>{signed(r.fcf_yoy, 0)}</td>
                  <td>{fmt(r.conv, 0)}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table></div>
      </Card>
    </Block>
  );
}

// ============================================================ PAGE

export default function EquityPage() {
  const s = useData("equity.json");
  const current = useSpy(BLOCKS.map(([id]) => id), !!s.data);
  if (!s.data) return <Status state={s} what="equity" />;
  const d = s.data;

  return (
    <div>
      <SubNav blocks={BLOCKS} current={current} />
      <Overview d={d} />
      <Development d={d} />
      {d.fundamentals
        ? <Fundamentals f={d.fundamentals} />
        : <section id="fundamentals" className="block"><div className="info"><b>No fundamentals yet.</b> Run <code>save_sec_parquet()</code> (SEC EDGAR), then <code>scripts/build_data.py equity</code>.</div></section>}
    </div>
  );
}
