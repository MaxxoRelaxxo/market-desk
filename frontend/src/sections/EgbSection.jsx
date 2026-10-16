import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, StatCard, Status, Tip, Toggle } from "../components/ui";
import { COLORS, DOWN, UP, axis, fmt, signed, ticks, useData } from "../lib";

const FACTOR_LABEL = { debt: "Skuld (% BNP)", fiscal: "Budgetsaldo (% BNP)", ca: "Bytesbalans (% BNP)" };
const SIGNAL_CLS = { CHEAP: "up", RICH: "down", FAIR: "" };

export default function EgbSection() {
  const state = useData("egb.json");
  const [country, setCountry] = useState("IT");
  const [barMetric, setBarMetric] = useState("z");
  const [scatterX, setScatterX] = useState("debt");

  const d = state.data;
  const spreads = d?.spreads ?? [];
  const spreadTicks = useMemo(() => ticks(spreads), [spreads]);

  if (!d) return <Status state={state} what="EGB-data" />;

  const series = d.series[country] ?? [];
  const bund = d.bund;
  const bundLast = bund[bund.length - 1];
  const bundPrev = bund[bund.length - 2];
  const snap = d.snapshot;
  const ranked = snap.filter((r) => r.z != null);
  const cheap = ranked[0];
  const rich = ranked[ranked.length - 1];
  const beta = d.betas[d.betas.length - 1];
  const countries = Object.keys(d.names);

  return (
    <div>
      <div className="section-head">
        <h2>EGB SPREADS <span className="muted">| Fair value mot fundamenta</span></h2>
        <div className="muted">10Y spread mot Bund · senaste obs {d.asof}</div>
      </div>

      <div className="stats">
        <StatCard label="Bund 10Y" value={bundLast.bund} unit="%" delta={(bundLast.bund - bundPrev.bund) * 100} />
        <StatCard label={`Billigast · ${cheap.name}`} value={cheap.z} unit="z" />
        <StatCard label={`Dyrast · ${rich.name}`} value={rich.z} unit="z" />
        <StatCard label="β skuld" value={beta.debt} unit="bp/pp" />
        <StatCard label="β budgetsaldo" value={beta.fiscal} unit="bp/pp" />
        <StatCard label="β bytesbalans" value={beta.ca} unit="bp/pp" />
      </div>

      <div className="grid">
        <Card title="RELATIVE VALUE MONITOR" span={2} note="Residual = spread − fair (bp, > 0 = billig mot fundamenta). Z = residual mot egen 3Y-historik; signal vid |z| > 1. Fundamenta som skillnad mot Tyskland, 12M framåtblandat. Klicka på rad för detaljer.">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Land</th><th>Datum</th><th>10Y</th><th>Spread</th><th>Fair</th><th>Residual</th><th>Z</th><th>Signal</th>
                  <th>Δ Skuld</th><th>Δ Saldo</th><th>Δ CA</th>
                </tr>
              </thead>
              <tbody>
                {snap.map((r) => (
                  <tr key={r.country} className={r.country === country ? "selected" : ""} onClick={() => setCountry(r.country)}>
                    <td><b>{r.country}</b> <span className="muted">{r.name}</span></td>
                    <td className="muted">{r.date.slice(0, 7)}</td>
                    <td>{fmt(r.yield)}</td>
                    <td>{fmt(r.spread, 0)}</td>
                    <td>{fmt(r.fair, 0)}</td>
                    <td className={r.residual > 0 ? "up" : "down"}>{signed(r.residual, 0)}</td>
                    <td className={r.z > 1 ? "up" : r.z < -1 ? "down" : ""}>{signed(r.z, 2)}</td>
                    <td className={SIGNAL_CLS[r.signal]}>{r.signal}</td>
                    <td>{signed(r.debt, 0)}</td>
                    <td>{signed(r.fiscal, 1)}</td>
                    <td>{signed(r.ca, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title={barMetric === "z" ? "RESIDUAL Z-SCORE" : "RESIDUAL (BP)"}
          right={<Toggle value={barMetric} onChange={setBarMetric} options={[{ id: "z", label: "Z" }, { id: "residual", label: "BP" }]} />}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={snap} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="country" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Bar dataKey={barMetric} name={barMetric === "z" ? "Z-score" : "Residual"} onClick={(r) => setCountry(r.country)}>
                {snap.map((r) => (
                  <Cell key={r.country} fill={r[barMetric] > 0 ? UP : DOWN} fillOpacity={r.country === country ? 1 : 0.55} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title={`SPREAD VS ${FACTOR_LABEL[scatterX].toUpperCase()}`}
          note="X-axel: skillnad mot Tyskland."
          right={<Toggle value={scatterX} onChange={setScatterX} options={d.factors.map((f) => ({ id: f, label: f.toUpperCase() }))} />}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis type="number" dataKey={scatterX} name={FACTOR_LABEL[scatterX]} {...axis} />
              <YAxis type="number" dataKey="spread" name="Spread" {...axis} width={40} />
              <ZAxis range={[60, 60]} />
              <Tooltip content={<Tip />} />
              <Scatter data={snap} fill="var(--accent)" onClick={(r) => setCountry(r.country)}>
                <LabelList dataKey="country" position="top" fill="#E8EDF2" fontSize={10} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card
          title={`${d.names[country]?.toUpperCase()} · SPREAD VS FAIR`}
          span={2}
          right={
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map((c) => <option key={c} value={c}>{c} · {d.names[c]}</option>)}
            </select>
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={series} syncId="egb-country" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(series)} {...axis} />
              <YAxis {...axis} width={45} />
              <Tooltip content={<Tip digits={0} unit=" bp" />} />
              <Line dataKey="spread" name="Spread" stroke={COLORS[0]} dot={false} strokeWidth={1.8} />
              <Line dataKey="fair" name="Fair" stroke={COLORS[1]} dot={false} strokeWidth={1.5} strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={series} syncId="egb-country" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="date" ticks={ticks(series)} {...axis} />
              <YAxis {...axis} width={45} domain={[-3, 3]} allowDataOverflow />
              <Tooltip content={<Tip />} />
              <ReferenceLine y={1} stroke={UP} strokeDasharray="3 3" />
              <ReferenceLine y={-1} stroke={DOWN} strokeDasharray="3 3" />
              <Bar dataKey="z" name="Residual z">
                {series.map((r) => <Cell key={r.date} fill={r.z > 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="10Y SPREAD MOT BUND (BP)" span={2}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={spreads} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={spreadTicks} {...axis} />
              <YAxis {...axis} width={45} />
              <Tooltip content={<Tip digits={0} />} />
              {countries.map((c, i) => (
                <Line
                  key={c} dataKey={c} name={c} dot={false} connectNulls
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={c === country ? 2.5 : 1}
                  strokeOpacity={c === country ? 1 : 0.35}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="card-note">Valt land markerat.</div>
        </Card>

        <Card title="MODELLBETAS (36M ROLLING)" note="bp spread per procentenhet skillnad mot Tyskland.">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.betas} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="date" ticks={ticks(d.betas, 5)} {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<Tip />} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              {d.factors.map((f, i) => (
                <Line key={f} dataKey={f} name={FACTOR_LABEL[f]} stroke={COLORS[i]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="BACKTEST · MEAN REVERSION (3M)" note="Korrelation residual mot spreadförändring nästa 3M (negativ = residualen stänger). Hit rate = andel där spreaden rör sig mot fair.">
          <table className="table">
            <thead><tr><th>Land</th><th>Korr</th><th>Hit rate</th><th>N</th></tr></thead>
            <tbody>
              {d.mean_reversion.map((r) => (
                <tr key={r.country}>
                  <td><b>{r.country}</b></td>
                  <td className={r.corr < 0 ? "up" : "down"}>{signed(r.corr, 2)}</td>
                  <td className={r.hit_rate > 0.5 ? "up" : "down"}>{fmt(r.hit_rate * 100, 0)}%</td>
                  <td className="muted">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="info">
        <b>Modell</b>
        <p>
          spread<sub>i,t</sub> = α<sub>t</sub> + β<sub>t</sub>·[skuld, budgetsaldo, bytesbalans]<sub>i,t</sub> + ε<sub>i,t</sub>.
          Pooled OLS med månads-fixed effects över rullande 36 månader, dvs ren relativ värdering mellan länderna.
          Fundamenta från AMECO (inkl. kommissionens prognoser), uttryckta som skillnad mot Tyskland och framåtblandade
          (månad m vägs m/12 mot nästa års värde). Räntor: FRED/OECD 10Y månadsmedel.
        </p>
        <p className="muted">
          Obs: AMECO är senaste vintage – historiska fundamenta är reviderade, så backtesten har look-ahead.
        </p>
      </div>
    </div>
  );
}
