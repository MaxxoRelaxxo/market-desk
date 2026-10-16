import { Component } from "react";
import { fmt } from "../lib";

export function StatCard({ label, value, unit, delta, deltaUnit = "bp", digits = 2 }) {
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "";
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {typeof value === "number" ? fmt(value, digits) : value ?? "–"}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {delta != null && (
        <div className={`stat-delta ${cls}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} {deltaUnit}
        </div>
      )}
    </div>
  );
}

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
      {payload.map((p) => (
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
  if (state.error) return <div className="info"><b>Kunde inte ladda {what}.</b> Kör <code>scripts/build_data.py</code>.</div>;
  return <div className="loading">Laddar {what}…</div>;
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
        <b>Fel vid rendering</b>
        <pre>{this.state.error.message}</pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>Försök igen</button>
      </div>
    );
  }
}
