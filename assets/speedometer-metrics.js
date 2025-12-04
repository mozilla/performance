// Global state
window.speedometerData = {
  allData: [],
  signatures: {},
  selectedPlatform: 'windows11-64-shippable-qr',
  selectedTest: 'score',
  repository: 'mozilla-central',
  framework: 13, // Speedometer framework ID
  alerts: {},
  alertSummaries: {},
  showAllAlerts: false,
  hideAlerts: false,
  showReplicates: false
};

const searchParams = new URLSearchParams(window.location.search);
var timeChart;
var bugsChart;
var referencePoint = null;

// Platform configurations
const platformConfigs = {
  'windows': {
    platforms: ['windows11-64-24h2-nightlyasrelease', 'windows11-64-24h2-shippable'],
    supportsSafari: false
  },
  'osx': {
    platforms: ['macosx1015-64-nightlyasrelease-qr', 'macosx1015-64-shippable-qr'],
    supportsSafari: false
  },
  'osxm4': {
    platforms: ['macosx1500-aarch64-shippable'],
    supportsSafari: true
  },
  'linux': {
    platforms: ['linux1804-64-nightlyasrelease-qr', 'linux1804-64-shippable-qr'],
    supportsSafari: false
  },
  'android-a55': {
    platforms: ['android-hw-a55-14-0-aarch64-shippable'],
    supportsSafari: false
  },
  'android-s24': {
    platforms: ['android-hw-s24-14-0-aarch64-shippable'],
    supportsSafari: false
  },
  'android-p6': {
    platforms: ['android-hw-p6-13-0-aarch64-shippable'],
    supportsSafari: false
  }
};

// Initialize platform
const osParam = searchParams.get('os') || 'osxm4';
const platformConfig = platformConfigs[osParam] || platformConfigs['osxm4'];
window.speedometerData.selectedPlatform = platformConfig.platforms[0];

// Initialize repository from URL parameter
const repoParam = searchParams.get('repository') || searchParams.get('repo');
if (repoParam === 'autoland') {
  window.speedometerData.repository = 'autoland';
}

// Initialize replicates toggle from URL parameter
const replicatesParam = searchParams.get('replicates');
if (replicatesParam === 'true' || replicatesParam === '1') {
  window.speedometerData.showReplicates = true;
}

