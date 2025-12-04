// Hybrid JetStream approach:
// - Load pre-aggregated data for table (fast)
// - Load Treeherder API data for chart (on-demand)

window.jetstreamState = {
  preAggregatedData: null,
  platforms: ['macosx1500-aarch64-shippable'],
  currentPlatform: 'macosx1500-aarch64-shippable',
  selectedTest: 'score',
  repository: 'mozilla-central',
  framework: 13,
  alerts: {},
  alertSummaries: {},
  hideAlerts: false,
  showAllAlerts: false
};

var timeChart;
var referencePoint = null;

const searchParams = new URLSearchParams(window.location.search);

// Set platform based on URL
if (searchParams.get('os') == 'windows') {
  window.jetstreamState.platforms = ['windows11-64-shippable-qr', 'windows11-64-24h2-shippable'];
  window.jetstreamState.currentPlatform = 'windows11-64-24h2-shippable';
} else if (searchParams.get('os') == 'linux') {
  window.jetstreamState.platforms = ['linux1804-64-shippable-qr'];
  window.jetstreamState.currentPlatform = 'linux1804-64-shippable-qr';
}

// Initialize repository from URL parameter
const repoParam = searchParams.get('repository') || searchParams.get('repo');
if (repoParam === 'autoland') {
  window.jetstreamState.repository = 'autoland';
}

// Define toggle function early so it's available for HTML onchange handler
window.toggleRepositoryJetstream = async function(checked) {
  window.jetstreamState.repository = checked ? 'autoland' : 'mozilla-central';

  console.log(`Switching to ${window.jetstreamState.repository}`);

  const url = new URL(window.location);
  if (checked) {
    url.searchParams.set('repository', 'autoland');
  } else {
    url.searchParams.delete('repository');
  }
  window.history.replaceState({}, '', url);

  showChartLoading();
  await loadChartFromTreeherder(window.jetstreamState.selectedTest);
  hideChartLoading();
};

