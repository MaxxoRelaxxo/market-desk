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
    status: "live",
    lead: "SEK in focus: crosses, G10 and valuation vs PPP.",
    items: [
      "USD/SEK, EUR/SEK, EUR/USD and USD/JPY",
      "G10 cross matrix: levels and % changes",
      "SEK vs PPP: USD, EUR and NOK",
      "Brent, WTI, gold, silver and copper",
    ],
  },
  {
    id: "equity",
    label: "Equity",
    status: "live",
    lead: "Global indices and the AI capex trade in earnings and cash flow.",
    items: [
      "US, Europe and Asia indices: levels, changes and ranges",
      "Development rebased to 100: YTD to 10Y",
      "Hyperscalers vs semiconductors: net income and free cash flow",
      "Capex and cash conversion by company (SEC filings)",
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
      <section className="landing">
        <video className="landing-video" src={`${MEDIA}hero.mp4`} poster={`${MEDIA}hero.jpg`} autoPlay={!reduced} muted loop playsInline aria-hidden="true" />
        <div className="landing-shade" />
        <div className="landing-body">
          <h1>Market Desk</h1>
          <p>Market intelligence built on official data. Rates, FX, commodities and macro from central banks and statistical agencies, updated daily.</p>
          <div className="landing-cta">
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

      <footer className="home-foot">Sources: Riksbank, FRED, Yahoo Finance, ECB, Banca d'Italia, Banco de España, NBB, European Commission (AMECO).</footer>
    </>
  );
}
