import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ui";
import UsRatesSection from "./sections/UsRatesSection";
import EgbSection from "./sections/EgbSection";

// Theme registry: add a section component + a build function in scripts/build_data.py.
const THEMES = [
  { id: "egb", key: "F1", label: "EGB SPREADS", Component: EgbSection },
  { id: "us", key: "F2", label: "US RATES", Component: UsRatesSection },
];

const initial = () => THEMES.find((t) => t.id === window.location.hash.slice(1))?.id ?? THEMES[0].id;

export default function App() {
  const [active, setActive] = useState(initial);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    window.location.hash = active;
  }, [active]);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    const keys = (e) => {
      const t = THEMES.find((t) => t.key === e.key);
      if (t) {
        e.preventDefault();
        setActive(t.id);
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      clearInterval(clock);
      window.removeEventListener("keydown", keys);
    };
  }, []);

  const { Component } = THEMES.find((t) => t.id === active);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">MARKET DESK</div>
        <nav className="nav">
          {THEMES.map((t) => (
            <button key={t.id} className={active === t.id ? "active" : ""} onClick={() => setActive(t.id)}>
              <span className="fkey">{t.key}</span> {t.label}
            </button>
          ))}
        </nav>
        <div className="clock">{now.toLocaleString("sv-SE")}</div>
      </header>
      <main className="page">
        <ErrorBoundary key={active}>
          <Component />
        </ErrorBoundary>
      </main>
    </div>
  );
}
