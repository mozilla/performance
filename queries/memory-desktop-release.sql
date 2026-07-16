-- Firefox Desktop memory + GC/CC percentiles per process, last 6 months (RELEASE).
--
-- Output: one row per (date, process, version); one column per probe x percentile.
-- `version` is either the literal 'all' (every major version pooled -- the
-- dashboard's default view) or a single major version number as a string, so the
-- pooled and per-version series ship in one CSV off one table scan.
--
-- The dashboard's release markers need NO column of their own. A version's rows
-- exist here only from the day it crosses the 10% share threshold below, so that
-- crossing date is already implicit in the data: the front-end takes the first
-- date each version carries a value. Deriving it in SQL instead would mean
-- another reference to `per_bucket` -- see the PERFORMANCE note -- to compute
-- something the CSV already says.
--
-- The `metrics` table is scanned only ONCE: every probe is normalized to a common
-- {process key, bucket values} shape inside the `probes` array, letting
-- memory_distribution and timing_distribution coexist in one UNNEST.
--
-- NOTE: the nightly companion query has NO version column (per-version only
-- makes sense on release, where a major version is in the wild for weeks). The
-- front-end treats a missing version column as all-rows-are-'all'.
--
-- To add a probe:
--   1. Add one STRUCT(...) line to the `probes` array (use the matching
--      labeled_memory_distribution / labeled_timing_distribution column).
--   2. Add two MAX(IF(...)) columns to the final SELECT, dividing the raw bucket
--      value by the probe's unit scale:
--         memory distributions: bytes  -> MB  (/ 1048576),  suffix _mb
--         timing distributions: ns     -> ms  (/ 1e6),      suffix _ms
--
-- PERFORMANCE: BigQuery inlines CTEs rather than materializing them, so every
-- reference to `per_bucket` below re-runs the whole ping->bucket explosion. Bytes
-- scanned stay flat (column pruning), so a dry run will not warn you. Adding a
-- reference is not a linear cost -- one more was enough to go from minutes to
-- >8 minutes, most likely by pushing the shuffle into spilling. Count the
-- references before adding one.
--
-- Cost grows with probe count; timing distributions are recorded far more often
-- than memory ones, so they dominate. Measured ~339 GB for a 6-month refresh.
-- Daily full-refresh on STMO.

WITH base AS (
  SELECT
    DATE(submission_timestamp) AS day,
    -- "141.0.2" -> 141. NULL for anything malformed; such pings still count
    -- toward the pooled 'all' series, they just get no per-version series.
    SAFE_CAST(SPLIT(client_info.app_display_version, '.')[SAFE_OFFSET(0)] AS INT64) AS major,
    [
      -- Memory (bytes -> MB)
      STRUCT('resident_peak' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_memory_distribution.memory_resident_peak)) AS data),
      STRUCT('js_gc_heap' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_memory_distribution.memory_js_gc_heap)) AS data),
      STRUCT('memory_unique' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_memory_distribution.memory_unique)) AS data),
      -- GC / CC (nanoseconds -> ms)
      STRUCT('javascript_gc_total_time' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_timing_distribution.javascript_gc_total_time)) AS data),
      STRUCT('javascript_gc_max_pause' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_timing_distribution.javascript_gc_max_pause)) AS data),
      STRUCT('cycle_collector_full' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_timing_distribution.cycle_collector_full)) AS data),
      STRUCT('cycle_collector_max_pause' AS probe,
        ARRAY(SELECT AS STRUCT key, value.values AS vals FROM UNNEST(metrics.labeled_timing_distribution.cycle_collector_max_pause)) AS data)
    ] AS probes
  FROM `mozdata.firefox_desktop.metrics`
  WHERE DATE(submission_timestamp) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH) AND CURRENT_DATE()
    AND normalized_channel = 'release'
    AND sample_id < 1   -- 1% sample; percentiles are stable at this volume
),
per_bucket AS (
  SELECT day, major, p.probe AS probe, proc.key AS process,
         SAFE_CAST(v.key AS INT64) AS bucket, SUM(v.value) AS cnt
  FROM base, UNNEST(probes) AS p, UNNEST(p.data) AS proc, UNNEST(proc.vals) AS v
  -- Drop corrupt overflow buckets: 1e14 is >100 TB for memory and >27 h for
  -- timing -- far above any real value, but below the garbage (~7e17) a stray
  -- client reported (e.g. tab memory_unique on 2026-01-23, which otherwise
  -- pinned the percentile to ~7e17 bytes).
  WHERE SAFE_CAST(v.key AS INT64) BETWEEN 0 AND 100000000000000
  GROUP BY day, major, probe, process, bucket
),
-- Each version's share of that day's samples, per probe and process (each probe
-- has its own denominator -- GC/CC probes are recorded far more often than
-- memory ones). Used to drop the long tail of stragglers on old versions, whose
-- sample counts are too small for a stable percentile.
version_share AS (
  SELECT day, probe, process, major,
    SUM(cnt) / SUM(SUM(cnt)) OVER (PARTITION BY day, probe, process) AS share
  FROM per_bucket
  GROUP BY day, probe, process, major
),
series AS (
  -- 'all': every version pooled. Identical to what this query returned before
  -- the version dimension existed, malformed-version rows included.
  SELECT day, probe, process, 'all' AS version, bucket, SUM(cnt) AS cnt
  FROM per_bucket
  GROUP BY day, probe, process, bucket
  UNION ALL
  -- One series per major version, on days where it holds at least 10% of the
  -- volume, so a version is charted only while it is actually mainstream: it
  -- enters as it ramps up and drops out once it ages into the straggler tail.
  --
  -- The threshold is the readability knob. Release adoption puts the current
  -- version at 60-90% with the previous one fading inside a week, so 10% leaves
  -- roughly 1-3 lines live on any given date. Lower it and old versions pile up
  -- on the right-hand side of the chart as near-flat noise (1% was unreadable);
  -- raise it toward 25% to see only the dominant version at any moment.
  -- Keep the caption in memory.html in sync when changing this.
  SELECT b.day, b.probe, b.process, CAST(b.major AS STRING), b.bucket, b.cnt
  FROM per_bucket b
  JOIN version_share s USING (day, probe, process, major)
  WHERE b.major IS NOT NULL AND s.share >= 0.10
),
cumulative AS (
  SELECT day, probe, process, version, bucket,
    SUM(cnt) OVER (PARTITION BY day, probe, process, version ORDER BY bucket) AS cum,
    SUM(cnt) OVER (PARTITION BY day, probe, process, version) AS total
  FROM series
),
pctl AS (
  SELECT day AS date, probe, process, version,
    MIN(IF(cum >= 0.75 * total, bucket, NULL)) AS p75_raw,
    MIN(IF(cum >= 0.95 * total, bucket, NULL)) AS p95_raw
  FROM cumulative
  GROUP BY date, probe, process, version
)
SELECT
  date,
  process,
  version,
  -- Memory (MB)
  MAX(IF(probe = 'resident_peak', ROUND(p75_raw / 1048576, 1), NULL)) AS resident_peak_p75_mb,
  MAX(IF(probe = 'resident_peak', ROUND(p95_raw / 1048576, 1), NULL)) AS resident_peak_p95_mb,
  MAX(IF(probe = 'js_gc_heap', ROUND(p75_raw / 1048576, 1), NULL)) AS js_gc_heap_p75_mb,
  MAX(IF(probe = 'js_gc_heap', ROUND(p95_raw / 1048576, 1), NULL)) AS js_gc_heap_p95_mb,
  MAX(IF(probe = 'memory_unique', ROUND(p75_raw / 1048576, 1), NULL)) AS memory_unique_p75_mb,
  MAX(IF(probe = 'memory_unique', ROUND(p95_raw / 1048576, 1), NULL)) AS memory_unique_p95_mb,
  -- GC / CC (ms)
  MAX(IF(probe = 'javascript_gc_total_time', ROUND(p75_raw / 1e6, 1), NULL)) AS javascript_gc_total_time_p75_ms,
  MAX(IF(probe = 'javascript_gc_total_time', ROUND(p95_raw / 1e6, 1), NULL)) AS javascript_gc_total_time_p95_ms,
  MAX(IF(probe = 'javascript_gc_max_pause', ROUND(p75_raw / 1e6, 1), NULL)) AS javascript_gc_max_pause_p75_ms,
  MAX(IF(probe = 'javascript_gc_max_pause', ROUND(p95_raw / 1e6, 1), NULL)) AS javascript_gc_max_pause_p95_ms,
  MAX(IF(probe = 'cycle_collector_full', ROUND(p75_raw / 1e6, 1), NULL)) AS cycle_collector_full_p75_ms,
  MAX(IF(probe = 'cycle_collector_full', ROUND(p95_raw / 1e6, 1), NULL)) AS cycle_collector_full_p95_ms,
  MAX(IF(probe = 'cycle_collector_max_pause', ROUND(p75_raw / 1e6, 1), NULL)) AS cycle_collector_max_pause_p75_ms,
  MAX(IF(probe = 'cycle_collector_max_pause', ROUND(p95_raw / 1e6, 1), NULL)) AS cycle_collector_max_pause_p95_ms
FROM pctl
GROUP BY date, process, version
-- 'all' first, then ascending major version (numeric, so 9 sorts before 141).
ORDER BY date, process, IFNULL(SAFE_CAST(version AS INT64), -1)
