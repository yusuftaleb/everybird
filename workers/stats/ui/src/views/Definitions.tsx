// The counting rules, word for word as the first dashboard had them. Works without data.
const DEFINITIONS: [string, string][] = [
  ['Daily active visitors and visitor-days', 'A daily active visitor is a distinct anonymous daily id with any recorded event. Ids change each stats day and are approximate. Over several days the unit is active visitor-days, not unique people. The average is visitor-days divided by every calendar day selected, including days with no recorded activity, but excluding dates before collection began. The first recorded day may be partial. Events without an id are excluded from these counts.'],
  ['Recorded visits', 'Only the first recorded visit per anonymous visitor, page and stats day is stored. A visitor opening multiple pages can contribute several visits. Reloads are not counted as additional visits.'],
  ['Personal-list collages', 'Collage-made events from eBird, iNaturalist, Observation.org, manual or mixed lists. The sample demo and backup restores are separate measures. Repeated actions are events, not different people.'],
  ['Action reach', 'Active visitor-days with at least one matching action, divided by all active visitor-days under the same shared filters. A person-day with an unknown id contributes to neither side. Action categories are independent; they are not sequential funnel steps or evidence of conversion or abandonment.'],
  ['Countries, devices and languages', 'Country is a coarse request location, not the website that referred a visitor. Device is a class derived from the request, not a device identity. Browser language is recorded only on visits. Interface-language switches count actions, not the distribution of all language preferences. Unknown values remain visible.'],
  ['Time and coverage', 'New timestamps are the UTC receipt time on the server, displayed by Pacific hour. Network delay can separate receipt from the action. Older events have no timestamp and are never assigned an invented hour. Dates before 17 November 2026 use the historical UTC labels. The transition day, 16 November, spans 31 hours and can include duplicate daily identities.'],
  ['Comparison', 'The default is 14 completed days. Compare uses the equal-length period immediately before the selected range. Percent changes are unavailable for a range containing today, the time cutover, All dates, or a baseline starting before collection. A zero baseline is described as no previous activity. These are descriptive changes, not causal conclusions.'],
  ['Filters, totals and exports', 'Date, country and device are shared by Overview and Explore. Additional Explore filters apply only to the builder and appear as removable chips. Changing its measure clears them. Since-launch totals explicitly ignore filters. Charts, tables and CSV use the same aggregate result. Visitor-day category counts can overlap; Other is the distinct reach of remaining categories, not the sum of their counts.'],
  ['Privacy and limitations', 'Access is restricted to the allowed account. Only aggregates leave the database: no visitor ids or individual receipt timestamps. Do Not Track, Global Privacy Control, blockers, failed beacons and the per-day event cap can reduce coverage. There are no cross-day identities, referral-source records, retention cohorts or ordered sessions.'],
]

export function Definitions() {
  return (
    <article className="max-w-[72ch] pt-2">
      <h2 className="text-base font-medium">Read the unit before comparing a number</h2>
      <p className="mt-1 text-sm text-muted-foreground">The dashboard describes recorded activity. It cannot identify individual people or reconstruct an ordered journey.</p>
      <dl className="mt-6 flex flex-col gap-6">
        {DEFINITIONS.map(([term, text]) => (
          <div key={term}>
            <dt className="text-sm font-medium">{term}</dt>
            <dd className="mt-1 text-sm leading-6 text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
