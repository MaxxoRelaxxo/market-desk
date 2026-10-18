const MEDIA = `${import.meta.env.BASE_URL}media/`;

const DESKS = [
  {
    id: "rates",
    label: "Rates",
    status: "live",
    lead: "Government curves in Sweden, the euro area and the US.",
    items: [
      "Levels, daily/weekly changes and 1Y ranges",
      "Curve analysis vs chosen dates (SGB, Treasuries)",
      "EGB relative value: spreads vs debt",
      "Swedish term premium (ACM)",
    ],
  },
  {
    id: "fx",
    label: "FX & Commodities",
    status: "soon",
    lead: "SEK in focus, priced against rate differentials and risk.",
    items: [
      "EUR/SEK, USD/SEK, KIX and EUR/USD",
      "FX vs 2Y rate differentials and carry",
      "Brent, TTF gas, gold and copper",
      "Correlation and volatility regimes",
    ],
  },
  {
    id: "macro",
    label: "Macro Monitor",
    status: "soon",
    lead: "The data that moves central banks, in one view.",
    items: [
      "Inflation: CPIF, HICP, US CPI/PCE",
      "Labour market, PMIs and growth nowcasts",
      "Policy paths: Riksbank, ECB, Fed",
      "Fiscal: debt and deficits (AMECO)",
    ],
  },
];

export default function HomePage({ go }) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <>
      <section className="hero">
        <video className="hero-video" src={`${MEDIA}hero.mp4`} poster={`${MEDIA}hero.jpg`} autoPlay={!reduced} muted loop playsInline aria-hidden="true" />
        <div className="hero-shade" />
        <div className="hero-body">
          <div className="hero-kicker">STOCKHOLM · FRANKFURT · NEW YORK</div>
          <h1>Market Desk</h1>
          <p>Rates, FX, commodities and macro – updated daily from central bank and official sources, with models on top.</p>
          <div className="hero-cta">
            <button className="cta" onClick={() => go("rates")}>Open Rates</button>
            <button className="cta ghost" onClick={() => document.getElementById("desks").scrollIntoView({ behavior: "smooth" })}>What's inside ↓</button>
          </div>
        </div>
      </section>

      <section id="desks" className="desks">
        {DESKS.map((d) => (
          <article key={d.id} className={`desk ${d.status}`}>
            <div className="desk-head">
              <h3>{d.label}</h3>
              <span className={`badge ${d.status}`}>{d.status === "live" ? "LIVE" : "COMING"}</span>
            </div>
            <p className="desk-lead">{d.lead}</p>
            <ul>
              {d.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
            {d.status === "live" && <button className="cta small" onClick={() => go(d.id)}>Open {d.label} →</button>}
          </article>
        ))}
      </section>

      <footer className="home-foot">Sources: Riksbank, FRED, ECB, Banca d'Italia, Banco de España, NBB, European Commission (AMECO).</footer>
    </>
  );
}
