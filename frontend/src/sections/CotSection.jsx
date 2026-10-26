import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Block, Card, StatCard, Status, Toggle, chgCls } from "../components/ui";
import { COLORS, DOWN, UP, axis, dateLabel, fmt, signed, timeAxis, useData } from "../lib";

const RANGES = [{ id: 3, label: "3Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const UNITS = [{ id: "k", label: "K CONTRACTS" }, { id: "oi", label: "% OI" }];
const SMOOTH = [{ id: 1, label: "WEEKLY" }, { id: 4, label: "4W MA" }];
const VIEWS = [{ id: "price", label: "NET VS PRICE" }, { id: "gross", label: "LONG / SHORT" }, { id: "all", label: "ALL GROUPS" }];
const SHORT = { noncomm: "NON-COMM", lev_money: "LEV FUNDS", asset_mgr: "ASSET MGRS", dealer: "DEALERS", other: "OTHER", nonrept: "NON-REPT" };
const HEADLINE = { noncomm: ["NON-COMMERCIALS", "Non-comm"], lev_money: ["LEVERAGED FUNDS", "Lev funds"], asset_mgr: ["ASSET MANAGERS", "Asset managers"] };
const HIDDEN = { other: true, nonrept: true };
const NOTES = {
  price: "Net of the selected group (area, left) vs the front-month future (line, right). Dashed: 3Y mean ± 2σ of net = positioning extremes, contrarian zone.",
  gross: "Gross long and short of the selected group (both positive) and net (dashed): shows whether a net change is new longs or short covering.",
  all: "Net by trader group. Click a legend item to hide/show.",
};

/** Columnar history -> rows with long_/short_ in the chosen unit, smoothed over `ma` weeks, plus net per group. */
function prepare(h, groups, unit, ma) {
  const keys = groups.flatMap((g) => [`long_${g}`, `short_${g}`]);
  const raw = h.date.map((date, i) => ({
    date, t: Date.parse(date), price: h.price?.[i] ?? null,
    ...Object.fromEntries(keys.map((k) => {
      const v = h[k][i];
      return [k, v == null ? null : unit === "k" ? v / 1e3 : (v / h.oi[i]) * 100];
    })),
  }));
  return raw.map((r, i) => {
    const w = raw.slice(Math.max(0, i - ma + 1), i + 1);
    const s = ma > 1 ? Object.fromEntries(keys.map((k) => [k, w.length < ma ? null : w.reduce((a, x) => a + x[k], 0) / ma])) : {};
    const x = { ...r, ...s };
    return { ...x, ...Object.fromEntries(groups.map((g) => [g, x[`long_${g}`] == null ? null : x[`long_${g}`] - x[`short_${g}`]])) };
  });
}

function CotTip({ active, payload, label, digits, pxDigits }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      <div className="tt-label">{dateLabel(label)}</div>
      {payload.filter((p) => typeof p.value === "number").map((p) => (
        <div key={p.dataKey} className="tt-row">
          <span className="tt-dot" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="tt-name">{p.name}</span>
          <span className="tt-val">{fmt(p.value, p.dataKey === "price" ? pxDigits : digits)}</span>
        </div>
      ))}
    </div>
  );
}

/** CFTC TFF positioning for `contracts`, from cot.json: net vs price, gross long/short, all groups. */
export default function CotSection({ contracts, note }) {
  const s = useData("cot.json");
  const [view, setView] = useState("price");
  const [group, setGroup] = useState("lev_money");
  const [years, setYears] = useState(3);
  const [unit, setUnit] = useState("k");
  const [ma, setMa] = useState(1);
  const [hidden, setHidden] = useState(HIDDEN);
  const d = s.data;
  const series = useMemo(() => Object.fromEntries(contracts.map((c) => {
    const h = d?.history[c];
    if (!h?.date.length) return [c, null];
    const rows = prepare(h, Object.keys(d.groups), unit, ma);
    const t0 = rows[rows.length - 1].t - years * 365.25 * 864e5;
    // Extremes: 3Y mean ± 2σ of the selected group's net, as plotted (unit, smoothing)
    const v = rows.slice(-d.window).map((r) => r[group]).filter((x) => x != null);
    const mean = v.reduce((a, x) => a + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1));
    return [c, { rows: rows.filter((r) => r.t >= t0), mean, sd }];
  })), [d, contracts, years, unit, ma, group]);
  if (!d) return <section id="cot" className="block"><Status state={s} what="CFTC positioning" /></section>;

  const groups = Object.entries(d.groups);
  const latest = (c) => groups.map(([g]) => d.latest.find((r) => r.contract === c && r.group === g)).filter(Boolean);
  const spark = (c, g) => {
    const h = d.history[c], short = h?.[`short_${g}`].slice(-52);
    return h ? h[`long_${g}`].slice(-52).map((v, i) => v - short[i]) : [];
  };
  const toggle = (e) => setHidden((h) => ({ ...h, [e.dataKey]: !h[e.dataKey] }));
  const k = (v) => (v == null ? null : v / 1e3);
  const u = unit === "k" ? "K CONTRACTS" : "% OI";
  const digits = unit === "k" ? 0 : 1;

  return (
    <Block id="cot" title="POSITIONING" sub={`CFTC TFF + Legacy non-comm · futures only · weekly · as of ${d.asof}`}
      right={<div className="toggles">
        <Toggle value={unit} onChange={setUnit} options={UNITS} />
        <Toggle value={ma} onChange={setMa} options={SMOOTH} />
        <Toggle value={years} onChange={setYears} options={RANGES} />
      </div>}>
      {/* One row per headline group (cards = contracts), or one row of groups for a single contract */}
      {(contracts.length > 1
        ? Object.entries(HEADLINE).map(([g, [name]]) => [name, contracts.map((c) => [c, g, c])])
        : [[contracts[0], Object.entries(HEADLINE).map(([g, [, short]]) => [contracts[0], g, short])]]
      ).map(([title, cards]) => (
        <div key={title}>
          <div className="stats-label">{title}<span className="muted">(net, k contracts)</span></div>
          <div className="stats">
            {cards.map(([c, g, label]) => {
              const r = latest(c).find((x) => x.group === g);
              return r && <StatCard key={`${c}-${g}`} label={label} value={k(r.net)} digits={0} unit="k"
                delta={k(r.chg_net_w1)} deltaUnit="k 1W" deltaDigits={0} spark={spark(c, g)} />;
            })}
          </div>
        </div>
      ))}
      <div className="toggles" style={{ marginBottom: 14 }}>
        <Toggle value={view} onChange={setView} options={VIEWS} />
        {view !== "all" && <Toggle value={group} onChange={setGroup} options={groups.map(([g]) => ({ id: g, label: SHORT[g] }))} />}
      </div>
      <div className="grid">
        {contracts.map((c) => {
          const x = series[c];
          if (!x) return null;
          const { rows: data, mean, sd } = x;
          const px = d.price[c];
          const hasPx = view === "price" && px && data.some((r) => r.price != null);
          const title = {
            price: `${c} · ${SHORT[group]} NET (${u}) VS ${px?.label.toUpperCase() ?? "PRICE"}`,
            gross: `${c} · ${SHORT[group]} LONG / SHORT (${u})`,
            all: `${c} · NET BY GROUP (${u})`,
          }[view];
          return (
            <Card key={c} title={title} span={contracts.length === 1 ? 2 : 1} note={NOTES[view]}>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data} margin={{ top: 10, right: hasPx ? 0 : 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(data)} />
                  <YAxis yAxisId="pos" {...axis} width={44} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 0)} />
                  {hasPx && (
                    <YAxis yAxisId="px" orientation="right" reversed={px.invert} {...axis} width={52} domain={["auto", "auto"]}
                      tickFormatter={(v) => fmt(v, px.digits >= 4 ? 3 : 1)} />
                  )}
                  <Tooltip content={<CotTip digits={digits} pxDigits={px?.digits ?? 2} />} />
                  <Legend wrapperStyle={{ fontSize: 11, cursor: view === "all" ? "pointer" : undefined }}
                    onClick={view === "all" ? toggle : undefined} />
                  <ReferenceLine yAxisId="pos" y={0} stroke="var(--muted)" />
                  {view === "price" && [
                    <ReferenceLine key="hi" yAxisId="pos" y={mean + 2 * sd} stroke={UP} strokeDasharray="4 3" />,
                    <ReferenceLine key="lo" yAxisId="pos" y={mean - 2 * sd} stroke={DOWN} strokeDasharray="4 3" />,
                    <Area key="net" yAxisId="pos" dataKey={group} name={`${d.groups[group]} net`} stroke={COLORS[0]}
                      fill={COLORS[0]} fillOpacity={0.2} strokeWidth={1.3} dot={false} isAnimationActive={false} connectNulls />,
                  ]}
                  {hasPx && (
                    <Line yAxisId="px" dataKey="price" name={`${px.label}${px.invert ? " (inverted axis)" : ""}`}
                      stroke="var(--text)" strokeWidth={1.3} dot={false} connectNulls />
                  )}
                  {view === "gross" && [
                    <Line key="l" yAxisId="pos" dataKey={`long_${group}`} name="Long" stroke={UP} strokeWidth={1.5} dot={false} connectNulls />,
                    <Line key="s" yAxisId="pos" dataKey={`short_${group}`} name="Short" stroke={DOWN} strokeWidth={1.5} dot={false} connectNulls />,
                    <Line key="n" yAxisId="pos" dataKey={group} name="Net" stroke={COLORS[0]} strokeWidth={1.3} strokeDasharray="5 3" dot={false} connectNulls />,
                  ]}
                  {view === "all" && groups.map(([g, name], j) => (
                    <Line key={g} yAxisId="pos" dataKey={g} name={name} hide={hidden[g]} stroke={COLORS[j % COLORS.length]} dot={false}
                      strokeWidth={g === "lev_money" ? 2 : 1.3} connectNulls />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
      <Card title="NET POSITIONS & EXTREMES"
        note={`Trader groups from TFF; Non-commercials from the Legacy report (same contracts, same OI; spreading excluded). Contracts in thousands, positions as of Tuesday, published Friday: read as weekly trend, not short-term signals. 1W/4W = change in net. Long/Short 1W = change in gross, colored by effect on net (green: longs added or shorts covered). % OI = net / open interest. z 3Y and 3Y pct vs the last ${d.window} weeks. Price: continuous front-month future (Yahoo), rolls can cause jumps. ${note ?? ""}`}>
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Group</th><th>Obs</th><th>Net (k)</th><th>1W</th><th>4W</th><th>Long 1W</th><th>Short 1W</th>
              <th>% OI</th><th>z 3Y</th><th>3Y pct</th>
            </tr>
          </thead>
          <tbody>
            {contracts.flatMap((c) => [
              <tr key={c} className="group"><td colSpan={10}>{c}</td></tr>,
              ...latest(c).map((r) => (
                <tr key={`${c}-${r.group}`}>
                  <td>{r.label}</td>
                  <td className="muted">{r.date}</td>
                  <td>{fmt(k(r.net), 0)}</td>
                  <td className={chgCls(r.chg_net_w1)}>{signed(k(r.chg_net_w1), 0)}</td>
                  <td className={chgCls(r.chg_net_w4)}>{signed(k(r.chg_net_w4), 0)}</td>
                  <td className={chgCls(r.chg_long_w1)}>{signed(k(r.chg_long_w1), 0)}</td>
                  <td className={chgCls(-r.chg_short_w1)}>{signed(k(r.chg_short_w1), 0)}</td>
                  <td>{signed(r.pct_oi, 1)}</td>
                  <td className={Math.abs(r.z_3y) >= 2 ? chgCls(r.z_3y) : ""}>{signed(r.z_3y, 1)}</td>
                  <td>{fmt(r.pct_3y, 0)}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table></div>
      </Card>
    </Block>
  );
}
