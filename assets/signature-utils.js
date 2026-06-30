(function () {
  'use strict';

  // Treeherder publishes several performance signatures for the same logical
  // series. Alongside the plain measurement job it also exposes instrumented
  // variants (etw-profile, gecko-profile, simpleperf, nova, ...) and, on some
  // platforms, fission/non-fission splits. Charting all of them together is what
  // produces the bimodal "mixed signature" data the dashboards have repeatedly
  // regressed on.
  //
  // Every variant layers additional extra_options on top of the base
  // measurement job, so within an (application, platform, suite, test) group the
  // signature with the fewest extra_options is the canonical series. Selecting by
  // that rule -- instead of maintaining a blocklist of variant names -- keeps the
  // dashboards correct automatically when new variant types are introduced. It
  // also naturally yields the non-fission job on Android, where the base job is
  // the one without the 'fission' option.
  function canonicalKey(sig) {
    return [sig.application, sig.machine_platform, sig.suite, sig.test].join('|');
  }

  function isMoreCanonical(candidate, current) {
    const candidateOptions = (candidate.extra_options || []).length;
    const currentOptions = (current.extra_options || []).length;
    if (candidateOptions !== currentOptions) {
      return candidateOptions < currentOptions;
    }
    // Deterministic tie-break: prefer the most recently created signature.
    return candidate.id > current.id;
  }

  // Reduce a list of candidate signatures to the single canonical signature for
  // each (application, platform, suite, test) group.
  function selectCanonicalSignatures(signatures) {
    const canonical = new Map();
    for (const sig of signatures) {
      const key = canonicalKey(sig);
      const current = canonical.get(key);
      if (!current || isMoreCanonical(sig, current)) {
        canonical.set(key, sig);
      }
    }
    return [...canonical.values()];
  }

  window.PerfSignatures = { selectCanonicalSignatures };
})();
