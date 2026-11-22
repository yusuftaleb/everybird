import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { useReducedMotion } from '@/app/hooks'
import { fmt, formatShort, formatWeekday } from '@/lib/format'

export type DayPoint = { day: string; value: number; prev?: number; prevDay?: string }
type Plotted = DayPoint & { solid: number | null; partial: number | null }

const config = {
  solid: { label: 'This period', color: 'var(--chart-1)' },
  partial: { label: 'Today so far', color: 'var(--chart-1)' },
  prev: { label: 'Previous period', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** One series per day: the selected period in the accent (today, incomplete, dashed), the previous period as a dashed
 *  neutral line aligned day for day, a crosshair tooltip, labelled reference lines, and a click that picks a day. */
export function DayChart({ rows, mode, unit, today, markers = [], onPick, height = 280, label }: {
  rows: DayPoint[]; mode: 'line' | 'bar'; unit: string; today: string; markers?: { day: string; text: string }[]
  onPick?: (day: string) => void; height?: number; label: string
}) {
  const reduced = useReducedMotion()
  const hasPrev = rows.some((r) => r.prev !== undefined)
  const last = rows.length - 1, incomplete = rows.length > 0 && rows[last].day === today
  const data: Plotted[] = rows.map((r, i) => ({
    ...r,
    solid: incomplete && i === last && mode === 'line' && rows.length > 1 ? null : r.value,
    partial: incomplete && mode === 'line' && i >= last - 1 ? r.value : null,
  }))
  const anim = { isAnimationActive: !reduced, animationDuration: 300 }
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{label}</figcaption>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} aria-hidden>
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
          onClick={(e) => { const i = Number(e?.activeTooltipIndex); if (onPick && Number.isInteger(i) && rows[i]) onPick(rows[i].day) }}
          className={onPick ? 'cursor-pointer' : undefined}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" tickFormatter={formatShort} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} tickFormatter={(v: number) => fmt(v)} />
          <ChartTooltip
            cursor={mode === 'line' ? { stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' } : { fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const p = active && payload && payload[0] ? (payload[0].payload as Plotted) : null
              if (!p) return null
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-popover">
                  <p className="font-medium">{formatWeekday(p.day)}: <span className="tabular-nums">{fmt(p.value)}</span> {unit}{p.day === today ? ' (today, incomplete)' : ''}</p>
                  {p.prev !== undefined && p.prevDay && <p className="text-muted-foreground">previous <span className="tabular-nums">{fmt(p.prev)}</span> ({formatWeekday(p.prevDay)})</p>}
                  {onPick && <p className="mt-0.5 text-muted-foreground">Click to pick this day</p>}
                </div>
              )
            }}
          />
          {markers.filter((m) => rows.some((r) => r.day === m.day)).map((m) => (
            <ReferenceLine key={m.day + m.text} x={m.day} stroke="var(--muted-foreground)" strokeDasharray="2 3" label={{ value: m.text, position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 11 }} />
          ))}
          {mode === 'line' ? (
            <>
              <Area dataKey="solid" type="monotone" stroke="var(--color-solid)" strokeWidth={2} fill="var(--color-solid)" fillOpacity={0.1} dot={rows.length === 1} activeDot={{ r: 3 }} connectNulls={false} {...anim} />
              <Line dataKey="partial" type="monotone" stroke="var(--color-partial)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} legendType="none" {...anim} />
            </>
          ) : (
            <Bar dataKey="value" fill="var(--color-solid)" radius={[3, 3, 0, 0]} maxBarSize={32} {...anim} />
          )}
          {hasPrev && <Line dataKey="prev" type="monotone" stroke="var(--color-prev)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} {...anim} />}
        </ComposedChart>
      </ChartContainer>
    </figure>
  )
}
