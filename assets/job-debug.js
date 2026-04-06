// Job Debug overlay for speedometer_job_debug.html
// Adds machine-level coloring and Taskcluster links to performance data points.

(function() {
  const state = {
    machineData: {},       // job_id -> { machine_name, task_id }
    machineColors: {},     // machine_name -> color
    activeBrowser: null,   // currently selected browser key
    activeChartData: null, // raw data points for the active browser
    // Maximally distinct colors
    colors: [
      '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
      '#42d4f4', '#f032e6', '#469990', '#9A6324', '#000075',
      '#800000', '#808000', '#e6beff', '#aaffc3', '#ffd8b1'
    ],
    // Chart.js point styles
    // All filled shapes; rotation creates visual variants
    // [pointStyle, pointRotation]
    shapes: [
      ['circle', 0],
      ['triangle', 0],       // up triangle
      ['rect', 0],
      ['rectRot', 0],        // diamond
      ['triangle', 180],     // down triangle
      ['rect', 45],          // tilted square (distinct from diamond due to corners)
    ],
    nextMachineIndex: 0,
    machineStyles: {},   // machine_name -> { color, shape }
    fetched: false
  };

  // Browser filter definitions matching speedometer-metrics.js
  const browserDefs = [
    { key: 'firefox', label: 'Firefox', filter: d => (d.application === 'firefox' || d.application === 'fenix') && !d.platform.includes('nightlyasrelease') },
    { key: 'firefox-nar', label: 'Nightly-as-Release', filter: d => (d.application === 'firefox' || d.application === 'fenix') && d.platform.includes('nightlyasrelease') },
    { key: 'chrome', label: 'Chrome', filter: d => d.application === 'chrome' || d.application === 'chrome-m' },
    { key: 'car', label: 'Chromium-as-Release', filter: d => d.application === 'custom-car' || d.application === 'cstm-car-m' },
    { key: 'safari', label: 'Safari', filter: d => d.application === 'safari' },
    { key: 'safari-tp', label: 'Safari TP', filter: d => d.application === 'safari-tp' }
  ];

  function getStyleForMachine(machineName) {
    if (state.machineStyles[machineName]) {
      return state.machineStyles[machineName];
    }
    // Cycle through colors first, then shapes, so color+shape combos are unique
    // up to colors.length * shapes.length machines
    const i = state.nextMachineIndex;
    const colorIdx = i % state.colors.length;
    const shapeIdx = Math.floor(i / state.colors.length) % state.shapes.length;
    state.nextMachineIndex++;
    const [shape, rotation] = state.shapes[shapeIdx];
    const style = { color: state.colors[colorIdx], shape, rotation };
    state.machineStyles[machineName] = style;
    state.machineColors[machineName] = style.color; // keep for legend
    return style;
  }

  function populateBrowserSelect(data) {
    const select = document.getElementById('browser-select');
    if (!select) return;
    select.innerHTML = '';

    for (const def of browserDefs) {
      const hasData = data.some(def.filter);
      if (hasData) {
        const opt = document.createElement('option');
        opt.value = def.key;
        opt.textContent = def.label;
        select.appendChild(opt);
      }
    }

    // Preserve current selection if still valid, otherwise default to first
    if (state.activeBrowser && [...select.options].some(o => o.value === state.activeBrowser)) {
      select.value = state.activeBrowser;
    } else if (select.options.length > 0) {
      state.activeBrowser = select.options[0].value;
      select.value = state.activeBrowser;
    }

    document.getElementById('fetch-machine-btn').disabled = false;
  }

  function getActiveBrowserData(allData) {
    const def = browserDefs.find(d => d.key === state.activeBrowser);
    if (!def) return [];
    return allData.filter(def.filter);
  }

  async function fetchMachineData() {
    const btn = document.getElementById('fetch-machine-btn');
    btn.disabled = true;
    btn.textContent = 'Fetching...';

    // Reset machine state for fresh fetch
    state.machineData = {};
    state.machineColors = {};
    state.machineStyles = {};
    state.nextMachineIndex = 0;

    const data = state.activeChartData;
    if (!data || data.length === 0) {
      btn.textContent = 'No data to fetch';
      btn.disabled = false;
      return;
    }

    // Collect unique job_ids
    const jobIds = [...new Set(data.map(d => d.job_id).filter(Boolean))];
    if (jobIds.length === 0) {
      btn.textContent = 'No job IDs available';
      btn.disabled = false;
      return;
    }

    const progressContainer = document.getElementById('machine-progress-container');
    const progressBar = document.getElementById('machine-progress-bar');
    const progressText = document.getElementById('machine-progress-text');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = `0 / ${jobIds.length} jobs fetched`;

    // Determine the repository for these data points
    const samplePoint = data[0];
    const sig = window.speedometerData.signatures[samplePoint.signature_id];
    const repo = (sig && sig.repository) || window.speedometerData.repository;

    let fetched = 0;
    const batchSize = 10;

    for (let i = 0; i < jobIds.length; i += batchSize) {
      const batch = jobIds.slice(i, i + batchSize);
      await Promise.all(batch.map(async (jobId) => {
        try {
          const resp = await fetch(`https://treeherder.mozilla.org/api/project/${repo}/jobs/${jobId}/`);
          const job = await resp.json();
          state.machineData[jobId] = {
            machine_name: job.machine_name || 'unknown',
            task_id: job.taskcluster_metadata ? job.taskcluster_metadata.task_id : null
          };
        } catch (err) {
          console.error(`Failed to fetch job ${jobId}:`, err);
          state.machineData[jobId] = { machine_name: 'fetch-error', task_id: null };
        }
        fetched++;
        const pct = Math.round((fetched / jobIds.length) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `${fetched} / ${jobIds.length} jobs fetched`;
      }));
    }

    state.fetched = true;
    btn.textContent = 'Fetch Machine Data';
    btn.disabled = false;
    progressText.textContent = `Done - ${fetched} jobs fetched, ${Object.keys(state.machineColors).length || '?'} machines`;

    // Redraw with machine colors
    redrawChartByMachine();
  }

  function redrawChartByMachine() {
    const data = state.activeChartData;
    if (!data || data.length === 0) return;

    // Group data points by machine
    const byMachine = {};
    for (const d of data) {
      const info = state.machineData[d.job_id];
      const machine = info ? info.machine_name : 'unknown';
      if (!byMachine[machine]) byMachine[machine] = [];
      byMachine[machine].push(d);
    }

    // Sort machines by count descending for readability
    const sortedMachines = Object.keys(byMachine).sort((a, b) => byMachine[b].length - byMachine[a].length);

    // Build datasets, one per machine, with unique color+shape combos
    const datasets = sortedMachines.map(machine => {
      const style = getStyleForMachine(machine);
      const points = byMachine[machine];
      return {
        label: machine,
        data: points.map(d => ({
          x: d.date,
          y: d.value,
          revision: d.revision,
          job_id: d.job_id,
          machine_name: machine,
          task_id: (state.machineData[d.job_id] || {}).task_id
        })),
        pointRadius: 5,
        pointStyle: style.shape,
        pointRotation: style.rotation,
        pointBackgroundColor: style.color,
        pointBorderColor: '#000',
        pointBorderWidth: 0.5
      };
    });

    // Destroy and recreate chart
    const ctx = document.getElementById('myChart');
    if (typeof timeChart !== 'undefined' && timeChart) {
      timeChart.destroy();
    }

    const browserLabel = (browserDefs.find(d => d.key === state.activeBrowser) || {}).label || state.activeBrowser;
    const testName = window.speedometerData.selectedTest;
    const isScore = testName === 'score';
    const displayName = isScore ? 'Overall Score' : testName.replace('/total', '');

    timeChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.5,
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const el = elements[0];
            const dp = datasets[el.datasetIndex].data[el.index];
            if (dp.task_id) {
              window.open(`https://firefox-ci-tc.services.mozilla.com/tasks/${dp.task_id}`, '_blank');
            }
          }
        },
        onHover: (event, activeElements) => {
          event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          legend: {
            display: false
          },
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
                const rev = dp.revision ? ` (${dp.revision.substring(0, 8)})` : '';
                const machine = dp.machine_name || '';
                const taskLabel = dp.task_id ? ' [click for task]' : '';
                return `${machine}: ${round(context.parsed.y, 2)}${rev}${taskLabel}`;
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
            beginAtZero: false,
            title: {
              display: true,
              text: isScore ? 'Score (Higher is better)' : 'Time (ms)'
            }
          }
        }
      }
    });

    // Update title
    const chartTitleElement = document.getElementById('chart-title');
    if (chartTitleElement) {
      const betterDirection = isScore ? 'higher is better' : 'lower is better';
      chartTitleElement.textContent = `${displayName} - ${browserLabel} by Machine (${betterDirection})`;
    }

    // Build machine legend with counts
    const legendDiv = document.getElementById('machine-legend');
    if (legendDiv) {
      legendDiv.style.display = 'block';
      const shapeSymbols = {
        'circle-0': '\u25CF', 'triangle-0': '\u25B2', 'rect-0': '\u25A0',
        'rectRot-0': '\u25C6', 'triangle-180': '\u25BC', 'rect-45': '\u25A8'
      };
      legendDiv.innerHTML = '<strong>Machines:</strong> ' + sortedMachines.map(m => {
        const style = state.machineStyles[m];
        const count = byMachine[m].length;
        const symbol = shapeSymbols[`${style.shape}-${style.rotation}`] || '\u25CF';
        return `<span style="display:inline-block; margin: 2px 8px 2px 0;"><span style="color:${style.color}; font-size: 14px; margin-right: 3px;">${symbol}</span>${m} (${count})</span>`;
      }).join('');
    }

    if (typeof filterOutliersEnabled !== 'undefined' && filterOutliersEnabled) {
      applyOutlierFilter(timeChart);
    }
  }

  function selectBrowser(key) {
    state.activeBrowser = key;
    state.fetched = false;
    state.machineData = {};
    state.machineColors = {};
    state.machineStyles = {};
    state.nextMachineIndex = 0;

    // Hide machine legend and progress
    const legendDiv = document.getElementById('machine-legend');
    if (legendDiv) legendDiv.style.display = 'none';
    const progressContainer = document.getElementById('machine-progress-container');
    if (progressContainer) progressContainer.style.display = 'none';

    // Reload the normal chart for this browser only
    const days = window.speedometerData.days || 90;
    loadChartDataForTest(window.speedometerData.selectedTest, days);
  }

  // Default replicates on for the job debug page (user can still toggle off)
  if (!new URLSearchParams(window.location.search).has('replicates')) {
    window.speedometerData.showReplicates = true;
    const replicatesCheckbox = document.getElementById('replicates-toggle');
    if (replicatesCheckbox) {
      replicatesCheckbox.checked = true;
    }
  }

  // Hook into the existing chart loading to capture data and populate browser select.
  // We override displayChart to intercept the data.
  const originalDisplayChart = window.displayChart;
  window.displayChart = function(data, testName) {
    // Populate browser select from available data
    populateBrowserSelect(data);

    // Store filtered data for the active browser
    state.activeChartData = getActiveBrowserData(data);

    // If machine data was previously fetched for this browser, redraw by machine
    if (state.fetched && Object.keys(state.machineData).length > 0) {
      redrawChartByMachine();
      return;
    }

    // Otherwise call the original displayChart but filter to active browser only
    const def = browserDefs.find(d => d.key === state.activeBrowser);
    if (def) {
      const filtered = data.filter(def.filter);
      originalDisplayChart(filtered, testName);
    } else {
      originalDisplayChart(data, testName);
    }
  };

  // When the range changes, reset machine state since data points change
  const originalChangeRange = window.changeRange;
  window.changeRange = function(range) {
    state.fetched = false;
    state.machineData = {};
    state.machineColors = {};
    state.machineStyles = {};
    state.nextMachineIndex = 0;
    const legendDiv = document.getElementById('machine-legend');
    if (legendDiv) legendDiv.style.display = 'none';
    const progressContainer = document.getElementById('machine-progress-container');
    if (progressContainer) progressContainer.style.display = 'none';
    originalChangeRange(range);
  };

  // When the user selects a different test from the table, reset machine state
  const originalSelectTest = window.selectTest;
  window.selectTest = function(testName) {
    state.fetched = false;
    state.machineData = {};
    state.machineColors = {};
    state.machineStyles = {};
    state.nextMachineIndex = 0;
    const legendDiv = document.getElementById('machine-legend');
    if (legendDiv) legendDiv.style.display = 'none';
    const progressContainer = document.getElementById('machine-progress-container');
    if (progressContainer) progressContainer.style.display = 'none';
    originalSelectTest(testName);
  };

  // Disable bug burndown loading
  window.loadSpeedometerBugBurndown = function() {};

  // Expose to global scope for HTML onclick handlers
  window.jobDebug = {
    fetchMachineData,
    selectBrowser
  };
})();