function round(number, decimals) {
  return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function getDiffColor(diff) {
  if (diff < -0.05) {
    return 'green';
  } else if (diff < 0.095) {
    return 'black';
  } else if (diff < 0.2) {
    return '#b38f00';
  } else {
    return 'red';
  }
}

// Load data from Treeherder API
async function loadSpeedometerData(loadInitialChart = true) {
  try {
    // Show loading spinner on initial load
    if (loadInitialChart) {
      showChartLoading();
    }

    console.log('Loading Speedometer data from Treeherder...');

    const platforms = platformConfig.platforms;
    const allSignatures = {};

    // Fetch signatures for all platforms
    for (const platform of platforms) {
      // Fetch Firefox signatures from selected repository
      console.log(`Fetching Firefox signatures for platform: ${platform} from ${window.speedometerData.repository}`);
      const firefoxSigUrl = `https://treeherder.mozilla.org/api/project/${window.speedometerData.repository}/performance/signatures/?framework=${window.speedometerData.framework}&platform=${platform}`;
      const firefoxSigResponse = await fetch(firefoxSigUrl);
      const firefoxSignatures = await firefoxSigResponse.json();

      let firefoxSigCount = 0;
      for (const [sigId, sig] of Object.entries(firefoxSignatures)) {
        if (sig.suite === 'speedometer3' && (sig.application === 'firefox' || sig.application === 'fenix')) {
          allSignatures[sigId] = { ...sig, repository: window.speedometerData.repository };
          firefoxSigCount++;
        }
      }
      console.log(`  Found ${firefoxSigCount} Firefox signatures for ${platform}`);

      // Always fetch Chrome/Safari signatures from mozilla-central
      console.log(`Fetching Chrome/Safari signatures for platform: ${platform} from mozilla-central`);
      const chromeSigUrl = `https://treeherder.mozilla.org/api/project/mozilla-central/performance/signatures/?framework=${window.speedometerData.framework}&platform=${platform}`;
      const chromeSigResponse = await fetch(chromeSigUrl);
      const chromeSignatures = await chromeSigResponse.json();

      let chromeSigCount = 0;
      for (const [sigId, sig] of Object.entries(chromeSignatures)) {
        if (sig.suite === 'speedometer3' && sig.application !== 'firefox' && sig.application !== 'fenix') {
          allSignatures[sigId] = { ...sig, repository: 'mozilla-central' };
          chromeSigCount++;
        }
      }
      console.log(`  Found ${chromeSigCount} Chrome/Safari signatures for ${platform}`);
    }

    console.log(`Found ${Object.keys(allSignatures).length} total Speedometer signatures`);
    window.speedometerData.signatures = allSignatures;

    // Hardcoded list of tests to display
    const testsToDisplay = [
      'Charts-chartjs/total',
      'Charts-observable-plot/total',
      'Editor-CodeMirror/total',
      'Editor-TipTap/total',
      'NewsSite-Next/total',
      'NewsSite-Nuxt/total',
      'Perf-Dashboard/total',
      'React-Stockcharts-SVG/total',
      'TodoMVC-Angular-Complex-DOM/total',
      'TodoMVC-Backbone/total',
      'TodoMVC-JavaScript-ES5/total',
      'TodoMVC-JavaScript-ES6-Webpack-Complex-DOM/total',
      'TodoMVC-jQuery/total',
      'TodoMVC-Lit-Complex-DOM/total',
      'TodoMVC-Preact-Complex-DOM/total',
      'TodoMVC-React-Complex-DOM/total',
      'TodoMVC-React-Redux/total',
      'TodoMVC-Svelte-Complex-DOM/total',
      'TodoMVC-Vue/total',
      'TodoMVC-WebComponents/total',
      'score'
    ];

    // Filter signatures to only the tests we display
    const relevantSignatures = Object.values(allSignatures).filter(
      sig => testsToDisplay.includes(sig.test)
    );

    console.log(`Loading data for ${relevantSignatures.length} relevant tests`);

    // Load 30 days of data for these specific tests (for table) - CaR doesn't run as frequently
    await loadDataForPeriod(30, relevantSignatures);

    // Display initial chart with score (only if loadInitialChart is true)
    if (loadInitialChart) {
      await loadChartDataForTest('score', 90); // 90 days for chart
    }

    // Display table
    displayTable();

  } catch (error) {
    console.error('Error loading Speedometer data:', error);
  }
}

async function loadDataForPeriod(days, signatures) {
  const intervalSeconds = days * 24 * 60 * 60;
  const allData = [];

  const fetchPromises = signatures.map(async (sig) => {
    try {
      const repository = sig.repository || window.speedometerData.repository;
      const replicatesParam = window.speedometerData.showReplicates ? '&replicates=true' : '';
      const dataUrl = `https://treeherder.mozilla.org/api/performance/summary/?repository=${repository}&signature=${sig.id}&framework=${window.speedometerData.framework}&interval=${intervalSeconds}&all_data=true${replicatesParam}`;
      const dataResponse = await fetch(dataUrl);
      const perfData = await dataResponse.json();

      const dataPoints = [];
      if (Array.isArray(perfData) && perfData.length > 0 && perfData[0].data) {
        // /performance/summary/ returns array with data field
        const seriesData = perfData[0].data;
        console.log(`Loaded ${seriesData.length} data points for ${sig.test} (replicates: ${window.speedometerData.showReplicates})`);
        for (const point of seriesData) {
          const timestamp = point.push_timestamp;
          const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp * 1000;
          dataPoints.push({
            date: new Date(timestampMs),
            test: sig.test,
            suite: sig.suite,
            platform: sig.machine_platform,
            application: sig.application,
            signature_id: sig.id,
            value: point.value,
            push_timestamp: timestampMs / 1000,
            revision: point.revision,
            job_id: point.job_id
          });
        }
      } else {
        console.log('Unexpected API response format for', sig.test, ':', perfData);
      }
      return dataPoints;
    } catch (error) {
      console.error(`Error fetching signature ${sig.id}:`, error);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(dataPoints => allData.push(...dataPoints));

  console.log(`Loaded ${allData.length} data points for ${days} days`);
  window.speedometerData.allData = allData;

  return allData;
}

async function loadChartDataForTest(testName, days) {
  console.log(`Loading ${days} days of data for ${testName}`);

  // Show loading spinner
  showChartLoading();

  // Find signatures for this test
  const testSignatures = Object.values(window.speedometerData.signatures).filter(
    sig => sig.test === testName
  );

  if (testSignatures.length === 0) {
    console.warn(`No signatures found for test: ${testName}`);
    hideChartLoading();
    return;
  }

  // Get all unique platforms for this test
  const platforms = [...new Set(testSignatures.map(sig => sig.machine_platform))];

  // Clear existing alerts for this test before fetching new ones
  window.speedometerData.alerts[testName] = [];

  // Load data for this test (without overwriting allData)
  const intervalSeconds = days * 24 * 60 * 60;
  const chartData = [];

  const fetchPromises = testSignatures.map(async (sig) => {
    try {
      const repository = sig.repository || window.speedometerData.repository;
      const replicatesParam = window.speedometerData.showReplicates ? '&replicates=true' : '';
      const dataUrl = `https://treeherder.mozilla.org/api/performance/summary/?repository=${repository}&signature=${sig.id}&framework=${window.speedometerData.framework}&interval=${intervalSeconds}&all_data=true${replicatesParam}`;
      const dataResponse = await fetch(dataUrl);
      const perfData = await dataResponse.json();

      const dataPoints = [];
      if (Array.isArray(perfData) && perfData.length > 0 && perfData[0].data) {
        // /performance/summary/ returns array with data field
        const seriesData = perfData[0].data;
        console.log(`Chart: Loaded ${seriesData.length} data points for ${sig.test} (replicates: ${window.speedometerData.showReplicates})`);
        for (const point of seriesData) {
          const timestamp = point.push_timestamp;
          const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp * 1000;
          dataPoints.push({
            date: new Date(timestampMs),
            test: sig.test,
            suite: sig.suite,
            platform: sig.machine_platform,
            application: sig.application,
            signature_id: sig.id,
            value: point.value,
            push_timestamp: timestampMs / 1000,
            revision: point.revision,
            job_id: point.job_id
          });
        }
      } else {
        console.log('Chart: Unexpected API response format for', sig.test, ':', perfData);
      }
      return dataPoints;
    } catch (error) {
      console.error(`Error fetching signature ${sig.id}:`, error);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(dataPoints => chartData.push(...dataPoints));

  // Fetch alerts for all platforms this test appears on
  for (const platform of platforms) {
    await fetchAlertsForTest(testName, platform, days);
  }

  // Display chart
  displayChart(chartData, testName);
  hideChartLoading();
}

async function fetchAlertsForTest(testName, platform, days) {
  try {
    console.log(`Fetching alerts for ${testName} on ${platform}...`);

    // First, get the autoland signature IDs for this test and its parts
    const sigUrl = `https://treeherder.mozilla.org/api/project/autoland/performance/signatures/?framework=13&platform=${platform}`;
    const sigResponse = await fetch(sigUrl);
    const signatures = await sigResponse.json();

    // Find all signatures for this test and its subparts
    const autolandSigIds = [];
    const baseTestName = testName.replace('/total', '');

    for (const [sigId, sig] of Object.entries(signatures)) {
      if (sig.suite === 'speedometer3' &&
          sig.test &&
          (sig.application === 'firefox' || sig.application === 'fenix')) {
        // Match exact test or any subpart (e.g., "NewsSite-Nuxt/NavigateToPolitics/total" matches "NewsSite-Nuxt")
        if (sig.test === testName || sig.test.startsWith(baseTestName + '/')) {
          autolandSigIds.push(sig.id);
        }
      }
    }

    if (autolandSigIds.length === 0) {
      console.log(`No autoland signatures found for ${testName}`);
      window.speedometerData.alerts[testName] = [];
      return;
    }

    console.log(`Found ${autolandSigIds.length} signatures for ${testName} and its parts`);

    // Fetch alerts for all signatures in parallel
    const timerangeSeconds = days * 24 * 60 * 60;
    const allAlerts = [];
    const relatedSummariesToFetch = new Set();

    const alertPromises = autolandSigIds.map(async (sigId) => {
      const summaryUrl = `https://treeherder.mozilla.org/api/performance/alertsummary/?alerts__series_signature=${sigId}&repository=77&limit=100&timerange=${timerangeSeconds}`;
      const summaryResponse = await fetch(summaryUrl);
      const summaryData = await summaryResponse.json();

      const sigAlerts = [];

      if (summaryData.results) {
        for (const summary of summaryData.results) {
          for (const alert of summary.alerts) {
            if (alert.series_signature.id === sigId) {
              sigAlerts.push({
                ...alert,
                push_timestamp: summary.push_timestamp,
                summary_id: summary.id,
                repository: 'autoland'
              });

              if (!window.speedometerData.alertSummaries[summary.id]) {
                window.speedometerData.alertSummaries[summary.id] = summary;
              }

              // Track if this alert was reassigned
              if (alert.related_summary_id) {
                relatedSummariesToFetch.add(alert.related_summary_id);
              }
            }
          }
        }
      }

      return sigAlerts;
    });

    const alertResults = await Promise.all(alertPromises);
    alertResults.forEach(sigAlerts => allAlerts.push(...sigAlerts));

    // Fetch reassigned-to summaries
    for (const relatedId of relatedSummariesToFetch) {
      if (!window.speedometerData.alertSummaries[relatedId]) {
        try {
          const relatedUrl = `https://treeherder.mozilla.org/api/performance/alertsummary/${relatedId}/`;
          const relatedResponse = await fetch(relatedUrl);
          const relatedData = await relatedResponse.json();
          window.speedometerData.alertSummaries[relatedId] = relatedData;

          // Find alerts for this test or its parts in the reassigned summary
          const reassignedAlerts = relatedData.alerts.filter(a => {
            const alertTest = a.series_signature.test;
            return alertTest === testName || alertTest.startsWith(baseTestName + '/');
          });

          if (reassignedAlerts.length > 0) {
            // Add all reassigned alerts for this test
            reassignedAlerts.forEach(reassignedAlert => {
              allAlerts.push({
                ...reassignedAlert,
                push_timestamp: relatedData.push_timestamp,
                summary_id: relatedId,
                repository: 'autoland'
              });
            });
            console.log(`Found ${reassignedAlerts.length} reassigned alert(s) for ${testName} in summary ${relatedId}`);
          } else {
            console.log(`No ${testName} alert found in reassigned summary ${relatedId}`);
          }
        } catch (err) {
          console.error(`Error fetching related summary ${relatedId}:`, err);
        }
      }
    }

    // Store alerts by test name (accumulate from multiple platforms)
    if (!window.speedometerData.alerts[testName]) {
      window.speedometerData.alerts[testName] = [];
    }
    window.speedometerData.alerts[testName].push(...allAlerts);
    console.log(`Loaded ${allAlerts.length} alerts for ${testName}:`);
    allAlerts.forEach(a => {
      console.log(`  Summary ${a.summary_id}: ${a.amount_pct}%`);
    });
  } catch (error) {
    console.error(`Error fetching alerts for ${testName}:`, error);
  }
}

function displayTable() {
  const tbody = document.getElementById('tableBodyLikely');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Hardcoded list of tests to display
  const testsToDisplay = [
    'Charts-chartjs/total',
    'Charts-observable-plot/total',
    'Editor-CodeMirror/total',
    'Editor-TipTap/total',
    'NewsSite-Next/total',
    'NewsSite-Nuxt/total',
    'Perf-Dashboard/total',
    'React-Stockcharts-SVG/total',
    'TodoMVC-Angular-Complex-DOM/total',
    'TodoMVC-Backbone/total',
    'TodoMVC-JavaScript-ES5/total',
    'TodoMVC-JavaScript-ES6-Webpack-Complex-DOM/total',
    'TodoMVC-jQuery/total',
    'TodoMVC-Lit-Complex-DOM/total',
    'TodoMVC-Preact-Complex-DOM/total',
    'TodoMVC-React-Complex-DOM/total',
    'TodoMVC-React-Redux/total',
    'TodoMVC-Svelte-Complex-DOM/total',
    'TodoMVC-Vue/total',
    'TodoMVC-WebComponents/total',
    'score'
  ];

  console.log(`Displaying table with ${testsToDisplay.length} tests from ${window.speedometerData.allData.length} data points`);

  // Calculate averages for each test
  testsToDisplay.forEach(testName => {
    const testData = window.speedometerData.allData.filter(d => d.test === testName);

    console.log(testData[0])

    const firefoxData = testData.filter(d => (d.application === 'firefox' || d.application === 'fenix') && !d.platform.includes("nightlyasrelease"));
    const firefoxNarData = testData.filter(d => (d.application === 'firefox' || d.application === 'fenix') && d.platform.includes("nightlyasrelease"));
    const chromeData = testData.filter(d => d.application === 'chrome' || d.application === 'chrome-m');
    const carData = testData.filter(d => d.application === 'custom-car' || d.application === 'cstm-car-m');
    const safariData = testData.filter(d => d.application === 'safari');
    const safariTPData = testData.filter(d => d.application === 'safari-tp');

    const firefoxAvg = calculateAverage(firefoxData);
    const firefoxNarAvg = calculateAverage(firefoxNarData);
    const chromeAvg = calculateAverage(chromeData);
    const carAvg = calculateAverage(carData);
    const safariAvg = calculateAverage(safariData);
    const safariTPAvg = calculateAverage(safariTPData);

    // Debug for first test
    if (testName === 'score') {
      console.log(`Score data - Firefox: ${firefoxData.length} points, Chrome: ${chromeData.length} points, CaR: ${carData.length} points`);
      if (carData.length > 0) {
        console.log('Sample CaR data:', carData[0]);
      }
    }

    if (firefoxAvg === 0) return; // Skip if no Firefox data

    // Calculate differences
    const isScore = testName === 'score';

    let chromeDiff = 0, carDiff = 0, safariDiff = 0, safariTPDiff = 0;

    if (isScore) {
      // For score: higher is better, so Firefox > Chrome is good
      chromeDiff = chromeAvg > 0 ? (firefoxAvg - chromeAvg) / chromeAvg : 0;
      carDiff = carAvg > 0 ? (firefoxAvg - carAvg) / carAvg : 0;
      safariDiff = safariAvg > 0 ? (firefoxAvg - safariAvg) / safariAvg : 0;
      safariTPDiff = safariTPAvg > 0 ? (firefoxAvg - safariTPAvg) / safariTPAvg : 0;
    } else {
      // For time (ms): lower is better, so Chrome > Firefox is bad for us
      chromeDiff = chromeAvg > 0 ? (firefoxAvg - chromeAvg) / firefoxAvg : 0;
      carDiff = carAvg > 0 ? (firefoxAvg - carAvg) / firefoxAvg : 0;
      safariDiff = safariAvg > 0 ? (firefoxAvg - safariAvg) / firefoxAvg : 0;
      safariTPDiff = safariTPAvg > 0 ? (firefoxAvg - safariTPAvg) / safariTPAvg : 0;
    }

    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.onclick = () => selectTest(testName);

    // Determine display name and unit
    const displayName = testName === 'score' ? 'Overall Score' : testName.replace('/total', '');
    const unit = testName === 'score' ? '' : ' ms';

    // For score, invert the color logic (positive diff is good, negative is bad)
    const getColorForDiff = (diff) => {
      if (isScore) {
        // For score: positive difference means Firefox is better (good)
        return getDiffColor(-diff);
      } else {
        // For time: use normal logic
        return getDiffColor(diff);
      }
    };

    let html = `<th scope="row" class="testName">${displayName}</th>`;
    html += `<td>${firefoxAvg > 0 ? round(firefoxAvg, 2) + unit : ''}</td>`;
    html += `<td>${firefoxNarAvg > 0 ? round(firefoxNarAvg, 2) + unit : ''}</td>`;
    html += `<td>${chromeAvg > 0 ? round(chromeAvg, 2) + unit : 'N/A'}</td>`;
    html += `<td>${carAvg > 0 ? round(carAvg, 2) + unit : 'N/A'}</td>`;

    if (platformConfig.supportsSafari) {
      html += `<td>${safariAvg > 0 ? round(safariAvg, 2) + unit : 'N/A'}</td>`;
      html += `<td>${safariTPAvg > 0 ? round(safariTPAvg, 2) + unit : 'N/A'}</td>`;
    }

    html += `<td style="color: ${getColorForDiff(chromeDiff)}">${chromeAvg > 0 ? round(chromeDiff * 100, 1) + '%' : 'N/A'}</td>`;
    html += `<td style="color: ${getColorForDiff(carDiff)}">${carAvg > 0 ? round(carDiff * 100, 1) + '%' : 'N/A'}</td>`;

    if (platformConfig.supportsSafari) {
      html += `<td style="color: ${getColorForDiff(safariDiff)}">${safariAvg > 0 ? round(safariDiff * 100, 1) + '%' : 'N/A'}</td>`;
      html += `<td style="color: ${getColorForDiff(safariTPDiff)}">${safariTPAvg > 0 ? round(safariTPDiff * 100, 1) + '%' : 'N/A'}</td>`;
    }

    row.innerHTML = html;
    tbody.appendChild(row);
  });
}

function calculateAverage(data) {
  if (data.length === 0) return 0;

  // Sort by date descending to get most recent first
  const sortedData = [...data].sort((a, b) => b.date - a.date);

  // Get the most recent date
  const mostRecentDate = sortedData[0].date;

  // Calculate cutoff date (7 days before most recent)
  const cutoffDate = new Date(mostRecentDate);
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  // Filter to last 7 days
  const last7Days = sortedData.filter(d => d.date >= cutoffDate);

  if (last7Days.length === 0) return 0;

  const sum = last7Days.reduce((acc, d) => acc + d.value, 0);
  return sum / last7Days.length;
}

function selectTest(testName) {
  window.speedometerData.selectedTest = testName;
  loadChartDataForTest(testName, 90); // Load 90 days for chart
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changeRange(range) {
  let days;
  if (range === 'all') {
    days = 365;
  } else if (range === 3) {
    days = 90;
  } else if (range === 1) {
    days = 30;
  }

  referencePoint = null;
  loadChartDataForTest(window.speedometerData.selectedTest, days);
}

async function toggleRepository(checked) {
  window.speedometerData.repository = checked ? 'autoland' : 'mozilla-central';

  console.log(`Switching to ${window.speedometerData.repository}`);

  const url = new URL(window.location);
  if (checked) {
    url.searchParams.set('repository', 'autoland');
  } else {
    url.searchParams.delete('repository');
  }
  window.history.replaceState({}, '', url);

  showChartLoading();

  // Remember the currently selected test
  const currentTest = window.speedometerData.selectedTest;

  // Reload the table data (without loading the initial chart)
  await loadSpeedometerData(false);

  // Reload the chart for the currently selected test
  const days = window.speedometerData.days || 30;
  await loadChartDataForTest(currentTest, days);

  hideChartLoading();
}

async function toggleReplicates(checked) {
  window.speedometerData.showReplicates = checked;

  console.log(`${checked ? 'Showing' : 'Hiding'} replicates`);

  const url = new URL(window.location);
  if (checked) {
    url.searchParams.set('replicates', 'true');
  } else {
    url.searchParams.delete('replicates');
  }
  window.history.replaceState({}, '', url);

  showChartLoading();

  // Remember the currently selected test
  const currentTest = window.speedometerData.selectedTest;

  // Reload the table data (without loading the initial chart)
  await loadSpeedometerData(false);

  // Reload the chart for the currently selected test
  const days = window.speedometerData.days || 30;
  await loadChartDataForTest(currentTest, days);

  hideChartLoading();
}

async function toggleAllAlerts(checked) {
  window.speedometerData.showAllAlerts = checked;

  if (checked && window.speedometerData.selectedTest === 'score') {
    // Show loading spinner while fetching
    showChartLoading();

    // Fetch alerts for all subtests
    await fetchAllSubtestAlerts(90);

    hideChartLoading();
  }

  // Redraw chart with updated annotations
  if (timeChart) {
    timeChart.options.plugins.annotation.annotations = getAlertAnnotations(null, window.speedometerData.selectedTest);
    timeChart.update();
  }
}

function toggleHideAlerts(checked) {
  window.speedometerData.hideAlerts = checked;

  // Redraw chart with updated annotations
  if (timeChart) {
    timeChart.options.plugins.annotation.annotations = getAlertAnnotations(null, window.speedometerData.selectedTest);
    timeChart.update();
  }
}

async function fetchAllSubtestAlerts(days) {
  const testsToDisplay = [
    'Charts-chartjs/total',
    'Charts-observable-plot/total',
    'Editor-CodeMirror/total',
    'Editor-TipTap/total',
    'NewsSite-Next/total',
    'NewsSite-Nuxt/total',
    'Perf-Dashboard/total',
    'React-Stockcharts-SVG/total',
    'TodoMVC-Angular-Complex-DOM/total',
    'TodoMVC-Backbone/total',
    'TodoMVC-JavaScript-ES5/total',
    'TodoMVC-JavaScript-ES6-Webpack-Complex-DOM/total',
    'TodoMVC-jQuery/total',
    'TodoMVC-Lit-Complex-DOM/total',
    'TodoMVC-Preact-Complex-DOM/total',
    'TodoMVC-React-Complex-DOM/total',
    'TodoMVC-React-Redux/total',
    'TodoMVC-Svelte-Complex-DOM/total',
    'TodoMVC-Vue/total',
    'TodoMVC-WebComponents/total'
  ];

  console.log('Fetching alerts for all subtests in parallel...');

  // Get all platforms we're using
  const platforms = platformConfig.platforms;

  // Fetch all tests from all platforms in parallel
  const fetchPromises = [];
  for (const test of testsToDisplay) {
    for (const platform of platforms) {
      fetchPromises.push(fetchAlertsForTest(test, platform, days));
    }
  }

  await Promise.all(fetchPromises);
}

function showChartLoading() {
  const parent = document.getElementById('chart-container');
  if (!parent) return;

  let loader = document.getElementById('chart-loader');

  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'chart-loader';
    loader.style.cssText = 'position: absolute; top: 200px; left: 50%; transform: translateX(-50%); text-align: center; z-index: 1000;';
    loader.innerHTML = `
      <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid #ddd; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 15px; font-size: 14px; color: #666; font-weight: 600;">Loading chart data...</div>
    `;
    parent.appendChild(loader);
  }

  loader.style.display = 'block';

  const chartCanvas = document.getElementById('myChart');
  if (chartCanvas) {
    chartCanvas.style.opacity = '0.3';
  }
}

function hideChartLoading() {
  const loader = document.getElementById('chart-loader');
  const chartContainer = document.getElementById('myChart');

  if (loader) {
    loader.style.display = 'none';
  }
  if (chartContainer) {
    chartContainer.style.opacity = '1';
  }
}

function getAlertAnnotations(firefoxSigId, testName) {
  const annotations = {};

  // If alerts are hidden, return empty
  if (window.speedometerData.hideAlerts) {
    return annotations;
  }

  const showingAllAlerts = testName === 'score' && window.speedometerData.showAllAlerts;

  let alertsToShow = [];

  if (showingAllAlerts) {
    // Collect all alerts from all subtests
    for (const [key, alertList] of Object.entries(window.speedometerData.alerts)) {
      alertsToShow.push(...alertList);
    }

    // Build reassignment map: old summary -> new summary
    const reassignmentMap = new Map();
    alertsToShow.forEach(alert => {
      if (alert.related_summary_id) {
        reassignmentMap.set(alert.summary_id, alert.related_summary_id);
      }
    });

    // Group alerts by their final summary (following reassignment chain)
    // Filter out invalid alerts (status 3)
    const alertsByFinalSummary = new Map();
    alertsToShow.forEach(alert => {
      // Skip invalid alerts
      if (alert.status === 3) return;

      let finalSummaryId = alert.summary_id;

      // Follow reassignment chain if this alert was reassigned
      if (alert.related_summary_id) {
        finalSummaryId = alert.related_summary_id;
      }

      if (!alertsByFinalSummary.has(finalSummaryId)) {
        alertsByFinalSummary.set(finalSummaryId, []);
      }
      alertsByFinalSummary.get(finalSummaryId).push(alert);
    });

    // Create annotations for final summaries only
    for (const [summaryId, alerts] of alertsByFinalSummary.entries()) {
      // Skip if this summary itself was reassigned
      if (reassignmentMap.has(summaryId)) continue;

      const summary = window.speedometerData.alertSummaries[summaryId];
      if (!summary) continue;

      const alertDate = new Date(summary.push_timestamp * 1000);
      const alertUrl = `https://treeherder.mozilla.org/perfherder/alerts?id=${summaryId}`;

      // Build list of affected tests with their regression/improvement status
      // Group by test suite (e.g., "Editor-TipTap") and find largest change
      const testChanges = new Map();

      alerts.forEach(a => {
        if (!a.series_signature) return;

        const fullTest = a.series_signature.test;
        if (fullTest === 'score') return;

        // Extract base test name (e.g., "Editor-TipTap" from "Editor-TipTap/Highlight/Async")
        const baseTest = fullTest.split('/')[0];
        const isTotal = fullTest.endsWith('/total');
        const pct = a.amount_pct || 0;

        if (Math.abs(pct) < 0.01) return; // Skip negligible changes

        // If we already have this test, keep the /total or the largest change
        if (testChanges.has(baseTest)) {
          const existing = testChanges.get(baseTest);
          // Prefer /total, or keep the larger absolute change
          if (!existing.isTotal && (isTotal || Math.abs(pct) > Math.abs(existing.pct))) {
            testChanges.set(baseTest, { pct, isTotal, isRegression: a.is_regression });
          }
        } else {
          testChanges.set(baseTest, { pct, isTotal, isRegression: a.is_regression });
        }
      });

      // Separate into improvements and regressions
      const improvements = [];
      const regressions = [];

      for (const [test, change] of testChanges.entries()) {
        // For regressions, show as negative; for improvements, show as positive
        const sign = change.isRegression ? '-' : '+';
        const absPct = Math.abs(change.pct).toFixed(1);
        const formatted = `${test}: ${sign}${absPct}%`;

        if (change.isRegression) {
          regressions.push(formatted);
        } else {
          improvements.push(formatted);
        }
      }

      // Determine overall color based on net impact
      const improvementCount = improvements.length;
      const regressionCount = regressions.length;
      const netPositive = improvementCount > regressionCount;

      const borderColor = netPositive ? 'rgba(0, 200, 0, 0.6)' : 'rgba(255, 0, 0, 0.6)';
      const labelBgColor = netPositive ? 'rgba(0, 200, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)';

      // Build label with improvements first, then regressions
      const labelContent = [
        `Alert ${summaryId}`,
        ...improvements.slice(0, 8),
        ...regressions.slice(0, 8)
      ];

      annotations[`alert_${summaryId}`] = {
        type: 'line',
        xMin: alertDate,
        xMax: alertDate,
        borderColor: borderColor,
        borderWidth: 2,
        label: {
          display: false,
          content: labelContent,
          position: 'end',
          yAdjust: 10,
          backgroundColor: netPositive ? 'rgba(200, 255, 200, 0.98)' : 'rgba(255, 200, 200, 0.98)',
          borderColor: netPositive ? 'rgba(0, 200, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)',
          borderWidth: 1,
          borderRadius: 4,
          color: 'black',
          font: {
            size: 11,
            weight: 'bold'
          },
          padding: 6
        },
        enter(ctx) {
          if (!ctx.element.label.options.display) {
            ctx.element.label.options.display = true;
          }
          return true;
        },
        leave(ctx) {
          if (ctx.element.label.options.display) {
            ctx.element.label.options.display = false;
          }
          return true;
        },
        click() {
          window.open(alertUrl, '_blank');
        }
      };
    }
  } else {
    // Show alerts only for this specific test
    alertsToShow = window.speedometerData.alerts[testName] || [];

    // For single test, group by final summary (following reassignment)
    // Filter out invalid alerts (status 3)
    const summaryMap = new Map();
    const alertsBySummary = new Map();
    const baseTestName = testName.replace('/total', '');

    alertsToShow.forEach(alert => {
      // Skip invalid alerts
      if (alert.status === 3) return;

      const finalSummaryId = alert.related_summary_id || alert.summary_id;

      // Group all alerts by their final summary
      if (!alertsBySummary.has(finalSummaryId)) {
        alertsBySummary.set(finalSummaryId, []);
      }
      alertsBySummary.get(finalSummaryId).push(alert);

      // Keep one representative alert for the annotation
      if (!summaryMap.has(finalSummaryId)) {
        summaryMap.set(finalSummaryId, alert);
      }
    });

    const alertsToDisplay = Array.from(summaryMap.values());

    alertsToDisplay.forEach((alert, index) => {
      if (!alert.push_timestamp) return;

      const finalSummaryId = alert.related_summary_id || alert.summary_id;
      const alertDate = new Date(alert.push_timestamp * 1000);
      const alertUrl = `https://treeherder.mozilla.org/perfherder/alerts?id=${finalSummaryId}`;

      // Get all alerts for this summary
      const relatedAlerts = alertsBySummary.get(finalSummaryId) || [alert];

      // Find the /total alert if it exists, otherwise use the largest change
      let displayAlert = relatedAlerts.find(a => a.series_signature && a.series_signature.test && a.series_signature.test.endsWith('/total'));
      if (!displayAlert) {
        displayAlert = relatedAlerts.reduce((max, a) =>
          Math.abs(a.amount_pct || 0) > Math.abs(max.amount_pct || 0) ? a : max
        , relatedAlerts[0]);
      }

      const amountPct = Math.abs(displayAlert.amount_pct || 0).toFixed(1);

      // Build hover content with all parts
      const parts = relatedAlerts.map(a => {
        if (!a.series_signature || !a.series_signature.test) return null;
        const subtest = a.series_signature.test.replace(baseTestName, '').replace(/^\//, '');
        const pct = Math.abs(a.amount_pct || 0).toFixed(1);
        return subtest ? `${subtest}: ${pct}%` : `${pct}%`;
      }).filter(p => p !== null);

      // Create default and hover annotations separately
      const hoverText = `#${finalSummaryId}: ${amountPct}%`;

      // Default annotation with small label
      annotations[`alert_${index}_default`] = {
        type: 'line',
        xMin: alertDate,
        xMax: alertDate,
        drawTime: 'beforeDatasetsDraw',
        borderColor: displayAlert.is_regression ? 'rgba(255, 0, 0, 0.6)' : 'rgba(0, 200, 0, 0.6)',
        borderWidth: 2,
        label: {
          display: true,
          content: `${amountPct}%`,
          position: 'end',
          yAdjust: 10,
          drawTime: 'afterDatasetsDraw',
          backgroundColor: displayAlert.is_regression ? 'rgba(255, 200, 200, 0.98)' : 'rgba(200, 255, 200, 0.98)',
          borderColor: displayAlert.is_regression ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 200, 0, 0.8)',
          borderWidth: 1,
          borderRadius: 4,
          color: 'black',
          font: {
            size: 11,
            weight: 'bold'
          },
          padding: 6
        },
        enter(ctx) {
          annotations[`alert_${index}_default`].label.display = false;
          annotations[`alert_${index}_hover`].label.display = true;
          ctx.chart.update('none');
          return true;
        },
        click() {
          window.open(alertUrl, '_blank');
        }
      };

      // Hover annotation with larger label (hidden by default)
      // Stagger the yAdjust for consecutive alerts to reduce overlap
      const yOffset = 10 + (index % 3) * 30;

      annotations[`alert_${index}_hover`] = {
        type: 'line',
        xMin: alertDate,
        xMax: alertDate,
        drawTime: 'beforeDatasetsDraw',
        borderColor: displayAlert.is_regression ? 'rgba(255, 0, 0, 0.6)' : 'rgba(0, 200, 0, 0.6)',
        borderWidth: 2,
        z: -1,
        label: {
          display: false,
          content: hoverText,
          position: 'end',
          yAdjust: yOffset,
          drawTime: 'afterDatasetsDraw',
          backgroundColor: displayAlert.is_regression ? 'rgba(255, 200, 200, 0.98)' : 'rgba(200, 255, 200, 0.98)',
          borderColor: displayAlert.is_regression ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 200, 0, 0.8)',
          borderWidth: 1,
          borderRadius: 4,
          color: 'black',
          font: {
            size: 11,
            weight: 'bold'
          },
          padding: 6
        },
        leave(ctx) {
          annotations[`alert_${index}_default`].label.display = true;
          annotations[`alert_${index}_hover`].label.display = false;
          ctx.chart.update('none');
          return true;
        },
        click() {
          window.open(alertUrl, '_blank');
        }
      };
    });
  }

  return annotations;
}

function displayChart(data, testName) {
  const ctx = document.getElementById('myChart');
  if (!ctx) return;

  if (timeChart) {
    timeChart.destroy();
  }

  // Update chart title
  const isScore = testName === 'score';
  const displayName = isScore ? 'Overall Score' : testName.replace('/total', '');
  const betterDirection = isScore ? 'higher is better' : 'lower is better';

  const chartTitleElement = document.getElementById('chart-title');
  if (chartTitleElement) {
    chartTitleElement.innerHTML = `<a id="chart-title-link" href="#" target="_blank" style="text-decoration: none; color: inherit;">${displayName} (${betterDirection})</a>`;
  }

  // Show/hide the alert checkboxes
  const allAlertsContainer = document.getElementById('all-alerts-container');
  const hideAlertsContainer = document.getElementById('hide-alerts-container');

  if (allAlertsContainer) {
    allAlertsContainer.style.display = isScore ? 'block' : 'none';
  }
  if (hideAlertsContainer) {
    hideAlertsContainer.style.display = isScore ? 'none' : 'block';
  }

  // Group by application
  const firefoxData = data.filter(d => (d.application === 'firefox' || d.application === 'fenix') && !d.platform.includes("nightlyasrelease"));
  const firefoxNarData = data.filter(d => (d.application === 'firefox' || d.application === 'fenix') && d.platform.includes("nightlyasrelease"));
  const chromeData = data.filter(d => d.application === 'chrome' || d.application === 'chrome-m');
  const carData = data.filter(d => d.application === 'custom-car' || d.application === 'cstm-car-m');
  const safariData = data.filter(d => d.application === 'safari');
  const safariTPData = data.filter(d => d.application === 'safari-tp');

  // Build Perfherder link
  const firefoxSigId = firefoxData.length > 0 ? firefoxData[0].signature_id : null;
  const firefoxNarSigId = firefoxNarData.length > 0 ? firefoxNarData[0].signature_id : null;
  const firefoxnarSigId = firefoxData.length > 0 ? firefoxData[0].signature_id : null;
  const chromeSigId = chromeData.length > 0 ? chromeData[0].signature_id : null;
  const carSigId = carData.length > 0 ? carData[0].signature_id : null;
  const safariSigId = safariData.length > 0 ? safariData[0].signature_id : null;
  const safariTPSigId = safariTPData.length > 0 ? safariTPData[0].signature_id : null;

  const series = [];
  if (firefoxSigId) {
    const firefoxSig = window.speedometerData.signatures[firefoxSigId];
    const repo = firefoxSig?.repository || window.speedometerData.repository;
    series.push(`${repo},${firefoxSigId},1,13`);
  }
  if (firefoxNarSigId) {
    const firefoxNarSig = window.speedometerData.signatures[firefoxNarSigId];
    const repo = firefoxNarSig?.repository || window.speedometerData.repository;
    series.push(`${repo},${firefoxNarSigId},1,13`);
  }
  if (chromeSigId) series.push(`mozilla-central,${chromeSigId},1,13`);
  if (carSigId) series.push(`mozilla-central,${carSigId},1,13`);
  if (safariSigId) series.push(`mozilla-central,${safariSigId},1,13`);
  if (safariTPSigId) series.push(`mozilla-central,${safariTPSigId},1,13`);

  if (series.length > 0) {
    const seriesParam = series.join('&series=');
    const perfherderUrl = `https://treeherder.mozilla.org/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1&highlightCommonAlerts=0&timerange=7776000&series=${seriesParam}`;
    const titleLink = document.getElementById('chart-title-link');
    if (titleLink) {
      titleLink.href = perfherderUrl;
    }
  }

  const showReplicates = window.speedometerData.showReplicates;

  // Make the points smaller so they overlap less
  const unhoveredPointRadius = showReplicates ? 1.5 : 3;

  // And no border because they end up still overlapping so much anyway
  const unhoveredPointBorderWidth = showReplicates ? 0 : 0.5;

  // And slightly transparent so that density can still be seen in
  // overlapping points
  const pointColorAlphaHex = showReplicates ? "aa" : "ff";

  // And noise out the date so they have a higher chance of visually
  // separating
  function dateNoise(date) {
    if (!showReplicates) {
      return date;
    }
    // We set this to 6 hours, in order to not overlap with other
    // run times. This number was chosen more on visual vibes than
    // anything substantive.
    const msRange = 1000 * 60 * 60 * 6;
    return new Date(date.getTime() + Math.random() * msRange);
  }

  const datasets = [
    {
      label: 'Firefox',
      data: firefoxData.map(d => ({ x: dateNoise(d.date), y: d.value })),
      pointRadius: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 8;
        }
        return unhoveredPointRadius;
      },
      pointBackgroundColor: "#FF9500" + pointColorAlphaHex,
      pointBorderColor: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return "#FFFFFF";
        }
        return "#000000";
      },
      pointBorderWidth: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return unhoveredPointRadius;
        }
        return unhoveredPointBorderWidth;
      }
    },
    {
      label: 'Chrome',
      data: chromeData.map(d => ({ x: dateNoise(d.date), y: d.value })),
      pointRadius: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 8;
        }
        return unhoveredPointRadius;
      },
      pointBackgroundColor: "#1DA462" + pointColorAlphaHex,
      pointBorderColor: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return "#FFFFFF";
        }
        return "#000000";
      },
      pointBorderWidth: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 3;
        }
        return unhoveredPointBorderWidth;
      }
    }
  ];

  if (firefoxNarData.length > 0) {
    datasets.push({
      label: 'Nightly-as-Release',
      data: firefoxNarData.map(d => ({ x: dateNoise(d.date), y: d.value })),
      pointRadius: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 8;
        }
        return unhoveredPointRadius;
      },
      pointBackgroundColor: "#dd2500" + pointColorAlphaHex,
      pointBorderColor: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return "#FFFFFF";
        }
        return "#000000";
      },
      pointBorderWidth: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 3;
        }
        return unhoveredPointBorderWidth;
      }
    });
  }

  if (carData.length > 0) {
    datasets.push({
      label: 'Chromium-as-Release',
      data: carData.map(d => ({ x: dateNoise(d.date), y: d.value })),
      pointRadius: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 8;
        }
        return unhoveredPointRadius;
      },
      pointBackgroundColor: "#2773da" + pointColorAlphaHex,
      pointBorderColor: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return "#FFFFFF";
        }
        return "#000000";
      },
      pointBorderWidth: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 3;
        }
        return unhoveredPointBorderWidth;
      }
    });
  }

  if (platformConfig.supportsSafari && safariData.length > 0) {
    datasets.push({
      label: 'Safari',
      data: safariData.map(d => ({ x: dateNoise(d.date), y: d.value })),
      pointRadius: unhoveredPointRadius,
      pointBackgroundColor: "#444444" + pointColorAlphaHex,
      pointBorderColor: "#000000",
      pointBorderWidth: unhoveredPointBorderWidth
    });
  }

  if (platformConfig.supportsSafari && safariTPData.length > 0) {
    datasets.push({
      label: 'Safari TP',
      data: safariTPData.map(d => ({ x: dateNoise(d.date), y: d.value })),
      pointRadius: unhoveredPointRadius,
      pointBackgroundColor: "#777777" + pointColorAlphaHex,
      pointBorderColor: "#44444444",
      pointBorderWidth: unhoveredPointBorderWidth
    });
  }

  timeChart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.5,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const element = elements[0];
          const dataset = timeChart.data.datasets[element.datasetIndex];
          const dataPoint = dataset.data[element.index];

          referencePoint = {
            x: dataPoint.x,
            y: dataPoint.y,
            label: dataset.label,
            datasetIndex: element.datasetIndex,
            index: element.index
          };

          timeChart.update();
        }
      },
      onHover: (event, activeElements) => {
        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += round(context.parsed.y, 2);

              if (referencePoint) {
                const currentValue = context.parsed.y;
                const referenceValue = referencePoint.y;
                const percentDelta = ((currentValue / referenceValue) - 1) * 100;
                label += ` (${percentDelta > 0 ? '+' : ''}${round(percentDelta, 1)}%)`;
              }

              return label;
            }
          }
        },
        annotation: {
          annotations: getAlertAnnotations(firefoxSigId, testName)
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: showReplicates ? false : 'day',
            tooltipFormat: 'MMM dd, yyyy'
          },
          title: {
            display: true,
            text: 'Date'
          }
        },
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: isScore ? 'Score (Higher is better)' : 'Time (ms)'
          }
        }
      }
    }
  });
}

