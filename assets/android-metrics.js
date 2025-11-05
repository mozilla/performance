window.telemetryData = [];

// Set some defaults.
window.platformStatus = 'Android';
window.historyStatus = 90;
window.allCharts = [];
window.selectedDevice = 'a55';
window.mainChart = null;
window.currentSuiteName = null;
window.currentVideos = {};
window.currentReplicates = [];

async function loadAndDisplayVideo(taskId, retryId, suiteName, browser, date, value, revision, workerId) {
  try {
    const videoContainer = document.getElementById('video-container');
    const videoElement = document.getElementById('perf-video');
    const videoInfo = document.getElementById('video-info');
    const videoLoading = document.getElementById('video-loading');
    const replicateSelect = document.getElementById('replicate-select');
    const dataPointInfo = document.getElementById('data-point-info');
    const jobLink = document.getElementById('job-link');

    // Show container and loading spinner, hide video
    videoContainer.style.display = 'block';
    videoLoading.style.display = 'block';
    videoElement.style.display = 'none';
    videoElement.src = '';
    videoElement.pause();

    // Update data point information
    const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const workerInfo = workerId ? ` | Worker: ${workerId}` : '';
    dataPointInfo.innerHTML = `<strong>${browser}</strong> | ${dateStr} | <strong>${value.toFixed(2)} ms</strong>${workerInfo}`;

    // Update job link with revision
    jobLink.href = `https://treeherder.mozilla.org/jobs?repo=mozilla-central&revision=${revision}&group_state=expanded&selectedTaskRun=${taskId}.${retryId}`;

    videoInfo.textContent = '';
    replicateSelect.innerHTML = '<option>Loading...</option>';

    // First, fetch perfherder-data.json to get replicate values
    const perfherderUrl = `https://firefoxci.taskcluster-artifacts.net/${taskId}/${retryId}/public/build/perfherder-data.json`;
    const perfherderResponse = await fetch(perfherderUrl);

    if (!perfherderResponse.ok) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'Perfherder data not available';
      return;
    }

    const perfherderData = await perfherderResponse.json();
    const suite = perfherderData.suites.find(s => s.name === suiteName);

    if (!suite || !suite.subtests) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'No replicate data found';
      return;
    }

    // Find the main test metric
    let mainTest = suite.subtests.find(t => t.name === 'applink_startup');
    if (!mainTest) {
      mainTest = suite.subtests.find(t => t.name === 'homeview_startup');
    }
    if (!mainTest) {
      mainTest = suite.subtests.find(t => t.name === 'tab_restore');
    }
    if (!mainTest) {
      // For other tests, use the suite value
      mainTest = suite;
    }

    const replicates = mainTest.replicates || [];

    if (replicates.length === 0) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'No replicate values found';
      return;
    }

    window.currentReplicates = replicates;

    // Now fetch and extract the .tgz file
    const tgzUrl = `https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/${taskId}/runs/${retryId}/artifacts/public/build/${suiteName}.tgz`;

    const tgzResponse = await fetch(tgzUrl);

    if (!tgzResponse.ok) {
      videoLoading.style.display = 'none';
      videoInfo.textContent = 'Video archive not available (status: ' + tgzResponse.status + ')';
      return;
    }

    const arrayBuffer = await tgzResponse.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
    const extractedFiles = await untar(decompressed.buffer);

    // Filter for video files
    const videos = {};
    for (const file of extractedFiles) {
      if (file.name.endsWith('.mp4') || file.name.endsWith('.webm')) {
        videos[file.name] = file.buffer;
      }
    }

    window.currentVideos = videos;

    // Populate dropdown with replicates
    replicateSelect.innerHTML = '';
    replicates.forEach((value, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Replicate ${index + 1}: ${value.toFixed(2)} ms`;
      replicateSelect.appendChild(option);
    });

    // Hide loading spinner, show video
    videoLoading.style.display = 'none';
    videoElement.style.display = 'block';

    // Display first video by default
    if (Object.keys(videos).length > 0) {
      selectReplicate(0);
    } else {
      videoInfo.textContent = 'No video files found in archive';
    }

  } catch (error) {
    console.error('Error loading video:', error);
    const videoLoading = document.getElementById('video-loading');
    const videoElement = document.getElementById('perf-video');
    if (videoLoading) videoLoading.style.display = 'none';
    if (videoElement) videoElement.style.display = 'block';
    document.getElementById('video-info').textContent = 'Error loading video: ' + error.message;
  }
}

function selectReplicate(index) {
  const videoElement = document.getElementById('perf-video');
  const videoInfo = document.getElementById('video-info');

  // Update URL parameter
  updateUrlParams({ replicate: index.toString() });

  const videoFiles = Object.keys(window.currentVideos).sort();

  if (videoFiles[index]) {
    const filename = videoFiles[index];
    const fileData = window.currentVideos[filename];
    const videoBlob = new Blob([fileData], { type: 'video/mp4' });
    const videoUrl = URL.createObjectURL(videoBlob);

    videoElement.src = videoUrl;
    videoElement.load();

    videoElement.onloadedmetadata = () => {
      videoElement.currentTime = 0;
    };

    const replicateValue = window.currentReplicates[index];
    videoInfo.textContent = `Replicate ${parseInt(index) + 1}: ${replicateValue.toFixed(2)} ms`;
  } else {
    videoInfo.textContent = 'Video not found for this replicate';
  }
}

function closeVideo() {
  const videoContainer = document.getElementById('video-container');
  const videoElement = document.getElementById('perf-video');

  videoContainer.style.display = 'none';
  videoElement.pause();
  videoElement.src = '';

  window.currentVideos = {};
  window.currentReplicates = [];
}

function setHistory(history) {
  // Find max number of days.
  const latestDate = new Date(window.data.at(-1).date);
  const furthestDate = new Date(window.data.at(0).date);
  const maxDays = (latestDate - furthestDate) / (1000 * 60 * 60 * 24);

  if (history > maxDays) {
    history = Math.round(maxDays);
  }

  window.historyStatus = history;

  displayCharts();
}

function setPlatform(platform) {
  window.platformStatus = platform;
  displayCharts();
}

function writeContentTitle() {
  const title = document.getElementById('content-title');
  title.innerText = `${window.platformStatus} / ${window.historyStatus} days`;
}

function calculateDelta(values) {
    const n = values.length;
    
    // Create x values (0 to n-1) representing the time sequence of data points
    const xValues = Array.from({ length: n }, (_, i) => i);

    // Calculate the averages of x and y (the subset values)
    const xAvg = xValues.reduce((sum, x) => sum + x, 0) / n;
    const yAvg = values.reduce((sum, y) => sum + y, 0) / n;

    // Calculate the slope (m) of the line of best fit using the least squares method
    const numerator = xValues.reduce((sum, x, i) => sum + (x - xAvg) * (values[i] - yAvg), 0);
    const denominator = xValues.reduce((sum, x) => sum + Math.pow(x - xAvg, 2), 0);
    const slope = numerator / denominator;

    // Calculate the y-intercept (b) of the line of best fit
    const intercept = yAvg - slope * xAvg;

    // Calculate the predicted y-values (trend line) for the first and last x-values
    const firstY = intercept;  // y-value at x = 0 (first data point)
    const lastY = slope * (n - 1) + intercept;  // y-value at x = n - 1 (last data point)

    // Calculate the percentage improvement between the first and last points on the trend line
    const improvement = ((lastY - firstY) / firstY) * 100;
    
    return improvement.toFixed(2);
}


function displayMetrics(id, title1, values1, title2, values2) {
    function getDeltaColor(improvement) {
        if (improvement > 5)
            return "red";
        else if (improvement < -5)
            return "green";
        else 
            return "black";
    }

    const improvement1 = calculateDelta(values1);
    const improvement2 = calculateDelta(values2);
    document.getElementById(id).innerHTML = `
        <div class="metric-item">${title1} &Delta;: <font style="color: ${getDeltaColor(improvement1)};">${improvement1 > 0 ? "+" + improvement1 : improvement1}%</font></div>
        <div class="metric-item">${title2} &Delta;: <font style="color: ${getDeltaColor(improvement2)};">${improvement2 > 0 ? "+" + improvement2 : improvement2}%</font></div>
    `;
}

function plotChart(id, dataset, unit) {
  const ctx = document.getElementById(id+"-canvas").getContext('2d');
  let chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: dataset
    },
    options: {
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'll' },
          title: { display: true, text: 'Timestamp' }
        },
        y: {
          beginAtZero: false,
          title: { display: true, text: `${unit}` }
        }
      },
    },
    plugins: [backgroundColorPlugin]
  });

  //displayMetrics(id+"-metrics", title1, values1, title2, values2);
  window.allCharts.push(chart);
}

function updateChart() {
  Chart.helpers.each(Chart.instances, function (instance) {
     instance.options.scales.xAxes[0].time.min = leftEnd;
     instance.options.scales.xAxes[0].time.max = rightEnd;
     instance.update();
  });
}

function getAppColor(app) {
  switch(app) {
    case "fenix":
    case "firefox":
      return 'rgba(54, 162, 235, 1)';

    case "chrome-m":
    case "chrome":
      return 'rgba(255, 99, 132, 1)'

    case "cstm-car-m":
      return 'purple';
  }
  return "green";
}

function displayChartForMetric(data, metric, name, unit) {
  const filteredData = data.filter(row => row.test === metric);
  const groupedData = {};

  let url="https://treeherder.mozilla.org/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1&highlightCommonAlerts=0&timerange=2592000"

  const signatureIds = new Set()
  filteredData.forEach(row => {
    if (url !== undefined && !signatureIds.has(row.signature_id)) {
      let signature_id  = row.signature_id;
      let framework_id  = row.framework_id;
      let repository_id = row.repository_id;
      if (signature_id && framework_id && repository_id) {
        url += `&series=mozilla-central,${signature_id},${repository_id},${framework_id}`
      } else {
        url = undefined;
      }
      signatureIds.add(signature_id);
    }
  });

  // Update the title to a link to the perfherder page.
  if (url) {
    const title = document.getElementById(name+"-section");
    if (title) {
      let link = document.createElement("a");
      link.href = url;
      link.style.textDecoration = "none";
      title.parentNode.insertBefore(link, title);
      link.appendChild(title);
    }
  }

  // Group data by application
  filteredData.forEach(item => {
      if (!groupedData[item.application]) {
          groupedData[item.application] = [];
      }
      groupedData[item.application].push({
          x: new Date(item.date), // Convert date to Date object for x-axis
          y: item.value           // Use value for y-axis
      });
  });

  dataset = Object.keys(groupedData).map((app, index) => ({
      label: app,
      data: groupedData[app],
      fill: false,
      backgroundColor: getAppColor(app),
      borderWidth: 1,
      tension: 0.1,
  }));

  // Only add trendline's when there are enough data points.
  dataset.forEach(ds => {
    if (ds.data.length > 5) {
      ds["trendlineLinear"] = {
        colorMin: getAppColor(ds.label),
        colorMax: getAppColor(ds.label),
        style: "rgba(255,105,180, .8)",
        lineStyle: "dotted",
        width: 2
      }
    }
  });

  plotChart(metric, dataset, unit);
}

function displayCharts() {
  while (window.allCharts.length > 0) {
    window.allCharts.pop().destroy();
  }

  const history  = window.historyStatus;
  const latestDate = new Date(window.data.at(-1).date);

  let cutoffDate = new Date(latestDate);
  cutoffDate.setDate(latestDate.getDate() - history);
  cutoffDate = cutoffDate.toISOString().split('T')[0];

  const filteredData = window.data.filter(row => row.date >= cutoffDate);

  // Filter tests by selected device
  const deviceSuffix = window.selectedDevice.toUpperCase();
  const filteredTests = window.tests.filter(test => {
    return test.name.includes(`(${deviceSuffix})`) || !test.name.match(/\((A55|P6|S24)\)/);
  });

  filteredTests.forEach(test => {
    test.metric.forEach(metric => {
      displayChartForMetric(filteredData, metric, test.name, test.unit);
    });
  });
}

const backgroundColorPlugin = {
  id: 'backgroundColor',
  beforeDraw: (chart) => {
    const {ctx, width, height} = chart;
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
  }
};

function fixupStartupTests(data) {
  data.forEach(row => {
    if (row.suite === 'AndroidStartup:fenix') {
      row.suite = 'AndroidStartup';
      row.application = 'fenix';
    } else if (row.suite === 'AndroidStartup:chrome-m') {
      row.suite = 'AndroidStartup';
      row.application = 'chrome-m';
    } else if (row.test === 'applink_startup' && row.suite === 'newssite-applink-startup' && row.platform === 'android-hw-a55-14-0-aarch64-shippable') {
      row.test = 'newssite-applink-startup-a55';
    } else if (row.test === 'applink_startup' && row.suite === 'newssite-applink-startup' && row.platform === 'android-hw-p6-13-0-aarch64-shippable') {
      row.test = 'newssite-applink-startup-p6';
    } else if (row.test === 'applink_startup' && row.suite === 'newssite-applink-startup' && row.platform === 'android-hw-s24-14-0-aarch64-shippable') {
      row.test = 'newssite-applink-startup-s24';
    } else if (row.test === 'applink_startup' && row.suite === 'shopify-applink-startup' && row.platform === 'android-hw-a55-14-0-aarch64-shippable') {
      row.test = 'shopify-applink-startup-a55';
    } else if (row.test === 'applink_startup' && row.suite === 'shopify-applink-startup' && row.platform === 'android-hw-p6-13-0-aarch64-shippable') {
      row.test = 'shopify-applink-startup-p6';
    } else if (row.test === 'applink_startup' && row.suite === 'shopify-applink-startup' && row.platform === 'android-hw-s24-14-0-aarch64-shippable') {
      row.test = 'shopify-applink-startup-s24';
    } else if ( row.test === 'homeview_startup' && row.suite === 'homeview-startup' && row.platform === 'android-hw-a55-14-0-aarch64-shippable') {
      row.test = 'homeview-startup-a55';
    } else if ( row.test === 'homeview_startup' && row.suite === 'homeview-startup' && row.platform === 'android-hw-p6-13-0-aarch64-shippable') {
      row.test = 'homeview-startup-p6';
    } else if ( row.test === 'homeview_startup' && row.suite === 'homeview-startup' && row.platform === 'android-hw-s24-14-0-aarch64-shippable') {
      row.test = 'homeview-startup-s24';
    } else if ( row.test === 'tab_restore' && row.suite === 'tab-restore-shopify' && row.platform === 'android-hw-a55-14-0-aarch64-shippable') {
      row.test = 'restore-startup-a55';
    } else if ( row.test === 'tab_restore' && row.suite === 'tab-restore-shopify' && row.platform === 'android-hw-p6-13-0-aarch64-shippable') {
      row.test = 'restore-startup-p6';
    } else if ( row.test === 'tab_restore' && row.suite === 'tab-restore-shopify' && row.platform === 'android-hw-s24-14-0-aarch64-shippable') {
      row.test = 'restore-startup-s24';
    }
  });
}

function fixupPageloadTests(data) {
  data.forEach(row => {
    if (row.category === 'pageload') {
      row.test = `${row.suite}-${row.test}`
    }
  });
}

function geometricMean(numbers) {
  const positiveNumbers = numbers.filter(num => num > 0);
  if (positiveNumbers.length === 0) return 0;

  const product = positiveNumbers.reduce((acc, num) => acc * num, 1);
  return Math.pow(product, 1 / positiveNumbers.length);
}

function fixupResourceTests(data) {
  const resourceData = data.filter(row => row.category === 'resource');

  let groupedObjects = {};
  resourceData.forEach(row => {
    const fields = row.test.split('-');
    const resource = fields[0]; // "rss", "pss", "cpuTime"
    const process = fields[1]; // "gpu", "main", "tab", "total"
    const key = `${resource}-${process}-${row.application}-${row.date}`;

    if (!groupedObjects[key]) {
      groupedObjects[key] = {
        application: row.application,
        date: row.date,
        category: row.category,
        suite: row.suite,
        metrics: []
      }
    }

    groupedObjects[key].metrics.push(row.value);
  });

  Object.keys(groupedObjects).forEach(key => {
    const entry = groupedObjects[key];
    const avg = entry.metrics.reduce((acc, value) => acc + value, 1) / (entry.metrics.length);
    const fields = key.split('-');
    const resource = fields[0];
    const process = fields[1];
  
    data.push({
      application: entry.application,
      category: entry.category,
      date: entry.date,
      suite: entry.suite,
      test: `${resource}-${process}-geomean`,  // e.g., "rss-geomean", "pss-geomean"
      value: avg
    });
  });
}

async function loadData(dataUrl) {
  try {
    const response = await fetch(dataUrl);
    const compressedData = await response.arrayBuffer();

    const decompressedData = pako.inflate(new Uint8Array(compressedData), { to: 'string' });
    let data = JSON.parse(decompressedData).query_result.data.rows;

    fixupStartupTests(data);
    fixupPageloadTests(data);
    fixupResourceTests(data);

    window.data = data;
    window.data.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Check for URL parameters to restore state
    const urlParams = getUrlParams();

    // Set device from URL if present
    if (urlParams.device && ['a55', 'p6', 's24'].includes(urlParams.device)) {
      selectDevice(urlParams.device);
    } else {
      displayMainChart();
      displayTable();
    }

    // Restore selected data point and video if present
    if (urlParams.taskId && urlParams.test) {
      // Find the data point with this taskId
      const dataPoint = window.data.find(d => d.task_id === urlParams.taskId);
      if (dataPoint) {
        const retryId = parseInt(urlParams.retryId) || 0;
        const browser = dataPoint.application === 'fenix' ? 'Firefox' : 'Chrome';

        await loadAndDisplayVideo(
          urlParams.taskId,
          retryId,
          urlParams.test,
          browser,
          dataPoint.date,
          dataPoint.value,
          dataPoint.revision,
          dataPoint.worker_id
        );

        // Select specific replicate if provided
        if (urlParams.replicate) {
          const replicateIndex = parseInt(urlParams.replicate);
          setTimeout(() => {
            document.getElementById('replicate-select').value = replicateIndex;
            selectReplicate(replicateIndex);
          }, 1000);
        }
      }
    }

  } catch (error) {
    console.error('Error loading the JSON file:', error);
  }
}

function generateContent(dataUrl) {
  loadData(dataUrl);
}

function selectDevice(device) {
  window.selectedDevice = device;

  // Close video and clear task parameters
  closeVideo();
  updateUrlParams({
    device: device,
    test: null,
    taskId: null,
    retryId: null,
    replicate: null
  });

  // Update button states
  document.querySelectorAll('.device-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(device + '-button').classList.add('active');

  // Refresh the display
  displayMainChart();
  displayTable();
}

function updateUrlParams(params) {
  const url = new URL(window.location);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }
  window.history.replaceState({}, '', url);
}

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    device: params.get('device'),
    test: params.get('test'),
    taskId: params.get('taskId'),
    retryId: params.get('retryId'),
    replicate: params.get('replicate')
  };
}

function displayMainChart(testMetric, testName, firefoxSigId, chromeSigId, carSigId, frameworkId, suiteName) {
  // Default to newssite-applink-startup if not specified
  if (!testMetric) {
    testMetric = 'newssite-applink-startup-' + window.selectedDevice;
    testName = 'newssite-applink-startup (' + window.selectedDevice.toUpperCase() + ')';
    suiteName = 'newssite-applink-startup';
  }

  window.currentSuiteName = suiteName;

  const firefoxData = window.data.filter(
    item => item.test === testMetric && (item.application === 'firefox' || item.application === 'fenix')
  );
  const chromeData = window.data.filter(
    item => item.test === testMetric && item.application === 'chrome-m'
  );
  const carData = window.data.filter(
    item => item.test === testMetric && item.application === 'cstm-car-m'
  );

  if (firefoxData.length === 0) {
    return;
  }

  // Get signature IDs if not provided
  if (!firefoxSigId) firefoxSigId = firefoxData.length > 0 ? firefoxData[0].signature_id : null;
  if (!chromeSigId) chromeSigId = chromeData.length > 0 ? chromeData[0].signature_id : null;
  if (!carSigId) carSigId = carData.length > 0 ? carData[0].signature_id : null;
  if (!frameworkId) frameworkId = firefoxData.length > 0 ? firefoxData[0].framework_id : 15;

  // Update the title link
  const titleElement = document.getElementById('main-chart-title');
  if (titleElement) {
    titleElement.textContent = testName;

    // Build Perfherder URL
    const series = [];
    if (carSigId) series.push(`mozilla-central,${carSigId},1,${frameworkId}`);
    if (firefoxSigId) series.push(`mozilla-central,${firefoxSigId},1,${frameworkId}`);
    if (chromeSigId) series.push(`mozilla-central,${chromeSigId},1,${frameworkId}`);

    if (series.length > 0) {
      const seriesParam = series.join('&series=');
      titleElement.href = `https://treeherder.mozilla.org/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1&highlightCommonAlerts=0&timerange=2592000&series=${seriesParam}`;
    }
  }

  const ctx = document.getElementById('main-chart');
  if (!ctx) return;

  if (window.mainChart) {
    window.mainChart.destroy();
  }

  // For cpuTime, use chrome-m; otherwise prefer CaR
  const chromeDataToUse = (testMetric === 'cpuTime') ? chromeData : (carData.length > 0 ? carData : chromeData);

  const history = window.historyStatus;
  const filteredFirefoxData = firefoxData.slice(-history);
  const filteredChromeData = chromeDataToUse.slice(-history);

  window.mainChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Firefox',
          data: filteredFirefoxData.map(item => ({
            x: item.date,
            y: item.value,
            task_id: item.task_id,
            retry_id: item.retry_id,
            revision: item.revision,
            worker_id: item.worker_id
          })),
          pointBackgroundColor: '#FF9500',
          pointBorderColor: '#000000',
          pointBorderWidth: 1,
          pointRadius: 3,
          pointHoverRadius: 8,
          pointHoverBorderWidth: 2,
          showLine: false
        },
        {
          label: 'Chrome',
          data: filteredChromeData.map(item => ({
            x: item.date,
            y: item.value,
            task_id: item.task_id,
            retry_id: item.retry_id,
            revision: item.revision,
            worker_id: item.worker_id
          })),
          pointBackgroundColor: '#1DA462',
          pointBorderColor: '#000000',
          pointBorderWidth: 1,
          pointRadius: 3,
          pointHoverRadius: 8,
          pointHoverBorderWidth: 2,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: async (event, elements, chart) => {
        // Only enable video for specific tests
        const videoEnabledTests = [
          'newssite-applink-startup',
          'shopify-applink-startup',
          'homeview-startup',
          'tab-restore-shopify'
        ];

        if (!videoEnabledTests.includes(window.currentSuiteName)) {
          return;
        }

        if (elements.length > 0) {
          const element = elements[0];
          const dataPoint = chart.data.datasets[element.datasetIndex].data[element.index];
          const datasetLabel = chart.data.datasets[element.datasetIndex].label;

          if (dataPoint && dataPoint.task_id) {
            const retryId = dataPoint.retry_id || 0;

            // Update URL with selected data point
            updateUrlParams({
              device: window.selectedDevice,
              test: window.currentSuiteName,
              taskId: dataPoint.task_id,
              retryId: retryId.toString()
            });

            await loadAndDisplayVideo(
              dataPoint.task_id,
              retryId,
              window.currentSuiteName,
              datasetLabel,
              dataPoint.x,
              dataPoint.y,
              dataPoint.revision,
              dataPoint.worker_id
            );
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        },
        tooltip: {
          mode: 'nearest',
          intersect: false,
          callbacks: {
            footer: function(context) {
              const videoEnabledTests = [
                'newssite-applink-startup',
                'shopify-applink-startup',
                'homeview-startup',
                'tab-restore-shopify'
              ];

              if (context.length > 0 && videoEnabledTests.includes(window.currentSuiteName)) {
                return 'Click to view video';
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day'
          },
          display: true,
          title: {
            display: true,
            text: 'Date',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Time (ms)',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        }
      }
    }
  });
}

// Calculate the differences between firefox & chrome for each test and
// display them in a table.  We ignore any results that don't have a
// chrome average.
function displayTable() {
  const results = [];

  // Filter tests by selected device
  const deviceSuffix = window.selectedDevice.toUpperCase();
  const filteredTests = window.tests.filter(test => {
    return test.name.includes(`(${deviceSuffix})`) || !test.name.match(/\((A55|P6|S24)\)/);
  });

  filteredTests.forEach(test => {
    metric = test.metric[0];

    const firefoxData = window.data.filter(
      item => item.test === metric && (item.application === 'firefox' || item.application === 'fenix')
    );
    const chromeData = window.data.filter(
      item => item.test === metric && item.application === 'chrome-m'
    );
    const carData = window.data.filter(
      item => item.test === metric && item.application === 'cstm-car-m'
    );

    // For sp3-cpuTime, use chrome-m; otherwise prefer CaR data
    const chromeDataToUse = (metric === 'cpuTime') ? chromeData : (carData.length > 0 ? carData : chromeData);

    const firefoxAvg = calculateRecentAverage(firefoxData);
    const chromeAvg = calculateRecentAverage(chromeDataToUse);
    const difference = ((chromeAvg - firefoxAvg) / firefoxAvg) * 100;

    const monthAgoFirefoxAvg = calculateMonthAgoAverage(firefoxData);
    const monthAgoChromeAvg = calculateMonthAgoAverage(chromeDataToUse);
    const monthAgoDifference = ((monthAgoChromeAvg - monthAgoFirefoxAvg) / monthAgoFirefoxAvg) * 100;

    // Include test if we have Firefox data and at least some Chrome data (even if average is 0)
    if (firefoxAvg !== 0 && (chromeData.length > 0 || carData.length > 0)) {
      // Get signature IDs and framework IDs for Perfherder links
      const firefoxSigId = firefoxData.length > 0 ? firefoxData[0].signature_id : null;
      const firefoxFrameworkId = firefoxData.length > 0 ? firefoxData[0].framework_id : null;
      const chromeSigId = chromeData.length > 0 ? chromeData[0].signature_id : null;
      const chromeFrameworkId = chromeData.length > 0 ? chromeData[0].framework_id : null;
      const carSigId = carData.length > 0 ? carData[0].signature_id : null;
      const carFrameworkId = carData.length > 0 ? carData[0].framework_id : null;

      // Get suite name from the data
      const suiteName = firefoxData.length > 0 ? firefoxData[0].suite : null;

      results.push({
        name: test.name,
        unit: test.unit,
        test: metric,
        suite: suiteName,
        firefoxAvg: firefoxAvg,
        chromeAvg: chromeAvg,
        difference: difference.toFixed(1),
        monthAgoFirefoxAvg: monthAgoFirefoxAvg,
        monthAgoChromeAvg: monthAgoChromeAvg,
        monthAgoDifference: monthAgoDifference.toFixed(1),
        firefoxSigId: firefoxSigId,
        firefoxFrameworkId: firefoxFrameworkId,
        chromeSigId: chromeSigId,
        chromeFrameworkId: chromeFrameworkId,
        carSigId: carSigId,
        carFrameworkId: carFrameworkId
      });
    }
  });

  displayResultsInTable(results);
}

// Take the most recent 7 entries and average.
function calculateRecentAverage(data) {
  if (data.length === 0) return 0;

  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  const currentDate = new Date(data[0].date);
  const cutoffDate = new Date(currentDate);
  cutoffDate.setDate(cutoffDate.getDate() - 6);

  const last7DaysData = data.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate >= cutoffDate && itemDate <= currentDate;
  });

  const total = last7DaysData.reduce((sum, item) => sum + item.value, 0);
  return last7DaysData.length > 0 ? total / last7DaysData.length : 0;
}