function round(number, decimals) {
  return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function getDiffColor(diff) {
  if (diff < -5) {
    return 'green';
  } else if (diff < 5) {
    return 'black';
  } else {
    return 'red';
  }
}

async function loadChartFromTreeherder(testName) {
  try {
    showChartLoading();
    console.log(`Loading chart data for ${testName} from Treeherder...`);

    window.jetstreamState.selectedTest = testName;

    // Get signatures for this test
    const platform = window.jetstreamState.currentPlatform;
    const repository = window.jetstreamState.repository;
    const allSignatures = {};

    // Fetch Firefox signatures from selected repository
    const firefoxSigUrl = `https://treeherder.mozilla.org/api/project/${repository}/performance/signatures/?framework=13&platform=${platform}`;
    const firefoxSigResponse = await fetch(firefoxSigUrl);
    const firefoxSignatures = await firefoxSigResponse.json();

    for (const [sigId, sig] of Object.entries(firefoxSignatures)) {
      if (sig.suite === 'jetstream3' && sig.test === testName && (sig.application === 'firefox' || sig.application === 'fenix')) {
        allSignatures[sigId] = { ...sig, repository: repository };
      }
    }

    // Always fetch Chrome/Safari signatures from mozilla-central
    const chromeSigUrl = `https://treeherder.mozilla.org/api/project/mozilla-central/performance/signatures/?framework=13&platform=${platform}`;
    const chromeSigResponse = await fetch(chromeSigUrl);
    const chromeSignatures = await chromeSigResponse.json();

    for (const [sigId, sig] of Object.entries(chromeSignatures)) {
      if (sig.suite === 'jetstream3' && sig.test === testName && sig.application !== 'firefox' && sig.application !== 'fenix') {
        allSignatures[sigId] = { ...sig, repository: 'mozilla-central' };
      }
    }

    const testSignatures = Object.values(allSignatures);

    if (testSignatures.length === 0) {
      console.log(`No signatures found for ${testName}`);
      hideChartLoading();
      return;
    }

    // Load 90 days of data
    const intervalSeconds = 90 * 24 * 60 * 60;
    const allData = [];

    for (const sig of testSignatures) {
      const sigRepository = sig.repository || repository;
      const dataUrl = `https://treeherder.mozilla.org/api/performance/summary/?repository=${sigRepository}&signature=${sig.id}&framework=13&interval=${intervalSeconds}&all_data=true`;
      const dataResponse = await fetch(dataUrl);
      const perfData = await dataResponse.json();

      if (Array.isArray(perfData) && perfData.length > 0 && perfData[0].data) {
        const seriesData = perfData[0].data;
        for (const point of seriesData) {
          const timestamp = point.push_timestamp;
          const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp * 1000;
          allData.push({
            date: new Date(timestampMs),
            test: sig.test,
            application: sig.application,
            signature_id: sig.id,
            value: point.value
          });
        }
      }
    }

    // Fetch alerts from autoland for Firefox signature
    const firefoxSig = testSignatures.find(s => s.application === 'firefox' || s.application === 'fenix');
    if (firefoxSig) {
      await fetchAlertsForTest(testName, platform);
    }

    displayChartFromTreeherder(allData, testName);
    hideChartLoading();

  } catch (error) {
    console.error('Error loading chart data:', error);
    hideChartLoading();
  }
}

async function fetchAlertsForTest(testName, platform) {
  try {
    console.log(`Fetching alerts for ${testName} on ${platform}`);

    // Get autoland signature for this test
    const sigUrl = `https://treeherder.mozilla.org/api/project/autoland/performance/signatures/?framework=13&platform=${platform}`;
    const sigResponse = await fetch(sigUrl);
    const signatures = await sigResponse.json();

    let autolandSigId = null;
    for (const [sigId, sig] of Object.entries(signatures)) {
      if (sig.suite === 'jetstream3' &&
          sig.test === testName &&
          (sig.application === 'firefox' || sig.application === 'fenix')) {
        autolandSigId = sig.id;
        console.log(`Found autoland signature ${autolandSigId} for ${testName}`);
        break;
      }
    }

    if (!autolandSigId) {
      console.log(`No autoland signature found for ${testName} on ${platform}`);
      window.jetstreamState.alerts[testName] = [];
      return;
    }

    // Fetch alerts
    const timerangeSeconds = 90 * 24 * 60 * 60;
    const summaryUrl = `https://treeherder.mozilla.org/api/performance/alertsummary/?alerts__series_signature=${autolandSigId}&repository=77&limit=100&timerange=${timerangeSeconds}`;

    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();

    const allAlerts = [];

    if (summaryData.results) {
      for (const summary of summaryData.results) {
        for (const alert of summary.alerts) {
          if (alert.series_signature.id === autolandSigId && alert.status !== 3) {
            allAlerts.push({
              ...alert,
              push_timestamp: summary.push_timestamp,
              summary_id: summary.id
            });

            if (!window.jetstreamState.alertSummaries[summary.id]) {
              window.jetstreamState.alertSummaries[summary.id] = summary;
            }
          }
        }
      }
    }

    window.jetstreamState.alerts[testName] = allAlerts;
    console.log(`Loaded ${allAlerts.length} alerts for ${testName}`);
  } catch (error) {
    console.error(`Error fetching alerts for ${testName}:`, error);
  }
}

function getAlertAnnotations(testName) {
  const annotations = {};

  if (!testName || window.jetstreamState.hideAlerts) {
    return annotations;
  }

  const showingAllAlerts = testName === 'score' && window.jetstreamState.showAllAlerts;

  let alertsToShow = [];

  if (showingAllAlerts) {
    // Collect all alerts from all subtests
    for (const [key, alertList] of Object.entries(window.jetstreamState.alerts)) {
      alertsToShow.push(...alertList);
    }
  } else {
    alertsToShow = window.jetstreamState.alerts[testName] || [];
  }

  if (alertsToShow.length === 0) {
    return annotations;
  }

  if (showingAllAlerts) {
    // Group alerts by summary and handle reassignments
    const reassignmentMap = new Map();
    alertsToShow.forEach(alert => {
      if (alert.related_summary_id) {
        reassignmentMap.set(alert.summary_id, alert.related_summary_id);
      }
    });

    const alertsByFinalSummary = new Map();
    alertsToShow.forEach(alert => {
      if (alert.status === 3) return;

      let finalSummaryId = alert.summary_id;
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
      if (reassignmentMap.has(summaryId)) continue;

      const summary = window.jetstreamState.alertSummaries[summaryId];
      if (!summary) continue;

      const alertDate = new Date(summary.push_timestamp * 1000);
      const alertUrl = `https://treeherder.mozilla.org/perfherder/alerts?id=${summaryId}`;

      // Build list of affected tests
      const improvements = [];
      const regressions = [];

      alerts.forEach(a => {
        const test = a.series_signature ? a.series_signature.test : '';
        const pct = (a.amount_pct || 0).toFixed(1);
        if (Math.abs(a.amount_pct || 0) < 0.01) return;

        const sign = a.is_regression ? '-' : '+';
        if (a.is_regression) {
          regressions.push(`${test}: ${sign}${pct}%`);
        } else {
          improvements.push(`${test}: ${sign}${pct}%`);
        }
      });

      const netPositive = improvements.length > regressions.length;
      const borderColor = netPositive ? 'rgba(0, 200, 0, 0.6)' : 'rgba(255, 0, 0, 0.6)';
      const labelContent = [`Alert ${summaryId}`, ...improvements.slice(0, 8), ...regressions.slice(0, 8)];

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
          ctx.element.label.options.display = true;
          return true;
        },
        leave(ctx) {
          ctx.element.label.options.display = false;
          return true;
        },
        click() {
          window.open(alertUrl, '_blank');
        }
      };
    }
  } else {
    // Single test alerts - filter out reassigned
    const alertsToDisplay = alertsToShow.filter(alert =>
      !alert.related_summary_id && alert.status !== 3
    );

    alertsToDisplay.forEach((alert, index) => {
      if (!alert.push_timestamp) return;

      const alertDate = new Date(alert.push_timestamp * 1000);
      const alertUrl = `https://treeherder.mozilla.org/perfherder/alerts?id=${alert.summary_id}`;
      const amountPct = Math.abs(alert.amount_pct || 0).toFixed(1);
      const hoverText = `#${alert.summary_id}: ${amountPct}%`;

      // Default annotation
      annotations[`alert_${index}_default`] = {
        type: 'line',
        xMin: alertDate,
        xMax: alertDate,
        drawTime: 'beforeDatasetsDraw',
        borderColor: alert.is_regression ? 'rgba(255, 0, 0, 0.6)' : 'rgba(0, 200, 0, 0.6)',
        borderWidth: 2,
        label: {
          display: true,
        content: `${amountPct}%`,
        position: 'end',
        yAdjust: 10,
        drawTime: 'afterDatasetsDraw',
        backgroundColor: alert.is_regression ? 'rgba(255, 200, 200, 0.98)' : 'rgba(200, 255, 200, 0.98)',
        borderColor: alert.is_regression ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 200, 0, 0.8)',
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

    // Hover annotation
    const yOffset = 10 + (index % 3) * 30;
    annotations[`alert_${index}_hover`] = {
      type: 'line',
      xMin: alertDate,
      xMax: alertDate,
      drawTime: 'beforeDatasetsDraw',
      borderColor: alert.is_regression ? 'rgba(255, 0, 0, 0.6)' : 'rgba(0, 200, 0, 0.6)',
      borderWidth: 2,
      z: -1,
      label: {
        display: false,
        content: hoverText,
        position: 'end',
        yAdjust: yOffset,
        drawTime: 'afterDatasetsDraw',
        backgroundColor: alert.is_regression ? 'rgba(255, 200, 200, 0.98)' : 'rgba(200, 255, 200, 0.98)',
        borderColor: alert.is_regression ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 200, 0, 0.8)',
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

function displayChartFromTreeherder(data, testName) {
  const ctx = document.getElementById('myChart');
  if (!ctx) return;

  if (timeChart) {
    timeChart.destroy();
  }

  // Update chart title
  const displayName = testName === 'score' ? 'Overall Score' : testName;
  const chartTitleElement = document.getElementById('chart-title-jetstream');
  if (chartTitleElement) {
    chartTitleElement.innerHTML = `<a id="chart-title-link-jetstream" href="#" target="_blank" style="text-decoration: none; color: inherit;">${displayName} (higher is better)</a>`;
  }

  // Show/hide the all alerts checkbox
  const alertsContainer = document.getElementById('all-alerts-container-jetstream');
  if (alertsContainer) {
    alertsContainer.style.display = testName === 'score' ? 'block' : 'none';
  }

  // Group by application
  const firefoxData = data.filter(d => d.application === 'firefox' || d.application === 'fenix');
  const chromeData = data.filter(d => d.application === 'chrome' || d.application === 'chrome-m');
  const carData = data.filter(d => d.application === 'custom-car' || d.application === 'cstm-car-m');
  const safariData = data.filter(d => d.application === 'safari');
  const safariTPData = data.filter(d => d.application === 'safari-tp');

  // Build Perfherder link
  const firefoxSigId = firefoxData.length > 0 ? firefoxData[0].signature_id : null;
  const chromeSigId = chromeData.length > 0 ? chromeData[0].signature_id : null;
  const carSigId = carData.length > 0 ? carData[0].signature_id : null;
  const safariSigId = safariData.length > 0 ? safariData[0].signature_id : null;
  const safariTPSigId = safariTPData.length > 0 ? safariTPData[0].signature_id : null;

  const series = [];
  if (firefoxSigId) series.push(`mozilla-central,${firefoxSigId},1,13`);
  if (chromeSigId) series.push(`mozilla-central,${chromeSigId},1,13`);
  if (carSigId) series.push(`mozilla-central,${carSigId},1,13`);
  if (safariSigId) series.push(`mozilla-central,${safariSigId},1,13`);
  if (safariTPSigId) series.push(`mozilla-central,${safariTPSigId},1,13`);

  if (series.length > 0) {
    const seriesParam = series.join('&series=');
    const perfherderUrl = `https://treeherder.mozilla.org/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1&highlightCommonAlerts=0&timerange=7776000&series=${seriesParam}`;
    const titleLink = document.getElementById('chart-title-link-jetstream');
    if (titleLink) {
      titleLink.href = perfherderUrl;
    }
  }

  const datasets = [
    {
      label: 'Firefox',
      data: firefoxData.map(d => ({ x: d.date, y: d.value })),
      pointRadius: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 8;
        }
        return 3;
      },
      pointBackgroundColor: "#FF9500",
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
        return 0.5;
      }
    },
    {
      label: 'Chrome',
      data: chromeData.map(d => ({ x: d.date, y: d.value })),
      pointRadius: function(context) {
        if (referencePoint &&
            context.datasetIndex === referencePoint.datasetIndex &&
            context.dataIndex === referencePoint.index) {
          return 8;
        }
        return 3;
      },
      pointBackgroundColor: "#1DA462",
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
        return 0.5;
      }
    }
  ];

  // Add CaR if data exists
  if (carData.length > 0) {
    datasets.push({
      label: 'Chromium-as-Release',
      data: carData.map(d => ({ x: d.date, y: d.value })),
      pointRadius: 3,
      pointBackgroundColor: "#2773da",
      pointBorderColor: "#000000",
      pointBorderWidth: 0.5
    });
  }

  // Add Safari if on Mac and data exists
  if (safariData.length > 0) {
    datasets.push({
      label: 'Safari',
      data: safariData.map(d => ({ x: d.date, y: d.value })),
      pointRadius: 3,
      pointBackgroundColor: "#44444444",
      pointBorderColor: "#000000",
      pointBorderWidth: 0.5
    });
  }

  if (safariTPData.length > 0) {
    datasets.push({
      label: 'Safari TP',
      data: safariTPData.map(d => ({ x: d.date, y: d.value })),
      pointRadius: 3,
      pointBackgroundColor: "#777",
      pointBorderColor: "#44444444",
      pointBorderWidth: 0.5
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
          annotations: getAlertAnnotations(testName)
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            tooltipFormat: 'll'
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
            text: 'Score (Higher is better)'
          }
        }
      }
    }
  });
}