function showBugsLoading() {
  const parent = document.getElementById('bugs-chart-container');
  if (!parent) return;

  let loader = document.getElementById('bugs-chart-loader');

  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'bugs-chart-loader';
    loader.style.cssText = 'position: absolute; top: 200px; left: 50%; transform: translateX(-50%); text-align: center; z-index: 1000;';
    loader.innerHTML = `
      <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid #ddd; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 15px; font-size: 14px; color: #666; font-weight: 600;">Loading bug data...</div>
    `;
    parent.appendChild(loader);
  }

  loader.style.display = 'block';

  const chartCanvas = document.getElementById('bugsChart');
  if (chartCanvas) {
    chartCanvas.style.opacity = '0.3';
  }
}

function hideBugsLoading() {
  const loader = document.getElementById('bugs-chart-loader');
  const chartContainer = document.getElementById('bugsChart');

  if (loader) {
    loader.style.display = 'none';
  }
  if (chartContainer) {
    chartContainer.style.opacity = '1';
  }
}

async function fetchBugData() {
  const params = new URLSearchParams();
  params.append('whiteboard', 'sp3');
  params.append('type', 'defect');
  params.append('type', 'enhancement');
  params.append('type', 'task');
  params.append('classification', 'Client Software');
  params.append('classification', 'Developer Infrastructure');
  params.append('classification', 'Components');
  params.append('classification', 'Server Software');
  params.append('classification', 'Other');
  params.append('include_fields', 'id,status,creation_time,cf_last_resolved,component');

  const url = `https://bugzilla.mozilla.org/rest/bug?${params}`;
  const response = await fetch(url);
  return response.json();
}

