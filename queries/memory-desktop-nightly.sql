-- Firefox Desktop memory + GC/CC percentiles per process, last 6 months (NIGHTLY).
--
-- Identical to memory-desktop-release.sql except: channel = 'nightly', NO
-- sample_id filter (nightly population is small), and NO `version` column --
-- per-version comparison only makes sense on release, where a major version is
-- in the wild for weeks. The front-end treats the absent version column as
-- every row belonging to the pooled 'all' series, so the "By major version"
-- checkbox is hidden on this channel.
--
-- Edit BOTH files the same way when adding probes. See
-- memory-desktop-release.sql for the full rationale and the unit conventions
-- (memory -> MB / 1048576; timing -> ms / 1e6).

WITH base AS (
  SELECT
    DATE(submission_timestamp) AS day,
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
    AND normalized_channel = 'nightly'
),
per_bucket AS (
  SELECT day, p.probe AS probe, proc.key AS process,
         SAFE_CAST(v.key AS INT64) AS bucket, SUM(v.value) AS cnt
  FROM base, UNNEST(probes) AS p, UNNEST(p.data) AS proc, UNNEST(proc.vals) AS v
  -- Drop corrupt overflow buckets: 1e14 is >100 TB for memory and >27 h for
  -- timing -- far above any real value, but below the garbage (~7e17) a stray
  -- client reported (e.g. tab memory_unique on 2026-01-23, which otherwise
  -- pinned the percentile to ~7e17 bytes).
  WHERE SAFE_CAST(v.key AS INT64) BETWEEN 0 AND 100000000000000
  GROUP BY day, probe, process, bucket
),
cumulative AS (
  SELECT day, probe, process, bucket,
    SUM(cnt) OVER (PARTITION BY day, probe, process ORDER BY bucket) AS cum,
    SUM(cnt) OVER (PARTITION BY day, probe, process) AS total
  FROM per_bucket
),
pctl AS (
  SELECT day AS date, probe, process,
    MIN(IF(cum >= 0.75 * total, bucket, NULL)) AS p75_raw,
    MIN(IF(cum >= 0.95 * total, bucket, NULL)) AS p95_raw
  FROM cumulative
  GROUP BY date, probe, process
)
SELECT
  date,
  process,
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
GROUP BY date, process
ORDER BY date, process