function showChartLoading() {
  const chartContainer = document.getElementById('myChart');
  if (!chartContainer) return;

  const parent = chartContainer.parentElement;
  let loader = document.getElementById('chart-loader-jetstream');

  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'chart-loader-jetstream';
    loader.style.cssText = 'position: absolute; top: 120px; left: 50%; transform: translateX(-50%); text-align: center; z-index: 1000;';
    loader.innerHTML = `
      <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid #ddd; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 15px; font-size: 14px; color: #666; font-weight: 600;">Loading chart data...</div>
    `;
    parent.style.position = 'relative';
    parent.appendChild(loader);
  }

  loader.style.display = 'block';

  if (chartContainer) {
    chartContainer.style.opacity = '0.3';
  }
}

function hideChartLoading() {
  const loader = document.getElementById('chart-loader-jetstream');
  const chartContainer = document.getElementById('myChart');

  if (loader) {
    loader.style.display = 'none';
  }
  if (chartContainer) {
    chartContainer.style.opacity = '1';
  }
}

function changeRange(newRange) {
  // For now, just adjust the view range
  if (newRange == 'all') {
    if (timeChart) {
      timeChart.options.scales.x.min = '';
      timeChart.update();
    }
  } else {
    var d = new Date();
    d.setMonth(d.getMonth() - newRange);
    if (timeChart) {
      timeChart.options.scales.x.min = d;
      timeChart.update();
    }
  }
  referencePoint = null;
}