async function loadSpeedometerBugBurndown(days) {
  showBugsLoading();
  const bugData = await fetchBugData();

  hideBugsLoading();

  const ctx = document.getElementById('bugsChart');
  if (!ctx) return;

  if (bugsChart) {
    bugsChart.destroy();
  }

  const msPerDay = 86400000;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const buckets = {
    "JavaScript Engine": "JS",
    "JavaScript Engine: JIT": "JS",
    "JavaScript: GC": "JS",

    "Graphics: Canvas2D": "Graphics",
    "Graphics: CanvasWebGL": "Graphics",
    "Web Painting": "Graphics",
    "Graphics: ImageLib": "Graphics",
    "Panning and Zooming": "Graphics",

    "DOM: Core & HTML": "DOM",
    "DOM: Bindings (WebIDL)": "DOM",
    "DOM: Events": "DOM",
    "DOM: Copy & Paste and Drag & Drop": "DOM",
    "DOM: Editor": "DOM",
    "DOM: HTML Parser": "DOM",

    "Layout: Text and Fonts": "Layout",
    "Layout: Generated Content, Lists, and Counters": "Layout",

    "CSS Parsing and Computation": "Style",
    "CSS Transitions and Animations": "Graphics",

    "Performance: General": "General",
    "Performance Engineering": "General",
    "Gecko Profiler": "Profiler",
  };

  const byComponent = {};
  for (let bug of bugData.bugs) {
    let component = bug.component;
    if (buckets[component]) {
      component = buckets[component];
    }
    if (!byComponent[component]) {
      byComponent[component] = {};
    }
  }

  for (let component of Object.keys(byComponent)) {
    byComponent[component].creationsByDay = Array.from({length: days}, () => 0);
    byComponent[component].resolutionsByDay = Array.from({length: days}, () => 0);
    byComponent[component].entries = Array.from({length: days});
    byComponent[component].runningTotal = 0;
  }

  for (let bug of bugData.bugs) {
    let component = bug.component;
    if (buckets[component]) {
      component = buckets[component];
    }
    const data = byComponent[component];
    const creation = new Date(bug.creation_time);
    let creationDay = Math.floor((creation - startDate) / msPerDay);
    if (creationDay < 0) {
      creationDay = 0;
    }
    data.creationsByDay[creationDay]++;
    if (bug.status === "RESOLVED") {
      const resolution = new Date(bug.cf_last_resolved);
      let resolutionDay = Math.floor((resolution - startDate) / msPerDay);
      if (resolutionDay < 0) {
        resolutionDay = 0;
      }
      data.resolutionsByDay[resolutionDay]++;
    }
  }

  const resolvedByDay = Array.from({length: days});
  let totalResolutions = 0;

  for (let i = 0; i < days; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + i);
    for (let component of Object.keys(byComponent)) {
      byComponent[component].runningTotal += byComponent[component].creationsByDay[i];
      byComponent[component].runningTotal -= byComponent[component].resolutionsByDay[i];
      totalResolutions += byComponent[component].resolutionsByDay[i];

      byComponent[component].entries[i] = {x: dayDate, y: byComponent[component].runningTotal};
    }
    resolvedByDay[i] = {x: dayDate, y: totalResolutions};
  }

  const sortedComponents = Object.keys(byComponent);
  sortedComponents.sort((a,b) => byComponent[b].runningTotal - byComponent[a].runningTotal);

  const colors = [
    "#E74C3C",  // Red
    "#3498DB",  // Blue
    "#2ECC71",  // Green
    "#E67E22",  // Orange
    "#9B59B6",  // Purple
    "#1ABC9C",  // Teal
    "#E84393",  // Pink
  ];

  const otherColor = "#95A5A6";
  const datasets = [];

  for (let i = 0; i < colors.length && i < sortedComponents.length; i++) {
    datasets.push({
      label: sortedComponents[i],
      data: byComponent[sortedComponents[i]].entries,
      borderColor: colors[i],
      backgroundColor: colors[i],
      pointRadius: 0,
      fill: true
    });
  }

  if (sortedComponents.length > colors.length) {
    let otherData = [];
    for (let i = 0; i < days; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);
      let total = 0;
      for (let j = colors.length; j < sortedComponents.length; j++) {
        let component = sortedComponents[j];
        total += byComponent[component].entries[i].y;
      }
      otherData.push({x: dayDate, y: total});
    }

    datasets.push({
      label: "Other",
      data: otherData,
      borderColor: otherColor,
      backgroundColor: otherColor,
      pointRadius: 0,
      fill: true
    });
  }

  datasets.push({
    label: "Resolved",
    data: resolvedByDay,
    borderColor: "rgba(128, 128, 128, 0.2)",
    backgroundColor: "rgba(128, 128, 128, 0.2)",
    pointRadius: 0,
    fill: true
  });

  const config = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: (ctx) => 'Burndown'
        },
        tooltip: {
          mode: 'index'
        },
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            tooltipFormat: 'MMM dd, yyyy'
          },
          title: {
            display: true,
            text: 'Date'
          }
        },
        y: {
          stacked: true,
          title: {
            display: true,
            text: 'Bug Count'
          }
        }
      }
    }
  };

  bugsChart = new Chart(ctx, config);

  console.log("Created bug chart");
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Set repository checkbox state based on URL parameter
  const repositoryCheckbox = document.getElementById('repository-toggle');
  if (repositoryCheckbox) {
    repositoryCheckbox.checked = window.speedometerData.repository === 'autoland';
  }

  // Set replicates checkbox state based on URL parameter
  const replicatesCheckbox = document.getElementById('replicates-toggle');
  if (replicatesCheckbox) {
    replicatesCheckbox.checked = window.speedometerData.showReplicates;
  }

  // Highlight the selected platform button
  const osParam = searchParams.get('os');
  if (!osParam || osParam === 'osxm4') {
    const btn = document.getElementById('osxm4button');
    if (btn) btn.style.backgroundColor = 'gray';
  } else if (osParam === 'windows') {
    const btn = document.getElementById('windowsbutton');
    if (btn) btn.style.backgroundColor = 'gray';
  } else if (osParam === 'linux') {
    const btn = document.getElementById('linuxbutton');
    if (btn) btn.style.backgroundColor = 'gray';
  } else if (osParam === 'android-s24') {
    const btn = document.getElementById('mobilebutton');
    if (btn) btn.style.backgroundColor = 'gray';
  } else if (osParam === 'android-a55') {
    const btn = document.getElementById('mobilebutton2');
    if (btn) btn.style.backgroundColor = 'gray';
  } else if (osParam === 'android-p6') {
    const btn = document.getElementById('mobilebutton3');
    if (btn) btn.style.backgroundColor = 'gray';
  }

  // Hide Safari columns if not on Mac M4
  if (!platformConfig.supportsSafari) {
    const table = document.getElementById('tableLikely');
    if (table && table.tHead && table.tHead.rows.length > 1) {
      // Adjust column spans in first header row
      table.tHead.rows[0].cells[1].colSpan = 4; // Value columns (Firefox, NaR, Chrome, CaR)
      table.tHead.rows[0].cells[2].colSpan = 2; // Difference columns (Chrome, CaR)

      // Remove Safari header cells from second row
      const headerRow = table.tHead.rows[1];
      // Remove from end to beginning to avoid index shifting issues
      headerRow.deleteCell(9); // Safari TP diff
      headerRow.deleteCell(8); // Safari diff
      headerRow.deleteCell(5); // Safari TP header
      headerRow.deleteCell(4); // Safari header
    }
  }

  loadSpeedometerData();
  loadSpeedometerBugBurndown(365 * 3);
});
