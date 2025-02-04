window.telemetryData = [];

// Set some defaults.
window.platformStatus = 'windows11-64-shippable-qr';
window.historyStatus = 30;
window.allCharts = [];

function sortTable(columnIndex, tableId) {
  const table = document.getElementById(tableId);
  const tbody = table.getElementsByTagName('tbody')[0];
  const rows = Array.from(tbody.getElementsByTagName('tr'));

  const isAscending = table.getAttribute('data-sort-direction') === 'asc';
  const direction = isAscending ? 1 : -1;

  rows.sort((a, b) => {
    const cellA = a.getElementsByTagName('td')[columnIndex].innerText.toLowerCase();
    const cellB = b.getElementsByTagName('td')[columnIndex].innerText.toLowerCase();

    if (!isNaN(cellA) && !isNaN(cellB)) {
      return direction * (parseFloat(cellA) - parseFloat(cellB));
    } else {
      return direction * cellA.localeCompare(cellB);
    }
  });

  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }
  rows.forEach(row => tbody.appendChild(row));
  table.setAttribute('data-sort-direction', isAscending ? 'desc' : 'asc');
}

function findNearestHistory(target, list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("The list must be a non-empty array.");
  }

  return list.reduce((nearest, current) => {
    return Math.abs(current - target) < Math.abs(nearest - target) ? current : nearest;
  });
}

function setHistory(history) {
  // Find max number of days.
  const latestDate = new Date(window.data.at(-1).date);
  const furthestDate = new Date(window.data.at(0).date);

  window.historyStatus = history;
  const input = document.getElementById('history-select');
  input.value = history;

  displayCharts();
}