async function toggleAllAlertsJetStream(checked) {
  window.jetstreamState.showAllAlerts = checked;

  if (checked && window.jetstreamState.selectedTest === 'score') {
    showChartLoading();
    // Fetch alerts for common JetStream subtests that have alerts
    const commonTests = [
      'async-fs-Average', 'async-fs-Geometric',
      'sync-fs-Average', 'sync-fs-Geometric', 'sync-fs-First', 'sync-fs-Worst',
      'hash-map-Average', 'hash-map-Geometric'
    ];

    const platform = window.jetstreamState.currentPlatform;
    await Promise.all(
      commonTests.map(test => fetchAlertsForTest(test, platform))
    );
    hideChartLoading();
  }

  // Redraw chart with updated annotations
  if (timeChart) {
    timeChart.options.plugins.annotation.annotations = getAlertAnnotations(window.jetstreamState.selectedTest);
    timeChart.update();
  }
}

// Initialize - load default score chart on page load
document.addEventListener('DOMContentLoaded', () => {
  // Set checkbox state from URL parameter
  const repositoryCheckbox = document.getElementById('repository-toggle-jetstream');
  if (repositoryCheckbox) {
    repositoryCheckbox.checked = window.jetstreamState.repository === 'autoland';
  }

  // Load score chart from Treeherder
  loadChartFromTreeherder('score');
});
