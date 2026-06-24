// Nav Bench dashboard
// Runs on autoland only, Firefox only, desktop only
// Suite: nav-bench-overall
// All tests are higher-is-better scores

window.navBenchData = {
  allData: [],
  signatures: {},
  // '' = overall geomean; non-empty = per-site score
  selectedTest: '',
  repository: 'autoland',
  framework: 13,
  subtestNames: []
};

window.navBenchVideoState = {
  currentVideos: {},     // { website: [{name, buffer}] }
  currentReplicates: {}, // { website: [values] }
  selectedWebsite: null
};

const searchParams = new URLSearchParams(window.location.search);
var timeChart;
var subtestCharts = {};
var allSubtestChartsLoaded = false;

const platformConfigs = {
  'linux': { platforms: ['linux2404-64-shippable'] },
  'osxm4': { platforms: ['macosx1500-aarch64-shippable'] },
  'windows': { platforms: ['windows11-64-24h2-shippable'] },
  'windows-hwref': { platforms: ['windows11-64-24h2-hw-ref-shippable'] }
};

const osParam = searchParams.get('os') || 'osxm4';
const platformConfig = platformConfigs[osParam] || platformConfigs['osxm4'];

const subtestParam = searchParams.get('subtest');
if (subtestParam) {
  window.navBenchData.selectedTest = subtestParam;
}

const rangeParam = searchParams.get('range');
const initialDays = rangeParam === 'year' ? 365 : rangeParam === '3months' ? 90 : rangeParam === '1month' ? 30 : rangeParam === 'week' ? 7 : 90;

