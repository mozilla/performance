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
    hoveredMachineDatasetIndex: null,
    isolatedMachine: null   // machine_name, or null when all machines are shown
  };

  // Symbols mirroring the Chart.js point styles used for the machine legend.
  // Escaped rather than literal so they survive being served without a charset.
  const shapeSymbols = {
    'circle-0': '\u25cf',      // filled circle
    'triangle-0': '\u25b2',    // up triangle
    'rect-0': '\u25a0',        // square
    'rectRot-0': '\u25c6',     // diamond
    'triangle-180': '\u25bc',  // down triangle
    'rect-45': '\u25a8'        // tilted square
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

    // Only the fill and border fade; point sizes stay constant so that the
    // chart doesn't wiggle as the pointer moves between machines.
    chart.data.datasets.forEach((dataset, index) => {
      const baseColor = dataset.baseColor || dataset.pointBackgroundColor;
      const isHovered = index === hoveredDatasetIndex;

      // Chart.js draws the lowest (order, index) last, i.e. on top, so give the
      // hovered machine a lower order than the rest. Without this, a faded
      // machine that happens to sort earlier paints over the opaque points.
      dataset.order = isHovered ? -1 : 0;

      if (!hasHover || isHovered) {
        dataset.pointBackgroundColor = baseColor;
        dataset.pointBorderColor = '#000';
        return;
      }

      dataset.pointBackgroundColor = colorWithAlpha(baseColor, 0.16);
      dataset.pointBorderColor = 'transparent';
    });

    chart.update('none');
  }

  function setIsolatedMachine(chart, machineName) {
    if (!chart) return;
    state.isolatedMachine = machineName;
    applyIsolation(chart);
    chart.update();
    renderMachineLegend(chart);
  }

  function applyIsolation(chart) {
    chart.data.datasets.forEach((dataset, index) => {
      chart.getDatasetMeta(index).hidden =
        state.isolatedMachine !== null && dataset.label !== state.isolatedMachine;
    });
  }

  function renderMachineLegend(chart) {
    const legendDiv = document.getElementById('machine-legend');
    if (!legendDiv) return;
    legendDiv.innerHTML = '';

    const heading = document.createElement('span');
    heading.className = 'machine-legend-heading';
    heading.textContent = 'Machines:';
    legendDiv.appendChild(heading);

    chart.data.datasets.forEach((dataset, index) => {
      const isSelected = state.isolatedMachine === dataset.label;
      const isHidden = !!chart.getDatasetMeta(index).hidden;
      const style = state.machineStyles[dataset.label];
      const symbol = shapeSymbols[`${style.shape}-${style.rotation}`] || '●';

      const chip = document.createElement('span');
      chip.className = 'machine-chip'
        + (isSelected ? ' selected' : '')
        + (isHidden ? ' hidden-machine' : '');
      chip.title = isSelected
        ? 'Click to show all machines'
        : `Click to show only ${dataset.label}`;

      const swatch = document.createElement('span');
      swatch.className = 'machine-chip-swatch';
      swatch.textContent = symbol;
      if (!isHidden) {
        swatch.style.color = style.color;
      }

      const label = document.createElement('span');
      label.className = 'machine-chip-name';
      label.textContent = dataset.label;

      chip.appendChild(swatch);
      chip.appendChild(label);

      chip.addEventListener('mouseenter', () => setHoveredMachineDataset(chart, index));
      chip.addEventListener('click', () => {
        setIsolatedMachine(chart, isSelected ? null : dataset.label);
      });

      legendDiv.appendChild(chip);
    });

    // Assigned rather than added so that re-rendering doesn't stack listeners
    legendDiv.onmouseleave = () => setHoveredMachineDataset(chart, null);
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

    // Sort alphabetically (numeric-aware) so a machine keeps its legend
    // position when the test, range or browser changes
    const sortedMachines = Object.keys(byMachine).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Keep an isolated machine isolated across reloads, but only if it still
    // has data - otherwise the chart would come back empty
    if (state.isolatedMachine !== null && !byMachine[state.isolatedMachine]) {
      state.isolatedMachine = null;
    }

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

    // Pin the axes to the extent of all data for the selected browser, so that
    // isolating a machine or switching between machines doesn't rescale the plot
    const xValues = data.map(d => d.date.getTime());
    const yValues = data.map(d => d.value);
    const hasData = data.length > 0;
    const xMin = hasData ? Math.min(...xValues) : undefined;
    const xMax = hasData ? Math.max(...xValues) : undefined;
    const yMin = hasData ? Math.min(...yValues) : undefined;
    const yMax = hasData ? Math.max(...yValues) : undefined;
    // Fall back to a fixed padding when every point shares the same x or y,
    // which would otherwise collapse the axis into a zero-width range
    const xPad = xMax > xMin ? (xMax - xMin) * 0.02 : 12 * 60 * 60 * 1000;
    const yPad = yMax > yMin ? (yMax - yMin) * 0.05 : Math.abs(yMax) * 0.05 || 1;

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
            min: hasData ? xMin - xPad : undefined,
            max: hasData ? xMax + xPad : undefined,
            time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' },
            title: { display: true, text: 'Date' }
          },
          y: {
            beginAtZero: false,
            min: hasData ? yMin - yPad : undefined,
            max: hasData ? yMax + yPad : undefined,
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

    applyIsolation(timeChart);
    timeChart.update('none');
    renderMachineLegend(timeChart);
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
