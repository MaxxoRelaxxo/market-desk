import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ui";
import HomePage from "./sections/HomePage";
import RatesPage from "./sections/RatesPage";

// Theme registry: add a page component + build function(s) in scripts/build_data.py.
const THEMES = [
  { id: "home", label: "HOME", Component: HomePage, hidden: true },
  { id: "rates", key: "F1", label: "RATES", Component: RatesPage },
];

const initial = () => THEMES.find((t) => t.id === window.location.hash.slice(1))?.id ?? THEMES[0].id;

export default function App() {
  const [active, setActive] = useState(initial);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    window.location.hash = active;
    window.scrollTo(0, 0);
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
        <button className="brand" onClick={() => setActive("home")}>MARKET DESK</button>
        <nav className="nav">
          {THEMES.filter((t) => !t.hidden).map((t) => (
            <button key={t.id} className={active === t.id ? "active" : ""} onClick={() => setActive(t.id)}>
              <span className="fkey">{t.key}</span> {t.label}
            </button>
          ))}
        </nav>
        <div className="clock">{now.toLocaleString("en-GB")}</div>
      </header>
      <main className={active === "home" ? "home" : "page"}>
        <ErrorBoundary key={active}>
          <Component go={setActive} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
