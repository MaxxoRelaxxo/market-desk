import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Block, Card, StatCard, Status, TimeTip, Toggle, chgCls } from "../components/ui";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const RANGES = [{ id: 3, label: "3Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const UNITS = [{ id: "k", label: "K CONTRACTS" }, { id: "oi", label: "% OI" }];
const HEADLINE = { lev_money: ["LEVERAGED FUNDS", "Lev funds"], asset_mgr: ["ASSET MANAGERS", "Asset managers"] };
const HIDDEN = { other: true, nonrept: true };

/** CFTC TFF net positioning (long − short) for `contracts`, from cot.json. */
export default function CotSection({ contracts, note }) {
  const s = useData("cot.json");
  const [years, setYears] = useState(3);
  const [unit, setUnit] = useState("k");
  const [hidden, setHidden] = useState(HIDDEN);
  const d = s.data;
  const hist = useMemo(() => Object.fromEntries(contracts.map((c) => {
    const h = withT(d?.history[c] ?? []);
    if (!h.length) return [c, h];
    const t0 = h[h.length - 1].t - years * 365.25 * 864e5;
    const scale = (r, v) => (v == null ? null : unit === "k" ? v / 1e3 : (v / r.oi) * 100);
    return [c, h.filter((r) => r.t >= t0).map((r) => ({
      ...r, ...Object.fromEntries(Object.keys(d.groups).map((g) => [g, scale(r, r[g])])),
    }))];
  })), [d, contracts, years, unit]);
  if (!d) return <section id="cot" className="block"><Status state={s} what="CFTC positioning" /></section>;

  const groups = Object.entries(d.groups);
  const latest = (c) => groups.map(([g]) => d.latest.find((r) => r.contract === c && r.group === g)).filter(Boolean);
  const spark = (c, g) => (d.history[c] ?? []).slice(-52).map((r) => r[g]).filter((v) => v != null);
  const toggle = (e) => setHidden((h) => ({ ...h, [e.dataKey]: !h[e.dataKey] }));
  const k = (v) => (v == null ? null : v / 1e3);

  return (
    <Block id="cot" title="POSITIONING" sub={`CFTC TFF · futures only · as of ${d.asof}`}
      right={<div className="toggles">
        <Toggle value={unit} onChange={setUnit} options={UNITS} />
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
                delta={k(r.chg_w1)} deltaUnit="k 1W" deltaDigits={0} spark={spark(c, g)} />;
            })}
          </div>
        </div>
      ))}
      <div className="grid">
        {contracts.map((c) => {
          const data = hist[c];
          if (!data?.length) return null;
          return (
            <Card key={c} title={`${c} · NET (${unit === "k" ? "K CONTRACTS" : "% OI"})`} span={contracts.length === 1 ? 2 : 1}
              note="Click a legend item to hide/show.">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis {...timeAxis(data)} />
                  <YAxis {...axis} width={44} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip content={<TimeTip digits={unit === "k" ? 0 : 1} />} />
                  <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }} onClick={toggle} />
                  <ReferenceLine y={0} stroke="var(--muted)" />
                  {groups.map(([g, name], j) => (
                    <Line key={g} dataKey={g} name={name} hide={hidden[g]} stroke={COLORS[j % COLORS.length]} dot={false}
                      strokeWidth={g === "lev_money" ? 2 : 1.3} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          );
        })}
      </div>
      <Card title="NET POSITIONS & EXTREMES"
        note={`Net = long − short futures contracts (thousands), as of Tuesday, published Friday. 1W/4W = change in net. % OI = net / open interest. z 3Y and 3Y pct vs the last ${d.window} weeks. ${note ?? ""}`}>
        <div className="table-wrap"><table className="table">
          <thead>
            <tr><th>Group</th><th>Obs</th><th>Net (k)</th><th>1W</th><th>4W</th><th>% OI</th><th>z 3Y</th><th>3Y pct</th></tr>
          </thead>
          <tbody>
            {contracts.flatMap((c) => [
              <tr key={c} className="group"><td colSpan={8}>{c}</td></tr>,
              ...latest(c).map((r) => (
                <tr key={`${c}-${r.group}`}>
                  <td>{r.label}</td>
                  <td className="muted">{r.date}</td>
                  <td>{fmt(k(r.net), 0)}</td>
                  <td className={chgCls(r.chg_w1)}>{signed(k(r.chg_w1), 0)}</td>
                  <td className={chgCls(r.chg_w4)}>{signed(k(r.chg_w4), 0)}</td>
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
