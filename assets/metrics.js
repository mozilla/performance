window.telemetryData = [];

// Set some defaults.
window.platformStatus = 'Windows';
window.channelStatus = 'Nightly';
window.historyStatus = 60;
window.allCharts = [];

function setHistory(history) {
  // Find max number of days.
  const latestDate = new Date(window.telemetryData.at(-1).date);
  const furthestDate = new Date(window.telemetryData.at(0).date);
  const maxDays = (latestDate - furthestDate) / (1000 * 60 * 60 * 24);

  if (history > maxDays) {
    history = maxDays;
  }

  window.historyStatus = history;
  const input = document.getElementById('history-select');
  input.value = history;

  displayCharts();
}

function setChannel(channel) {
  window.channelStatus = channel;
  displayCharts();
}

function setPlatform(platform) {
  window.platformStatus = platform;
  displayCharts();
}

function writeContentTitle() {
  const title = document.getElementById('content-title');
  title.innerText = `${window.platformStatus} / ${window.channelStatus} / ${window.historyStatus} days`;
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

function plotChart(id, labels, values1, title1, color1, values2, title2, color2) {
  const ctx = document.getElementById(id+"-canvas").getContext('2d');
  let chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      labels: labels,
      datasets: [
        {
          label: title1,
          data: values1,
          borderColor: color1,
          fill: false,
          borderWidth: 1,
          tension: 0.1,
          trendlineLinear: {
            style: "rgba(255,105,180, .8)",
            lineStyle: "dotted",
            width: 2
          }
        },
        {
          label: title2,
          data: values2,
          borderColor: color2,
          fill: false,
          borderWidth: 1,
          tension: 0.1,
          trendlineLinear: {
            style: "rgba(255,105,180, .8)",
            lineStyle: "dotted",
            width: 2
          }
        }
      ]
    },
    options: {
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'll' },
          title: { display: true, text: 'Build Date' }
        },
        y: {
          beginAtZero: false,
          title: { display: true, text: 'Time (ms)' }
        }
      },
      plugins: {
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

  displayMetrics(id+"-metrics", title1, values1, title2, values2);
  window.allCharts.push(chart);
}

function updateChart() {
  Chart.helpers.each(Chart.instances, function (instance) {
     instance.options.scales.xAxes[0].time.min = leftEnd;
     instance.options.scales.xAxes[0].time.max = rightEnd;
     instance.update();
  });
}

function displayChartForMetric(data, metric) {
  const filteredData = data.filter(row => row.metric === metric);
  const labels = filteredData.map(row => row.date);
  const meanValues = filteredData.map(row => row.mean);
  const p50Values = filteredData.map(row => row.p_50);
  const p95Values = filteredData.map(row => row.p_95);
  const p99Values = filteredData.map(row => row.p_99);
  plotChart(metric+"-median-mean", labels, meanValues, "Mean", "red", p50Values, "Median", "green");
  plotChart(metric+"-p95-p99", labels, p95Values, "P95", "blue", p99Values, "P99", "orange");
}

function displayCharts() {
  while (window.allCharts.length > 0) {
    window.allCharts.pop().destroy();
  }

  const channel  = window.channelStatus.toLowerCase();
  const platform = window.platformStatus;
  const history  = window.historyStatus;

  const latestDate = new Date(window.telemetryData.at(-1).date);

  let cutoffDate = new Date(latestDate);
  cutoffDate.setDate(latestDate.getDate() - history);
  cutoffDate = cutoffDate.toISOString().split('T')[0];

  const filteredData = window.telemetryData.filter(row => row.channel === channel && row.os === platform && 
                                                   row.date >= cutoffDate);

  writeContentTitle();
  window.metrics.forEach(metric => {
    displayChartForMetric(filteredData, metric[0]);
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

function loadData(dataUrl) {
  fetch(dataUrl)
    .then(response => response.json())
    .then(data => {
      window.telemetryData = data;
      displayCharts();
    })
    .catch(error => console.error('Error loading the JSON file:', error));
}

function generateContent(dataUrl) {
  const historyInput = document.getElementById('history-select');
  historyInput.value = window.historyStatus;
  const channelInput = document.getElementById('channel-select');
  channelInput.value = window.channelStatus;
  const platformInput = document.getElementById('platform-select');
  platformInput.value = window.platformStatus;
  loadData(dataUrl);
}

function createSidebarSections(metrics) {
  var sectionsHTML = '';
  metrics.forEach(function(metric) {
    sectionsHTML += `<a href="#${metric[0]}-section">${metric[1]}</a>\n`;
  });
  document.querySelector('.sections').innerHTML = sectionsHTML;
}

function createChartsContent(metrics) {
  var chartsHTML = '';
  metrics.forEach(function(metric) {
    chartsHTML += `
            <div class="row-title" id="${metric[0]}-section">${metric[1]}</div>
            <div class="row">
                <div class="content-row"> 
                    <div class="sub-row">
                        <div class="content-row">
                            <div class="canvas-column">
                                <div id="${metric[0]}-median-mean-metrics" class="metric-container"></div> 
                                <canvas id="${metric[0]}-median-mean-canvas"></canvas> 
                                <button onclick="window.allCharts.forEach(chart => chart.resetZoom())"> 
                                    Reset Zoom
                                </button> 
                            </div> 
                        </div> 
                    </div>
                    <div class="sub-row">
                        <div class="content-row">
                            <div class="canvas-column">
                                <div id="${metric[0]}-p95-p99-metrics" class="metric-container"></div> 
                                <canvas id="${metric[0]}-p95-p99-canvas"></canvas> 
                            </div> 
                        </div> 
                    </div> 
                </div> 
            </div>
        `;
  });
  document.querySelector('.charts-content').innerHTML = chartsHTML;
}
