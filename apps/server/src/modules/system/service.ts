import { sql } from 'drizzle-orm'
import type { Ctx } from '../../context.ts'

/** Answers only when the database does, so Docker's health check notices a lost connection. */
export async function health(ctx: Ctx) {
  await ctx.db.execute(sql`select 1`)
  return { status: 'ok' as const, version: ctx.config.version }
}

export async function systemInfo(ctx: Ctx) {
  const [imageDiskBytes, host] = await Promise.all([
    ctx.docker.imageDiskUsage(),
    ctx.hostMetrics.info(),
  ])
  return { version: ctx.config.version, imageDiskBytes, ...host }
}

const DAY_MS = 24 * 60 * 60_000

/** The signed-in account's deployments here: per day for two weeks, and a few totals. */
export async function flightStats(ctx: Ctx, ownerId: string) {
  const since = new Date(Date.now() - 13 * DAY_MS)
  since.setUTCHours(0, 0, 0, 0)
  const { rows: perDay } = await ctx.db.execute<{
    date: string
    ready: number
    failed: number
  }>(sql`
    select to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD') as date,
      count(*) filter (where d.status = 'ready')::int as ready,
      count(*) filter (where d.status = 'failed')::int as failed
    from deployments d join projects p on p.id = d.project_id
    where p.owner_id = ${ownerId} and d.created_at >= ${since.toISOString()}
    group by 1`)
  const byDate = new Map(perDay.map((row) => [row.date, row]))
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10)
    const row = byDate.get(date)
    return { date, ready: row?.ready ?? 0, failed: row?.failed ?? 0 }
  })
  const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const {
    rows: [totals],
  } = await ctx.db.execute<{
    deploys: number
    ready: number
    failed: number
    median: number | null
    last: string | null
  }>(sql`
    select
      (select count(*)::int from deployments d join projects p on p.id = d.project_id
        where p.owner_id = ${ownerId} and d.created_at >= ${weekAgo}) as deploys,
      (select count(*)::int from deployments d join projects p on p.id = d.project_id
        where p.owner_id = ${ownerId} and d.created_at >= ${weekAgo} and d.status = 'ready') as ready,
      (select count(*)::int from deployments d join projects p on p.id = d.project_id
        where p.owner_id = ${ownerId} and d.created_at >= ${weekAgo} and d.status = 'failed') as failed,
      (select percentile_cont(0.5) within group (order by seconds) from (
        select extract(epoch from d.finished_at - d.started_at) as seconds
        from deployments d join projects p on p.id = d.project_id
        where p.owner_id = ${ownerId} and d.status = 'ready'
          and d.started_at is not null and d.finished_at is not null
        order by d.finished_at desc limit 30) recent) as median,
      (select max(d.created_at)::text from deployments d join projects p on p.id = d.project_id
        where p.owner_id = ${ownerId}) as last`)
  return {
    days,
    deploys7d: totals?.deploys ?? 0,
    ready7d: totals?.ready ?? 0,
    failed7d: totals?.failed ?? 0,
    medianDeploySeconds:
      totals?.median === null || totals?.median === undefined
        ? null
        : Math.round(Number(totals.median)),
    lastDeployAt: totals?.last ? new Date(totals.last).toISOString() : null,
  }
}
