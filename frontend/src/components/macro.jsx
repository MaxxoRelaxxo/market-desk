import { Card, chgCls } from "./ui";
import { fmt, signed, withT } from "../lib";

export const FLAG = { US: "us", EA: "eu", SE: "se" };
export const RANGES = [{ id: 5, label: "5Y" }, { id: 10, label: "10Y" }, { id: 99, label: "MAX" }];
const YEAR = 365.25 * 864e5;

/** "2026 Q2" for quarterly, "2026-09" for monthly. */
export const period = (iso, q) => (q ? `${iso.slice(0, 4)} Q${Math.floor(+iso.slice(5, 7) / 3) + 1}` : iso.slice(0, 7));
export const since = (rows, years) => (rows.length ? rows.filter((r) => r.t >= rows.at(-1).t - years * YEAR) : rows);

/** Long rows -> wide rows by date ({date, t, [row[key]]: row[val]}). */
export const wide = (rows, key, val) => {
  const by = {};
  rows.forEach((r) => ((by[r.date] ??= { date: r.date })[r[key]] = r[val]));
  return withT(Object.values(by).sort((a, b) => a.date.localeCompare(b.date)));
};

/** Latest release per indicator, grouped by economy (rows from models.macro.prints). */
export function PrintsTable({ title, note, economies, prints, quarterly }) {
  return (
    <Card title={title} note={note}>
      <div className="table-wrap"><table className="table">
        <thead>
          <tr><th>Indicator</th><th>Period</th><th>Latest</th><th>Prev</th><th>Δ pp</th><th>1Y ago</th><th>5Y avg</th><th>5Y low</th><th>5Y range</th><th>5Y high</th></tr>
        </thead>
        <tbody>
          {Object.entries(economies).flatMap(([e, name]) => {
            const rows = prints.filter((r) => r.economy === e);
            return rows.length ? [
              <tr key={e} className="group"><td colSpan={10}>{name.toUpperCase()}</td></tr>,
              ...rows.map((r) => {
                const pos = r.hi_5y > r.lo_5y ? (r.value - r.lo_5y) / (r.hi_5y - r.lo_5y) : 0.5;
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="muted">{period(r.date, quarterly)}</td>
                    <td>{fmt(r.value, 1)}</td>
                    <td className="muted">{fmt(r.prev, 1)}</td>
                    <td className={chgCls(r.value - r.prev)}>{signed(r.value - r.prev, 1)}</td>
                    <td className="muted">{fmt(r.y1, 1)}</td>
                    <td className="muted">{fmt(r.avg_5y, 1)}</td>
                    <td className="muted">{fmt(r.lo_5y, 1)}</td>
                    <td><div className="range"><span style={{ left: `${pos * 100}%` }} /></div></td>
                    <td className="muted">{fmt(r.hi_5y, 1)}</td>
                  </tr>
                );
              }),
            ] : [];
          })}
        </tbody>
      </table></div>
    </Card>
  );
}