function calculateMonthAgoAverage(data) {
  if (data.length === 0) return 0;

  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  const mostRecentDate = new Date(data[0].date);
  const currentDate = new Date(mostRecentDate);
  currentDate.setDate(currentDate.getDate() - 28);

  const cutoffDate = new Date(currentDate);
  cutoffDate.setDate(cutoffDate.getDate() - 6);

  const last7DaysData = data.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate >= cutoffDate && itemDate <= currentDate;
  });

  const total = last7DaysData.reduce((sum, item) => sum + item.value, 0);
  return last7DaysData.length > 0 ? total / last7DaysData.length : 0;
}

// Store results for sorting
window.tableResults = [];
window.currentSortColumn = 'testName';
window.currentSortDirection = 'asc';

// Display results in the summary table.
function displayResultsInTable(results) {
  window.tableResults = results;
  renderTable();
}

function renderTable() {
  const tbody = document.querySelector('#tableBody');
  tbody.innerHTML = '';

  window.tableResults.forEach(result => {
    const row = document.createElement('tr');

    row.onclick = () => {
      // Close video and update URL with selected test
      closeVideo();
      updateUrlParams({
        test: result.suite,
        taskId: null,
        retryId: null,
        replicate: null
      });

      displayMainChart(
        result.test,
        result.name,
        result.firefoxSigId,
        result.chromeSigId,
        result.carSigId,
        result.firefoxFrameworkId,
        result.suite
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Calculate difference percentage
    const diff = ((result.chromeAvg - result.firefoxAvg) / result.firefoxAvg) * 100;
    let diffColor = '';
    let diffSign = diff > 0 ? '+' : '';

    if (result.unit.includes('score')) {
      // For scores, higher is better (Chrome > Firefox is bad for us)
      if (diff > 5) diffColor = 'style="color: red;"';
      else if (diff < -5) diffColor = 'style="color: green;"';
    } else {
      // For times, lower is better (Chrome < Firefox is bad for us)
      if (diff < -5) diffColor = 'style="color: red;"';
      else if (diff > 5) diffColor = 'style="color: green;"';
    }

    row.innerHTML = `
      <td class="testName">${result.name}</td>
      <td>${result.firefoxAvg.toFixed(2)} ${result.unit}</td>
      <td>${result.chromeAvg.toFixed(2)} ${result.unit}</td>
      <td ${diffColor}>${diffSign}${diff.toFixed(1)}%</td>
    `;
    tbody.appendChild(row);
  });
}

function sortTable(column) {
  if (window.currentSortColumn === column) {
    window.currentSortDirection = window.currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    window.currentSortColumn = column;
    window.currentSortDirection = 'asc';
  }

  window.tableResults.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return window.currentSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return window.currentSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  renderTable();
}

function createSummaryTable(tests) {
  calculate7DayAverage();
}

function createSidebarSections(tests) {
  var sectionsHTML = '';
  sectionsHTML += `<a href="#summary-section">Summary</a>\n`;

  tests.forEach(function(test) {
    sectionsHTML += `<a href="#${test.name}-section">${test.name}</a>\n`;
  });
  document.querySelector('.sections').innerHTML = sectionsHTML;
}

function createChartsContent(tests) {
  var chartsHTML = '';
  tests.forEach(function(test) {
    chartsHTML += `
            <div class="row-title" id="${test.name}-section">${test.name}</div>
            <div class="content-row"> 
            `;
    test.metric.forEach(metric => {
      chartsHTML += `
                <div class="canvas-column">
                    <div id="${metric}-metrics" class="metric-container"></div> 
                    <canvas id="${metric}-canvas"></canvas> 
                </div> 
          `;
    });

    chartsHTML += `
            </div> 
    `;
  });
  document.querySelector('.charts-content').innerHTML = chartsHTML;
}
