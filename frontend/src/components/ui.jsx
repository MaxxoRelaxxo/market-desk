import { Component, useEffect, useState } from "react";
import { dateLabel, fmt } from "../lib";

export function StatCard({ label, value, unit, delta, deltaUnit = "bp", digits = 2, deltaDigits = 1, color, spark }) {
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "";
  const c = color ?? (delta > 0 ? "var(--up)" : delta < 0 ? "var(--down)" : undefined);
  return (
    <div className={`stat ${cls}`} style={c && { "--c": c }}>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">
          {typeof value === "number" ? fmt(value, digits) : value ?? "–"}
          {unit && <span className="stat-unit">{unit}</span>}
        </div>
        {delta != null && (
          <div className={`stat-delta ${cls}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {delta > 0 ? "+" : ""}
            {delta.toFixed(deltaDigits)} {deltaUnit}
          </div>
        )}
      </div>
      {spark?.length > 1 && <Spark values={spark} color={c ?? "var(--accent)"} />}
    </div>
  );
}

export function Spark({ values, color, w = 100, h = 34 }) {
  const lo = Math.min(...values), hi = Math.max(...values), k = hi > lo ? (h - 2) / (hi - lo) : 0;
  const pts = values.map((v, i) => `${((i * w) / (values.length - 1)).toFixed(1)},${(h - 1 - (v - lo) * k).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const STARS = Array.from({ length: 12 }, (_, i) => [12 + 4.6 * Math.sin((i * Math.PI) / 6), 8 - 4.6 * Math.cos((i * Math.PI) / 6)]);
const FLAGS = {
  se: <><rect width="24" height="16" fill="#006AA7" /><rect x="7" width="3" height="16" fill="#FECC02" /><rect y="6.5" width="24" height="3" fill="#FECC02" /></>,
  eu: <><rect width="24" height="16" fill="#003399" />{STARS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.8" fill="#FFCC00" />)}</>,
  us: <><rect width="24" height="16" fill="#fff" />{[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13} fill="#B22234" />)}<rect width="10" height="8.6" fill="#3C3B6E" /></>,
};

export const Flag = ({ code }) => <svg className="flag" viewBox="0 0 24 16">{FLAGS[code]}</svg>;

export function Card({ title, note, span = 1, children, right }) {
  return (
    <div className="card" style={{ gridColumn: `span ${span}` }}>
      <div className="card-head">
        <div className="card-title">{title}</div>
        {right}
      </div>
      {children}
      {note && <div className="card-note">{note}</div>}
    </div>
  );
}

export function Toggle({ options, value, onChange }) {
  return (
    <div className="toggle">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? "active" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tip({ active, payload, label, digits = 2, unit = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      <div className="tt-label">{label}</div>
      {payload.filter((p) => typeof p.value === "number").map((p) => (
        <div key={p.dataKey} className="tt-row">
          <span className="tt-dot" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="tt-name">{p.name}</span>
          <span className="tt-val">{fmt(p.value, digits)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Status({ state, what }) {
  if (state.error) return <div className="info"><b>Could not load {what}.</b> Run <code>scripts/build_data.py</code>.</div>;
  return <div className="loading">Loading {what}…</div>;
}

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="info">
        <b>Render error</b>
        <pre>{this.state.error.message}</pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    );
  }
}

export const chgCls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
export const TimeTip = (props) => <Tip {...props} label={props.label != null ? dateLabel(props.label) : ""} />;

export function Block({ id, title, sub, right, hero, children }) {
  return (
    <section id={id} className="block">
      <div className={`section-head${hero ? " hero" : ""}`}>
        <h2>{title}{sub && <span className="muted">{sub}</span>}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Id of the block currently at the top of the viewport. */
export function useSpy(ids, ready) {
  const [current, setCurrent] = useState(ids[0]);
  useEffect(() => {
    const onScroll = () => {
      const top = ids.filter((id) => document.getElementById(id)?.getBoundingClientRect().top <= 140);
      setCurrent(top.at(-1) ?? ids[0]);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ready]);
  return current;
}

export function SubNav({ blocks, current }) {
  return (
    <nav className="subnav">
      {blocks.map(([id, label]) => <a key={id} href={`#${id}`} className={id === current ? "active" : ""} onClick={(e) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }}>{label}</a>)}
    </nav>
  );
}
