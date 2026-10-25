import { useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Block, Card, Flag, StatCard, Status, SubNav, Tip, TimeTip, Toggle, chgCls, useSpy } from "../components/ui";
import { FLAG, RANGES, since } from "../components/macro";
import { COLORS, axis, fmt, signed, timeAxis, useData, withT } from "../lib";

const BLOCKS = [["overview", "OVERVIEW"], ["meetings", "MEETING PRICING"], ["rates", "POLICY RATES"]];
const TITLE = { US: "FED · FED FUNDS FUTURES", EA: "ECB · AAA CURVE ANCHORED ON €STR" };
const NOTES = {
  US: "30-day Fed funds futures (CBOT, Yahoo Finance), CME FedWatch method: monthly average EFFR = 100 − price; rate after a meeting from the next month without a meeting, else solved from the meeting month. Cumulative vs today's EFFR; implied target = mid of today's range + cumulative. 1W/1M build up from daily snapshots.",
  EA: "No free €STR futures/OIS: ECB AAA government curve (Svensson parameters), instantaneous forwards shifted so the 0-horizon forward equals €STR, averaged over each inter-meeting period (effective the Wednesday after the decision). Cumulative vs today's €STR; implied deposit rate = DFR + cumulative. Beyond ~1Y the curve carries term premium.",
};
const mon = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const policyText = (b) => (b.upper != null ? `${fmt(b.lower, 2)}–${fmt(b.upper, 2)}` : fmt(b.rate, 2));
const within = (b, months) => b.meetings.filter((m) => m.cum != null && Date.parse(m.date) - Date.parse(b.asof) <= months * 30.44 * 864e5);

function Overview({ d }) {
  return (
    <Block id="overview" title="CENTRAL BANKS" sub="policy rates · meeting-by-meeting pricing" hero>
      {Object.entries(d.economies).filter(([e]) => d.banks[e]).map(([e, name]) => {
        const b = d.banks[e];
        const next = b.meetings[0];
        const y1 = within(b, 12).at(-1);
        return (
          <div key={e}>
            <div className="stats-label"><Flag code={FLAG[e]} />{name.toUpperCase()}<span className="muted">as of {b.asof}</span></div>
            <div className="stats">
              <StatCard label={b.label} value={policyText(b)} unit="%" color="var(--accent)" />
              {b.effective != null && <StatCard label={b.effective_label} value={b.effective} unit="%" color="var(--accent)" />}
              {next && (next.cum != null
                ? <StatCard label={`Next meeting · ${mon(next.date)}`} value={signed(next.chg, 1)} unit="bp priced" color="var(--accent)"
                  delta={next.cum_w1 != null ? next.cum - next.cum_w1 : undefined} deltaUnit="bp 1W" />
                : <StatCard label="Next meeting" value={mon(next.date)} color="var(--accent)" />)}
              {y1 && <StatCard label={`Cumulative by ${mon(y1.date)}`} value={signed(y1.cum, 0)} unit="bp"
                delta={y1.cum_w1 != null ? y1.cum - y1.cum_w1 : undefined} deltaUnit="bp 1W" />}
            </div>
          </div>
        );
      })}
    </Block>
  );
}

function MeetingCard({ e, b }) {
  const rows = b.meetings.map((m) => ({ ...m, label: mon(m.date) }));
  return (
    <Card title={`${TITLE[e]} (BP VS TODAY)`} note={NOTES[e]} right={<span className="muted">{b.asof}</span>}>
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
          <tr><th>Meeting</th><th>Implied policy</th><th>Implied {b.effective_label}</th><th>Δ meeting bp</th><th>Cum. bp</th><th>25bp moves</th><th>Δ 1W bp</th><th>Δ 1M bp</th></tr>
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

function Meetings({ d }) {
  const se = d.banks.SE;
  return (
    <Block id="meetings" title="MEETING PRICING" sub="cumulative change priced vs today">
      <div className="grid">
        {["US", "EA"].filter((e) => d.banks[e]?.meetings.length).map((e) => <MeetingCard key={e} e={e} b={d.banks[e]} />)}
        {se && (
          <Card title="RIKSBANK · CALENDAR" note="No free market source for meeting pricing (STIBOR FRA / SEK OIS are not public). Dates: decision publication; new rate applies the following Wednesday.">
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Meeting</th><th>Policy rate today</th></tr></thead>
              <tbody>
                {se.meetings.map((m) => <tr key={m.date}><td>{mon(m.date)}</td><td className="muted">{fmt(se.rate, 2)}</td></tr>)}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>
    </Block>
  );
}

const HIST = [["fed_upper", "Fed funds upper"], ["fed_lower", "Fed funds lower"], ["ecb_dfr", "ECB deposit rate"], ["SE", "Riksbank policy rate"]];

function Rates({ d }) {
  const [years, setYears] = useState(5);
  const rows = since(withT(d.history), years);
  return (
    <Block id="rates" title="POLICY RATES" sub="%" right={<Toggle value={years} onChange={setYears} options={RANGES} />}>
      <Card title="POLICY RATES (%)" note="Weekly, last obs. Fed funds target range (FRED), ECB deposit facility rate (FRED), Riksbank policy rate (SWEA).">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
            <XAxis {...timeAxis(rows)} />
            <YAxis {...axis} width={36} tickFormatter={(v) => fmt(v, 1)} />
            <Tooltip content={<TimeTip digits={2} unit="%" />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {HIST.map(([k, name], j) => (
              <Line key={k} dataKey={k} name={name} stroke={COLORS[[0, 0, 1, 2][j]]} strokeDasharray={k === "fed_lower" ? "4 3" : undefined}
                strokeWidth={1.6} dot={false} type="stepAfter" connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </Block>
  );
}

export default function PolicyPage() {
  const s = useData("policy.json");
  const current = useSpy(BLOCKS.map(([id]) => id), !!s.data);
  if (!s.data) return <Status state={s} what="policy" />;
  return (
    <div>
      <SubNav blocks={BLOCKS} current={current} />
      <Overview d={s.data} />
      <Meetings d={s.data} />
      <Rates d={s.data} />
    </div>
  );
}
