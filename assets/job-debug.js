// Job Debug overlay for speedometer_job_debug.html
// Colors performance data points by the machine that produced them, and links
// each point to its Taskcluster task.
//
// The machine name comes straight from the /api/performance/summary/ response,
// so no extra per-job requests are needed to draw the chart. The Taskcluster
// task id is not in that response, so it is resolved lazily on click.

(function() {
  const state = {
    activeBrowser: null,   // currently selected browser key
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
    machineStyles: {},   // machine_name -> { color, shape, rotation }
    hoveredMachineDatasetIndex: null
  };

  // Browser filter definitions matching speedometer-metrics.js
  const browserDefs = [
    { key: 'firefox', label: 'Firefox', filter: d => (d.application === 'firefox' || d.application === 'fenix') && !d.platform.includes('nightlyasrelease') && !(d.application === 'fenix' && d.extra_options && d.extra_options.includes('fission')) && !(d.extra_options && d.extra_options.includes('nova')) },
    { key: 'firefox-nar', label: 'Nightly-as-Release', filter: d => (d.application === 'firefox' || d.application === 'fenix') && d.platform.includes('nightlyasrelease') && !(d.application === 'fenix' && d.extra_options && d.extra_options.includes('fission')) && !(d.extra_options && d.extra_options.includes('nova')) },
    { key: 'chrome', label: 'Chrome', filter: d => d.application === 'chrome' || d.application === 'chrome-m' },
    { key: 'car', label: 'Chromium-as-Release', filter: d => d.application === 'custom-car' || d.application === 'cstm-car-m' },
    { key: 'safari', label: 'Safari', filter: d => d.application === 'safari' },
    { key: 'safari-tp', label: 'Safari TP', filter: d => d.application === 'safari-tp' }
  ];

  // Styles are kept for the lifetime of the page so that a machine keeps its
  // color and shape when the test, range or browser changes.
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
    return style;
  }

  function colorWithAlpha(hexColor, alpha) {
    if (!hexColor || hexColor[0] !== '#') {
      return hexColor;
    }

    let hex = hexColor.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) {
      return hexColor;
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) {
      return hexColor;
    }

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function setHoveredMachineDataset(chart, hoveredDatasetIndex) {
    if (!chart || state.hoveredMachineDatasetIndex === hoveredDatasetIndex) {
      return;
    }

    state.hoveredMachineDatasetIndex = hoveredDatasetIndex;
    const hasHover = hoveredDatasetIndex !== null;

    chart.data.datasets.forEach((dataset, index) => {
      const baseColor = dataset.baseColor || dataset.pointBackgroundColor;
      const isHovered = index === hoveredDatasetIndex;

      if (!hasHover || isHovered) {
        dataset.pointBackgroundColor = baseColor;
        dataset.pointBorderColor = '#000';
        dataset.pointBorderWidth = isHovered ? 1.5 : 0.5;
        dataset.pointRadius = isHovered ? 6 : 5;
        return;
      }

      dataset.pointBackgroundColor = colorWithAlpha(baseColor, 0.16);
      dataset.pointBorderColor = 'rgba(0, 0, 0, 0.12)';
      dataset.pointBorderWidth = 0.5;
      dataset.pointRadius = 3;
    });

    chart.update('none');
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
  }

  function repositoryForSignature(signatureId) {
    const sig = window.speedometerData.signatures[signatureId];
    return (sig && sig.repository) || window.speedometerData.repository;
  }

  // The performance summary doesn't include the Taskcluster task id, so look it
  // up for the single job the user clicked on.
  async function openTaskForPoint(point) {
    if (!point.job_id) return;

    const repo = repositoryForSignature(point.signature_id);
    try {
      const resp = await fetch(`https://treeherder.mozilla.org/api/project/${repo}/jobs/${point.job_id}/`);
      const job = await resp.json();
      const taskId = job.taskcluster_metadata && job.taskcluster_metadata.task_id;
      if (taskId) {
        window.open(`https://firefox-ci-tc.services.mozilla.com/tasks/${taskId}`, '_blank');
      }
    } catch (err) {
      console.error(`Failed to fetch job ${point.job_id}:`, err);
    }
  }

  function drawChartByMachine(data, testName) {
    const ctx = document.getElementById('myChart');
    if (!ctx) return;
    state.hoveredMachineDatasetIndex = null;

    // Group data points by machine
    const byMachine = {};
    for (const d of data) {
      const machine = d.machine_name || 'unknown';
      if (!byMachine[machine]) byMachine[machine] = [];
      byMachine[machine].push(d);
    }

    // Sort machines by count descending for readability
    const sortedMachines = Object.keys(byMachine).sort((a, b) => byMachine[b].length - byMachine[a].length);

    // Build datasets, one per machine, with unique color+shape combos
    const datasets = sortedMachines.map(machine => {
      const style = getStyleForMachine(machine);
      return {
        label: machine,
        data: byMachine[machine].map(d => ({
          x: d.date,
          y: d.value,
          revision: d.revision,
          job_id: d.job_id,
          signature_id: d.signature_id,
          machine_name: machine
        })),
        pointRadius: 5,
        pointStyle: style.shape,
        pointRotation: style.rotation,
        pointBackgroundColor: style.color,
        pointBorderColor: '#000',
        pointBorderWidth: 0.5,
        baseColor: style.color
      };
    });

    if (typeof timeChart !== 'undefined' && timeChart) {
      timeChart.destroy();
    }

    const browserLabel = (browserDefs.find(d => d.key === state.activeBrowser) || {}).label || state.activeBrowser;
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
            openTaskForPoint(datasets[el.datasetIndex].data[el.index]);
          }
        },
        onHover: (event, activeElements, chart) => {
          const target = event.native ? event.native.target : chart.canvas;
          const hoveredDatasetIndex = activeElements.length > 0 ? activeElements[0].datasetIndex : null;
          target.style.cursor = hoveredDatasetIndex !== null ? 'pointer' : 'default';
          setHoveredMachineDataset(chart, hoveredDatasetIndex);
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
                const taskLabel = dp.job_id ? ' [click for task]' : '';
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
      const shapeSymbols = {
        'circle-0': '●', 'triangle-0': '▲', 'rect-0': '■',
        'rectRot-0': '◆', 'triangle-180': '▼', 'rect-45': '▨'
      };
      legendDiv.innerHTML = '<strong>Machines:</strong> ' + sortedMachines.map(m => {
        const style = state.machineStyles[m];
        const count = byMachine[m].length;
        const symbol = shapeSymbols[`${style.shape}-${style.rotation}`] || '●';
        return `<span style="display:inline-block; margin: 2px 8px 2px 0;"><span style="color:${style.color}; font-size: 14px; margin-right: 3px;">${symbol}</span>${m} (${count})</span>`;
      }).join('');
    }
  }

  function selectBrowser(key) {
    state.activeBrowser = key;
    const days = window.speedometerData.days || 90;
    loadChartDataForTest(window.speedometerData.selectedTest, days);
  }

  // Hook into the existing chart loading to draw by machine instead of by
  // application.
  window.displayChart = function(data, testName) {
    populateBrowserSelect(data);

    const def = browserDefs.find(d => d.key === state.activeBrowser);
    drawChartByMachine(def ? data.filter(def.filter) : data, testName);
  };

  // Disable bug burndown loading
  window.loadSpeedometerBugBurndown = function() {};

  // Expose to global scope for HTML onclick handlers
  window.jobDebug = {
    selectBrowser
  };
})();