function setPlatform(platform) {
  window.platformStatus = platform;
  displayContent();
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

function plotChart(id, labels, dataset, unit) {
  const ctx = document.getElementById(id+"-canvas").getContext('2d');
  let chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      labels: labels,
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
      plugins: {
        legend: {
          display: false
        },
        zoom : {
            pan: {
                enabled: false,
            },
            zoom: {
                mode: 'xy',
                drag: {
                    enabled: true,
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1,
                    backgroundColor: 'rgba(54, 162, 235, 0.3)'
                },
                onZoom({ chart }) {
                  window.allCharts.forEach(c => {
                    c.zoomScale(
                      'x',
                      { min: Math.trunc(chart.scales.x.min), max: Math.trunc(chart.scales.x.max) },
                      'none'
                    );
                  });
                },
            },
        },
      }
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

function displayChartForTest(data, id, unit) {
  labels = data.map(row => row.date);
  dataset = [{
      label: "firefox",
      data: data.map(row => row.value),
      fill: false,
      borderWidth: 1,
      tension: 0.1,
  }];

  // Only add trendline's when there are enough data points.
  dataset.forEach(ds => {
    if (ds.data.length > 5) {
      ds["trendlineLinear"] = {
        style: "rgba(255,105,180, .8)",
        lineStyle: "dotted",
        width: 2
      }
    }
  });

  plotChart(id, labels, dataset, unit);
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

  const filteredData = window.data.filter(row => row.date >= cutoffDate && row.platform == platformStatus);

  window.suites.forEach(suite => {
    suite.tests.forEach(test => {
      const label=`${suite.name}-${test.name}`;

      const testData = filteredData.filter(
                          row => row.suite == suite.name && row.test == test.name);
      displayChartForTest(testData, label, test.unit);
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

function fixupMLNaming() {
  window.data.forEach(row => {
    // Rename the suite to something more readable.
    if (row.suite === 'browser_ml_engine_perf.js') {
      row.suite = 'Basic ML Perf';
    }

    // Extract the prefix from each test name and use that as the suite.
    if (row.suite === 'browser_ml_engine_multi_perf.js') {
      const fields = row.test.split('-');
      const prefix = fields.shift();
      const test = fields.join('-');

      if (prefix.includes('intent')) {
        row.suite = 'Intent';
      } else if (prefix.includes('suggest')) {
        row.suite = 'Suggest';
      } else{
        row.suite = prefix;
      }
      row.test = test;
    }

    if (row.suite === 'browser_ml_autofill_perf.js') {
      row.suite = 'Autofill';
      row.test = row.test.replace('AUTOFILL-', '');
    }

    if (row.suite === 'browser_ml_summarizer_perf.js') {
      row.suite = 'Summarizer';
      row.test = row.test.replace('SUM-', '')
        .replace('ONNX-COMMUNITY-', '')
        .replace('XENOVA-', '');
    }
    if (row.suite === 'browser_ml_smart_tab_perf.js') {
      row.suite = 'Smart Tab Grouping';
      row.test = row.test.replace('SMART-TAB-TOPIC-', 'Topic-')
        .replace('SMART-TAB-EMBEDDING-', 'Embedding-')
    }
  });



}

function loadData(dataUrl) {
  fetch(dataUrl)
    .then(response => response.json())
    .then(data => {
      window.data = data.query_result.data.rows;
      fixupMLNaming();

      window.data.sort((a, b) => new Date(a.date) - new Date(b.date));
      displayContent();
    })
    .catch(error => console.error('Error loading the JSON file:', error));
}

function generateContent(dataUrl) {
  const historyInput = document.getElementById('history-select');
  historyInput.value = window.historyStatus;
  loadData(dataUrl);
}

function displayContent() {
  displayCharts();
  displayTable();
}

// Calculate the differences between firefox vs itself from 1 and 4 weeks ago.
function displayTable() {
  const table = document.querySelector('#summary-table tbody');
  table.innerHTML='';

  window.suites.forEach(suite => {
    const testslength = suite.tests.length;
    let isFirstSuiteRow = true;

    suite.tests.forEach(test => {
      const row = document.createElement('tr');

      if (isFirstSuiteRow) {
        row.style.borderTop = '2px solid #ddd';
      }

      const filteredData = window.data.filter(row => row.suite == suite.name && row.test == test.name && row.platform == platformStatus);
      const firefoxAvg_latest = calculate_average(filteredData, 0);
      const firefoxAvg_1wk_ago = calculate_average(filteredData, 7);
      const firefoxAvg_4wk_ago = calculate_average(filteredData, 28);

      const difference_1wk = ((firefoxAvg_latest - firefoxAvg_1wk_ago) / firefoxAvg_latest) * 100;
      const difference_4wk = ((firefoxAvg_latest - firefoxAvg_4wk_ago) / firefoxAvg_latest) * 100;

      let class_1wk = "";
      if (difference_1wk < -5) {
        class_1wk = 'positive-difference';
      } else if (difference_1wk > 5) {
        class_1wk = 'negative-difference';
      }

      let class_4wk = "";
      if (difference_4wk < -5) {
        class_4wk = 'positive-difference';
      } else if (difference_4wk > 5) {
        class_4wk = 'negative-difference';
      }

      // Build row HTML
      row.innerHTML = `
        ${isFirstSuiteRow ? `<td rowspan="${testslength}">${suite.name}</td>` : ''}
        <td class="test-cell ${class_1wk}">${test.name} (${test.unit})</td>
        <td class="${class_1wk}" style="border-left: 1px solid #ddd;">${firefoxAvg_latest.toFixed(2)}</td>
        <td class="${class_1wk}" style="border-left: 1px solid #ddd;">${firefoxAvg_1wk_ago.toFixed(2)}</td>
        <td class="${class_1wk}">${difference_1wk.toFixed(2)}</td>
        <td class="${class_4wk}" style="border-left: 1px solid #ddd;">${firefoxAvg_4wk_ago.toFixed(2)}</td>
        <td class="${class_4wk}">${difference_4wk.toFixed(2)}</td>
      `;

      // Add click handler for the entire row (excluding suite cell)
      row.addEventListener('click', (event) => {
        // Exclude clicks on the suite cell
        const suiteCell = isFirstSuiteRow ? row.querySelector('td[rowspan]') : null;
        if (suiteCell && suiteCell.contains(event.target)) {
          return;
        }
        // Navigate to the corresponding test section
        window.location.hash = `${suite.name}-${test.name}-section`;
      });

      isFirstSuiteRow = false;
      table.appendChild(row);
    });
  });
}



// Take the most recent 7 entries and average.
function calculate_average(data, daysAgo) {
  if (data.length === 0) return 0;

  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  const mostRecentDate = new Date(data[0].date);
  const currentDate = new Date(mostRecentDate);
  currentDate.setDate(currentDate.getDate() - daysAgo);

  const cutoffDate = new Date(currentDate);
  cutoffDate.setDate(cutoffDate.getDate() - 6);

  const last7DaysData = data.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate >= cutoffDate && itemDate <= currentDate;
  });

  const total = last7DaysData.reduce((sum, item) => sum + item.value, 0);
  return last7DaysData.length > 0 ? total / last7DaysData.length : 0;
}

function createSummaryTable(tests) {
  calculate7DayAverage();
}

function createSidebarSections(tests) {
  var sectionsHTML = '';
  sectionsHTML += `<a href="#summary-section">Summary</a>\n`;

  window.suites.forEach(suite => {
    suite.tests.forEach(test => {
      sectionsHTML += `<a href="#${suite.name}-${test.name}-section">(${suite.name}) ${test.name}</a>\n`;
    });
  });
  document.querySelector('.sections').innerHTML = sectionsHTML;
}

function createChartsContent() {
  var chartsHTML = '';

  window.suites.forEach(suite => {
    suite.tests.forEach(test => {
      let name=`${suite.name}-${test.name}`;
      chartsHTML += `
              <div class="row-title" id="${name}-section">(${suite.name}) ${test.name}</div>
              <div class="content-row">
                <div class="canvas-column">
                    <div id="${name}-metrics" class="metric-container"></div>
                    <canvas id="${name}-canvas"></canvas>
                    <button onclick="window.allCharts.forEach(chart => chart.resetZoom())">
                        Reset Zoom
                    </button>
                </div>
              </div>
            `;
    });
  });
  document.querySelector('.charts-content').innerHTML = chartsHTML;
}