function round(number, decimals) {
  return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function getDisplayName(testName) {
  return testName === '' ? 'Overall Score' : testName;
}

async function loadNavBenchData(loadInitialChart = true) {
  try {
    if (loadInitialChart) showChartLoading();

    const allSignatures = {};

    for (const platform of platformConfig.platforms) {
      const sigUrl = `https://treeherder.mozilla.org/api/project/autoland/performance/signatures/?framework=${window.navBenchData.framework}&platform=${platform}`;
      const sigResponse = await fetch(sigUrl);
      const signatures = await sigResponse.json();

      for (const [sigId, sig] of Object.entries(signatures)) {
        if (sig.suite === 'nav-bench-overall' && sig.application === 'firefox' &&
            !(sig.extra_options && (sig.extra_options.includes('gecko-profile') || sig.extra_options.includes('simpleperf')))) {
          allSignatures[sigId] = { ...sig, repository: 'autoland' };
        }
      }
    }

    console.log(`Found ${Object.keys(allSignatures).length} nav-bench-overall signatures`);
    window.navBenchData.signatures = allSignatures;

    // '' = overall geomean (put first), rest alphabetically
    const allTests = [...new Set(Object.values(allSignatures).map(sig => sig.test ?? ''))];
    const subtests = allTests.filter(t => t !== '').sort();
    window.navBenchData.subtestNames = ['', ...subtests];

    await loadDataForPeriod(30, Object.values(allSignatures));

    if (loadInitialChart) {
      await loadChartDataForTest(window.navBenchData.selectedTest, initialDays);
    }

    displayTable();

  } catch (error) {
    console.error('Error loading nav-bench data:', error);
    hideChartLoading();
  }
}

async function loadDataForPeriod(days, signatures) {
  const intervalSeconds = days * 24 * 60 * 60;
  const allData = [];

  const fetchPromises = signatures.map(async (sig) => {
    try {
      const dataUrl = `https://treeherder.mozilla.org/api/performance/summary/?repository=autoland&signature=${sig.id}&framework=${window.navBenchData.framework}&interval=${intervalSeconds}&all_data=true`;
      const dataResponse = await fetch(dataUrl);
      const perfData = await dataResponse.json();

      const dataPoints = [];
      if (Array.isArray(perfData) && perfData.length > 0 && perfData[0].data) {
        for (const point of perfData[0].data) {
          const timestamp = point.push_timestamp;
          const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp * 1000;
          dataPoints.push({
            date: new Date(timestampMs),
            test: sig.test ?? '',
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
      }
      return dataPoints;
    } catch (error) {
      console.error(`Error fetching signature ${sig.id}:`, error);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(pts => allData.push(...pts));

  console.log(`Loaded ${allData.length} data points for ${days} days`);
  window.navBenchData.allData = allData;
  return allData;
}

async function loadChartDataForTest(testName, days) {
  console.log(`Loading ${days} days of data for test=${JSON.stringify(testName)}`);
  window.navBenchData.days = days;
  showChartLoading();

  const testSignatures = Object.values(window.navBenchData.signatures).filter(
    sig => (sig.test ?? '') === testName
  );

  if (testSignatures.length === 0) {
    console.warn(`No signatures found for test: ${JSON.stringify(testName)}`);
    hideChartLoading();
    return;
  }

  const intervalSeconds = days * 24 * 60 * 60;
  const chartData = [];

  const fetchPromises = testSignatures.map(async (sig) => {
    try {
      const dataUrl = `https://treeherder.mozilla.org/api/performance/summary/?repository=autoland&signature=${sig.id}&framework=${window.navBenchData.framework}&interval=${intervalSeconds}&all_data=true`;
      const dataResponse = await fetch(dataUrl);
      const perfData = await dataResponse.json();

      const dataPoints = [];
      if (Array.isArray(perfData) && perfData.length > 0 && perfData[0].data) {
        for (const point of perfData[0].data) {
          const timestamp = point.push_timestamp;
          const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp * 1000;
          dataPoints.push({
            date: new Date(timestampMs),
            test: sig.test ?? '',
            platform: sig.machine_platform,
            application: sig.application,
            signature_id: sig.id,
            value: point.value,
            push_timestamp: timestampMs / 1000,
            revision: point.revision,
            job_id: point.job_id
          });
        }
      }
      return dataPoints;
    } catch (error) {
      console.error(`Error fetching signature ${sig.id}:`, error);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(pts => chartData.push(...pts));

  displayChart(chartData, testName);
  hideChartLoading();
}

function displayChart(data, testName) {
  const ctx = document.getElementById('myChart');
  if (!ctx) return;

  if (timeChart) timeChart.destroy();

  const displayName = getDisplayName(testName);
  const chartTitleElement = document.getElementById('chart-title');
  if (chartTitleElement) {
    chartTitleElement.innerHTML = `<a id="chart-title-link" href="#" target="_blank" style="text-decoration: none; color: inherit;">${displayName} (higher is better)</a>`;
  }

  const firefoxData = data.filter(d => d.application === 'firefox');

  if (firefoxData.length > 0) {
    const sigId = firefoxData[0].signature_id;
    const titleLink = document.getElementById('chart-title-link');
    if (titleLink) titleLink.href = `https://treeherder.mozilla.org/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1&highlightCommonAlerts=0&timerange=7776000&series=autoland,${sigId},1,13`;
  }

  // defaultWebsite = selected test name (for pre-selecting website in video panel)
  const defaultWebsite = testName !== '' ? testName : null;

  timeChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Firefox',
        data: firefoxData.map(d => ({ x: d.date, y: d.value, revision: d.revision, job_id: d.job_id })),
        pointRadius: 3,
        pointBackgroundColor: '#FF9500',
        pointBorderColor: '#000000',
        pointBorderWidth: 0.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.5,
      onClick: async (event, elements) => {
        if (elements && elements.length > 0) {
          const dp = timeChart.data.datasets[elements[0].datasetIndex].data[elements[0].index];
          await loadNavBenchVideo(dp.job_id, dp.revision, dp.x, dp.y, defaultWebsite);
        }
      },
      onHover: (event, activeElements) => {
        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            title: function(context) {
              if (context.length > 0) {
                const date = new Date(context[0].parsed.x);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              }
              return '';
            },
            label: function(context) {
              const dp = context.dataset.data[context.dataIndex];
              const rev = dp && dp.revision ? ` (${dp.revision.substring(0, 6)})` : '';
              return (context.dataset.label || '') + ': ' + round(context.parsed.y, 2) + rev;
            },
            afterLabel: function() {
              return 'Click to view video';
            }
          }
        },
        annotation: { annotations: {} }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' },
          title: { display: true, text: 'Date' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Score (higher is better)' }
        }
      }
    }
  });
}

// --- Video panel ---

async function loadNavBenchVideo(job_id, revision, date, value, defaultWebsite) {
  const videoContainer = document.getElementById('video-container');
  const videoElement = document.getElementById('perf-video');
  const videoLoading = document.getElementById('video-loading');
  const websiteSelect = document.getElementById('website-select');
  const replicateSelect = document.getElementById('replicate-select');
  const dataPointInfo = document.getElementById('data-point-info');
  const jobLink = document.getElementById('job-link');
  const videoInfo = document.getElementById('video-info');

  if (!videoContainer) return;

  videoContainer.style.display = 'block';
  videoContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  videoLoading.style.display = 'block';
  videoElement.style.display = 'none';
  videoElement.src = '';
  videoInfo.textContent = '';
  websiteSelect.innerHTML = '<option>Loading...</option>';
  replicateSelect.innerHTML = '<option>Loading...</option>';

  const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  dataPointInfo.innerHTML = `<strong>Firefox</strong> | ${dateStr} | <strong>${round(value, 2)}</strong>`;
  jobLink.href = '#';
  jobLink.textContent = 'View Job in Treeherder';

  try {
    // Resolve job_id → task_id / retry_id via Treeherder jobs API
    let taskId = null;
    let retryId = 0;
    if (job_id) {
      const jobData = await fetch(`https://treeherder.mozilla.org/api/project/autoland/jobs/?id=${job_id}`).then(r => r.json());
      if (jobData.results && jobData.results.length > 0) {
        taskId = jobData.results[0].task_id;
        retryId = jobData.results[0].retry_id || 0;
      }
    }

    if (!taskId) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'Could not resolve Treeherder job';
      if (revision) jobLink.href = `https://treeherder.mozilla.org/jobs?repo=autoland&revision=${revision}&group_state=expanded`;
      return;
    }

    jobLink.href = `https://treeherder.mozilla.org/jobs?repo=autoland&revision=${revision}&group_state=expanded&selectedTaskRun=${taskId}.${retryId}`;

    // Fetch Taskcluster artifact listing
    const artifactsData = await fetch(`https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/${taskId}/runs/${retryId}/artifacts`).then(r => r.json());

    // Prefer annotated videos, fall back to original
    const videoArtifact = artifactsData.artifacts.find(a => a.name.includes('browsertime-videos-annotated') && a.name.endsWith('.tgz'))
      || artifactsData.artifacts.find(a => a.name.includes('browsertime-videos-original') && a.name.endsWith('.tgz'));

    if (!videoArtifact) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'No video artifacts found for this job';
      return;
    }

    // Load replicate score values from perfherder-data.json
    const replicatesByWebsite = {};
    const perfherderArtifact = artifactsData.artifacts.find(a => a.name.startsWith('public/build/perfherder-data') && a.name.endsWith('.json'));
    if (perfherderArtifact) {
      try {
        const perfherderData = await fetch(`https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/${taskId}/runs/${retryId}/artifacts/${perfherderArtifact.name}`).then(r => r.json());
        const suite = perfherderData.suites?.find(s => s.name === 'nav-bench-overall');
        if (suite?.subtests) {
          for (const subtest of suite.subtests) {
            if (subtest.replicates?.length) replicatesByWebsite[subtest.name] = subtest.replicates;
          }
        }
      } catch (e) {
        console.warn('Could not load perfherder data:', e);
      }
    }

    // Fetch and extract the video tgz
    const tgzResponse = await fetch(`https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/${taskId}/runs/${retryId}/artifacts/${videoArtifact.name}`);
    if (!tgzResponse.ok) throw new Error(`Video archive unavailable (HTTP ${tgzResponse.status})`);

    const arrayBuffer = await tgzResponse.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
    const extractedFiles = await untar(decompressed.buffer);

    // Group video files by website (detect site name from path/filename)
    const KNOWN_SITES = ['amazon', 'bbc', 'duckduckgo', 'reddit', 'wikipedia'];
    const videosByWebsite = {};
    for (const file of extractedFiles) {
      if (!file.name.endsWith('.mp4') && !file.name.endsWith('.webm')) continue;
      const nameLower = file.name.toLowerCase();
      const site = KNOWN_SITES.find(s => nameLower.includes(s)) || 'other';
      if (!videosByWebsite[site]) videosByWebsite[site] = [];
      videosByWebsite[site].push({ name: file.name, buffer: file.buffer });
    }

    window.navBenchVideoState.currentVideos = videosByWebsite;
    window.navBenchVideoState.currentReplicates = replicatesByWebsite;

    const websites = Object.keys(videosByWebsite).sort();
    if (websites.length === 0) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'No video files found in archive';
      return;
    }

    websiteSelect.innerHTML = '';
    for (const site of websites) {
      const option = document.createElement('option');
      option.value = site;
      option.textContent = site.charAt(0).toUpperCase() + site.slice(1);
      websiteSelect.appendChild(option);
    }

    videoLoading.style.display = 'none';
    videoElement.style.display = 'block';

    const selectedSite = defaultWebsite && websites.includes(defaultWebsite) ? defaultWebsite : websites[0];
    websiteSelect.value = selectedSite;
    selectNavWebsite(selectedSite);

  } catch (error) {
    console.error('Error loading nav bench video:', error);
    videoLoading.style.display = 'none';
    videoInfo.textContent = 'Error loading video: ' + error.message;
  }
}

function selectNavWebsite(website) {
  window.navBenchVideoState.selectedWebsite = website;
  const replicateSelect = document.getElementById('replicate-select');
  const videos = window.navBenchVideoState.currentVideos[website] || [];
  const replicates = window.navBenchVideoState.currentReplicates[website] || [];

  replicateSelect.innerHTML = '';
  videos.forEach((v, index) => {
    const option = document.createElement('option');
    option.value = index;
    const repValue = replicates[index] !== undefined ? ` (${round(replicates[index], 2)})` : '';
    option.textContent = `Replicate ${index + 1}${repValue}`;
    replicateSelect.appendChild(option);
  });

  if (videos.length > 0) selectNavReplicate(0);
  else document.getElementById('video-info').textContent = 'No videos for this website';
}

function selectNavReplicate(index) {
  const videoElement = document.getElementById('perf-video');
  const videoInfo = document.getElementById('video-info');
  const website = window.navBenchVideoState.selectedWebsite;
  const videos = window.navBenchVideoState.currentVideos[website] || [];
  const replicates = window.navBenchVideoState.currentReplicates[website] || [];

  index = parseInt(index);
  if (videos[index]) {
    const videoBlob = new Blob([videos[index].buffer], { type: 'video/mp4' });
    videoElement.src = URL.createObjectURL(videoBlob);
    videoElement.load();
    const repValue = replicates[index] !== undefined ? ` — Score: ${round(replicates[index], 2)}` : '';
    videoInfo.textContent = `${website} | Replicate ${index + 1}${repValue}`;
  } else {
    videoInfo.textContent = 'Video not found for this replicate';
  }
}

function closeNavVideo() {
  const videoContainer = document.getElementById('video-container');
  const videoElement = document.getElementById('perf-video');
  if (videoContainer) videoContainer.style.display = 'none';
  if (videoElement) { videoElement.pause(); videoElement.src = ''; }
  window.navBenchVideoState.currentVideos = {};
  window.navBenchVideoState.currentReplicates = {};
}

// ---

function calculateAverage(data) {
  if (data.length === 0) return null;
  const sortedData = [...data].sort((a, b) => b.date - a.date);
  const mostRecentDate = sortedData[0].date;
  const cutoffDate = new Date(mostRecentDate);
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  const last7Days = sortedData.filter(d => d.date >= cutoffDate);
  if (last7Days.length === 0) return null;
  return last7Days.reduce((acc, d) => acc + d.value, 0) / last7Days.length;
}

function displayTable() {
  const tbody = document.getElementById('tableBodyLikely');
  if (!tbody) return;
  tbody.innerHTML = '';

  const subtestNames = window.navBenchData.subtestNames;
  if (subtestNames.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px; font-family: sans-serif; color: #666;">No data found. This test may not have run yet on autoland.</td></tr>';
    return;
  }

  subtestNames.forEach(testName => {
    const testData = window.navBenchData.allData.filter(d => d.test === testName && d.application === 'firefox');
    const avg = calculateAverage(testData);
    if (avg === null) return;

    const displayName = getDisplayName(testName);
    const row = document.createElement('tr');
    if (testName === '') row.className = 'scoreRow';
    row.style.cursor = 'pointer';
    row.onclick = () => selectTest(testName);
    row.innerHTML = `<th scope="row" class="testName">${displayName}</th><td>${round(avg, 2)}</td>`;
    tbody.appendChild(row);
  });
}

function selectTest(testName) {
  window.navBenchData.selectedTest = testName;
  loadChartDataForTest(testName, window.navBenchData.days || initialDays);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const url = new URL(window.location);
  if (testName !== '') {
    url.searchParams.set('subtest', testName);
  } else {
    url.searchParams.delete('subtest');
  }
  window.history.replaceState({}, '', url);
}

function changeRange(range) {
  let days;
  if (range === 'all') days = 365;
  else if (range === 3) days = 90;
  else if (range === 1) days = 30;
  else if (range === 'week') days = 7;

  const rangeSlug = range === 'all' ? 'year' : range === 3 ? '3months' : range === 1 ? '1month' : 'week';
  const url = new URL(window.location);
  if (rangeSlug !== '3months') url.searchParams.set('range', rangeSlug);
  else url.searchParams.delete('range');
  window.history.replaceState({}, '', url);

  loadChartDataForTest(window.navBenchData.selectedTest, days);

  if (allSubtestChartsLoaded) loadAllSubtestCharts();
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
  if (chartCanvas) chartCanvas.style.opacity = '0.3';
}

function hideChartLoading() {
  const loader = document.getElementById('chart-loader');
  if (loader) loader.style.display = 'none';
  const chartCanvas = document.getElementById('myChart');
  if (chartCanvas) chartCanvas.style.opacity = '1';
}

// --- All Subtest Charts ---

async function loadAllSubtestCharts() {
  const container = document.getElementById('all-subtests-container');
  if (!container) return;

  const btn = document.getElementById('load-all-subtests-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading subtest charts...'; }

  allSubtestChartsLoaded = true;
  const days = window.navBenchData.days || 90;

  for (const chart of Object.values(subtestCharts)) chart.destroy();
  subtestCharts = {};
  container.innerHTML = '';

  // Subtests = everything except the overall (empty test name)
  const subtests = window.navBenchData.subtestNames.filter(n => n !== '');

  const statusDiv = document.createElement('div');
  statusDiv.id = 'subtest-load-status';
  statusDiv.style.cssText = 'text-align: center; font-family: sans-serif; font-size: 14px; color: #666; margin-bottom: 15px;';
  statusDiv.textContent = `Loading 0 / ${subtests.length} subtest charts...`;
  container.appendChild(statusDiv);

  for (const testName of subtests) {
    const wrapper = document.createElement('div');
    wrapper.id = `subtest-wrapper-${testName}`;
    wrapper.style.cssText = 'position: relative; margin-bottom: 30px;';

    const title = document.createElement('h3');
    title.style.cssText = 'font-family: sans-serif; margin-bottom: 5px;';
    title.textContent = `${testName} (higher is better)`;
    wrapper.appendChild(title);

    const loaderDiv = document.createElement('div');
    loaderDiv.id = `subtest-loader-${testName}`;
    loaderDiv.style.cssText = 'text-align: center; padding: 40px 0;';
    loaderDiv.innerHTML = `
      <div style="display: inline-block; width: 30px; height: 30px; border: 4px solid #ddd; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 10px; font-size: 13px; color: #999;">Loading ${testName}...</div>
    `;
    wrapper.appendChild(loaderDiv);

    const canvas = document.createElement('canvas');
    canvas.id = `subtest-chart-${testName}`;
    canvas.style.cssText = 'width:100%; display: none;';
    wrapper.appendChild(canvas);

    container.appendChild(wrapper);
  }

  const batchSize = 4;
  let loaded = 0;
  for (let i = 0; i < subtests.length; i += batchSize) {
    const batch = subtests.slice(i, i + batchSize);
    await Promise.all(batch.map(async (testName) => {
      await loadSingleSubtestChart(testName, days);
      loaded++;
      if (statusDiv) statusDiv.textContent = `Loaded ${loaded} / ${subtests.length} subtest charts`;
    }));
  }

  if (statusDiv) { statusDiv.textContent = `All ${subtests.length} subtest charts loaded.`; statusDiv.style.color = '#2a7'; }
  if (btn) { btn.textContent = 'Hide All Subtest Charts'; btn.disabled = false; btn.onclick = hideAllSubtestCharts; }
}

function hideAllSubtestCharts() {
  const container = document.getElementById('all-subtests-container');
  if (container) {
    for (const chart of Object.values(subtestCharts)) chart.destroy();
    subtestCharts = {};
    container.innerHTML = '';
  }
  allSubtestChartsLoaded = false;
  const btn = document.getElementById('load-all-subtests-btn');
  if (btn) { btn.textContent = 'Load All Subtest Charts'; btn.onclick = loadAllSubtestCharts; }
}

async function loadSingleSubtestChart(testName, days) {
  const testSignatures = Object.values(window.navBenchData.signatures).filter(
    sig => (sig.test ?? '') === testName
  );

  const loaderEl = document.getElementById(`subtest-loader-${testName}`);
  const canvasEl = document.getElementById(`subtest-chart-${testName}`);

  if (testSignatures.length === 0) {
    if (loaderEl) loaderEl.innerHTML = '<div style="color: #999; font-size: 13px;">No data available</div>';
    return;
  }

  const intervalSeconds = days * 24 * 60 * 60;
  const chartData = [];

  const fetchPromises = testSignatures.map(async (sig) => {
    try {
      const dataUrl = `https://treeherder.mozilla.org/api/performance/summary/?repository=autoland&signature=${sig.id}&framework=${window.navBenchData.framework}&interval=${intervalSeconds}&all_data=true`;
      const dataResponse = await fetch(dataUrl);
      const perfData = await dataResponse.json();
      const dataPoints = [];
      if (Array.isArray(perfData) && perfData.length > 0 && perfData[0].data) {
        for (const point of perfData[0].data) {
          const timestamp = point.push_timestamp;
          const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp * 1000;
          dataPoints.push({
            date: new Date(timestampMs),
            application: sig.application,
            signature_id: sig.id,
            value: point.value,
            revision: point.revision,
            job_id: point.job_id
          });
        }
      }
      return dataPoints;
    } catch (error) {
      console.error(`Error fetching subtest signature ${sig.id}:`, error);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(pts => chartData.push(...pts));

  if (loaderEl) loaderEl.style.display = 'none';
  if (canvasEl) canvasEl.style.display = 'block';

  displaySubtestChart(canvasEl, chartData, testName);
}

function displaySubtestChart(canvas, data, testName) {
  if (!canvas) return;
  if (subtestCharts[testName]) subtestCharts[testName].destroy();

  const firefoxData = data.filter(d => d.application === 'firefox');

  subtestCharts[testName] = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Firefox',
        data: firefoxData.map(d => ({ x: d.date, y: d.value, revision: d.revision, job_id: d.job_id })),
        pointRadius: 3,
        pointBackgroundColor: '#FF9500',
        pointBorderColor: '#000000',
        pointBorderWidth: 0.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      onClick: async (event, elements, chart) => {
        if (elements && elements.length > 0) {
          const dp = chart.data.datasets[elements[0].datasetIndex].data[elements[0].index];
          await loadNavBenchVideo(dp.job_id, dp.revision, dp.x, dp.y, testName);
        }
      },
      onHover: (event, activeElements) => {
        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            title: function(context) {
              if (context.length > 0) {
                const date = new Date(context[0].parsed.x);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              }
              return '';
            },
            label: function(context) {
              const dp = context.dataset.data[context.dataIndex];
              const rev = dp && dp.revision ? ` (${dp.revision.substring(0, 6)})` : '';
              return (context.dataset.label || '') + ': ' + round(context.parsed.y, 2) + rev;
            },
            afterLabel: function() {
              return 'Click to view video';
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' },
          title: { display: true, text: 'Date' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Score (higher is better)' }
        }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const btnMap = {
    'linux': 'linuxbutton',
    'osxm4': 'osxm4button',
    'windows': 'windowsbutton',
    'windows-hwref': 'windowshwrefbutton'
  };
  const activeBtn = document.getElementById(btnMap[osParam] || 'osxm4button');
  if (activeBtn) activeBtn.style.backgroundColor = 'gray';

  loadNavBenchData();
});
