const platformMapping = {
  macOS: "macosx1015-64-shippable-qr",
  linuxHPE: "linux1804-64-shippable",
  windows11Ref: "windows11-64-24h2-hw-ref-shippable",
  windows11: "windows11-64-24h2-shippable"
};

const platformDescriptions = {
  windows11Ref: "Dell OptiPlex 7080, Intel Core i7-10700, 16GB RAM, 512GB SSD.",
  windows11: "HP EliteBook 850 G7, Intel Core i5-10210U, 8GB RAM, 256GB SSD.",
  linuxHPE: "HPE Moonshot m710x, Intel Xeon D-1587, 32GB RAM, 480GB SSD.",
  macOS: "Apple Mac Mini R8, 8GB RAM, 256GB SSD."
};

// Keep track of existing charts
const charts = {};

function clearChart(ctx) {
  if (charts[ctx.id]) {
    charts[ctx.id].destroy(); // Destroy the existing chart
    delete charts[ctx.id]; // Remove reference

    // Fully reset the canvas to prevent Chart.js from reusing old bindings
    const parent = ctx.parentNode;
    const newCanvas = document.createElement("canvas");
    newCanvas.id = ctx.id;
    parent.replaceChild(newCanvas, ctx);

    return newCanvas; // Return the new canvas element
  }

  return ctx; // If no chart existed, return the original canvas
}

function createChart(ctx, dataPoints, unit) {
  ctx = clearChart(ctx);

  charts[ctx.id] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dataPoints.map((point) => point.label),
      datasets: [
        {
          data: dataPoints.map((point) => point.value),
          backgroundColor: ctx.id.includes("ram")
            ? "rgba(255, 99, 132, 0.6)"
            : "rgba(54, 162, 235, 0.6)"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(tooltipItem) {
              return tooltipItem.raw + " " + unit;
            }
          }
        }
      }
    }
  });
}

function createLineChart(ctx, dataPoints, unit) {
  ctx = clearChart(ctx);
  const dates = dataPoints.map((point) => new Date(point.date));

  charts[ctx.id] = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates.map((date) =>
        date.toLocaleDateString("en-US", { day: "numeric", month: "short" })
      ),
      datasets: [
        {
          data: dataPoints.map((point) => point.value),
          borderColor: ctx.id.includes("ram")
            ? "rgba(255, 99, 132, 1)"
            : "rgba(54, 162, 235, 1)",
          backgroundColor: ctx.id.includes("ram")
            ? "rgba(255, 99, 132, 0.2)"
            : "rgba(54, 162, 235, 0.2)",
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "category",
          ticks: { autoSkip: true, maxTicksLimit: 10 }
        },
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(tooltipItem) {
              return tooltipItem.raw + " " + unit;
            }
          }
        }
      }
    }
  });
}

function createTwoLineChart(ctx, dataRows, unit) {
  ctx = clearChart(ctx);

  // For the x-axis labels, we'll convert the date string into something readable
  const labels = dataRows.map(row => {
    const d = new Date(row.date);
    // e.g. "26 Mar"
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  });

  // Prepare the two data arrays:
  // 1) Engine Creation p50
  // 2) Inference p50
  const engineCreationData = dataRows.map(row => row.engine_creation_p50);
  const inferenceData = dataRows.map(row => row.inference_p50);

  charts[ctx.id] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Engine Creation p50 (ms)",
          data: engineCreationData,
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          fill: true,
          tension: 0.3
        },
        {
          label: "Inference p50 (ms)",
          data: inferenceData,
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.2)",
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "category",
          ticks: {
            autoSkip: true,
            maxTicksLimit: 10
          }
        },
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          display: true // Show which line is which
        },
        tooltip: {
          callbacks: {
            // Show e.g. "1.17 ms" in the tooltip
            label: function(tooltipItem) {
              return tooltipItem.raw + " " + unit;
            }
          }
        }
      }
    }
  });
}

async function loadPlatformData(platform) {
  document.getElementById("platformDescription").innerText =
    platformDescriptions[platform];
  document
    .querySelectorAll(".nav-buttons button")
    .forEach((button) => button.classList.remove("active"));
  console.log(platform);

  document.getElementById(platform).classList.add("active");
  const dataUrl =
    "https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/ml-data.json";

  await createCharts(dataUrl, platformMapping[platform]);
}

var data = null;
var engineData = null;

function indexData(data) {
  const index = {};

  data.forEach((entry) => {
    const suiteKey = entry.suite.toLowerCase();
    const testKey = entry.test.toLowerCase();
    const platformKey = entry.platform.toLowerCase();

    if (!index[suiteKey]) index[suiteKey] = {};
    if (!index[suiteKey][testKey]) index[suiteKey][testKey] = {};
    if (!index[suiteKey][testKey][platformKey])
      index[suiteKey][testKey][platformKey] = [];

    index[suiteKey][testKey][platformKey].push({
      date: new Date(entry.date),
      value: entry.value
    });
  });

  // Ensure dates are sorted
  Object.values(index).forEach((suite) =>
    Object.values(suite).forEach((test) =>
      Object.values(test).forEach((platformData) =>
        platformData.sort((a, b) => a.date - b.date)
      )
    )
  );

  return index;
}

function mergeLatencies(first, second) {
  return first.map((runItem, index) => ({
    ...runItem,
    value: runItem.value + (second[index]?.value || 0)
  }));
}

function createSmartTabTopic(platform) {
  var peakMem = getValues(
    "smart tab grouping",
    "topic-peak-memory-usage",
    platform
  );

  var initLatency = getValues(
    "smart tab grouping",
    "topic-cold-start-initialization-latency",
    platform
  );

  var runLatency = getValues(
    "smart tab grouping",
    "topic-model-run-latency",
    platform
  );

  // Example usage
  var mergedLatency = mergeLatencies(initLatency, runLatency);

  createLineChart(
    document.getElementById("smartTabTopicChart"),
    mergedLatency,
    "ms"
  );

  createLineChart(
    document.getElementById("ramSmartTabTopicChart"),
    peakMem,
    "MiB"
  );
}

function createSmartTabSuggest(platform) {
  var peakMem = getValues(
    "smart tab grouping",
    "embedding-peak-memory-usage",
    platform
  );

  var initLatency = getValues(
    "smart tab grouping",
    "embedding-cold-start-initialization-latency",
    platform
  );

  var runLatency = getValues(
    "smart tab grouping",
    "embedding-model-run-latency",
    platform
  );

  // Example usage
  var mergedLatency = mergeLatencies(initLatency, runLatency);

  createLineChart(
    document.getElementById("smartTabSuggestChart"),
    mergedLatency,
    "ms"
  );

  createLineChart(
    document.getElementById("ramSmartTabSuggestChart"),
    peakMem,
    "MiB"
  );
}

async function createCharts(dataUrl, platform) {
  if (!data) {
    try {
      const response = await fetch(dataUrl);
      data = await response.json();
      data = data.query_result.data.rows;
      fixupMLNaming();
      data = indexData(data);
    } catch (error) {
      console.error("Error fetching or processing data:", error);
    }
  }
  refreshAllCharts(platform);
}

function refreshAllCharts(platform) {
  createSmartTabSuggest(platform);
  createSmartTabTopic(platform);
  /*
  createChart(
    document.getElementById("autofillChart"),
    getValues("autofill", "form-fill-time", platform),
    "ms"
  );

  createChart(
    document.getElementById("smartTabSuggestChart"),
    getValues("smart tab grouping", "topic-suggestion-time", platform),
    "ms"
  );

  createChart(
    document.getElementById("linkPreviewChart"),
    getValues("link preview", "preview-generation-time", platform),
    "tokens/s"
  );

  createChart(
    document.getElementById("ramAutofillChart"),
    getValues("autofill", "residual-memory-usage", platform),
    "MiB"
  );

  createChart(
    document.getElementById("ramSmartTabSuggestChart"),
    getValues("smart tab grouping", "topic-residual-memory-usage", platform),
    "MiB"
  );

  createChart(
    document.getElementById("ramLinkPreviewChart"),
    getValues("link preview", "residual-memory-usage", platform),
    "MiB"
  );

  createChart(
    document.getElementById("memoryPressure"),
    getValues("system", "memory-pressure", platform),
    "MiB"
  );
  */
}

function fixupMLNaming() {
  data.forEach((row) => {
    row.test = row.test.replace("total-memory-usage", "residual-memory-usage");
    // Rename the suite to something more readable.
    if (row.suite === "browser_ml_engine_perf.js") {
      row.suite = "Basic ML Perf";
    }

    // Extract the prefix from each test name and use that as the suite.
    if (row.suite === "browser_ml_engine_multi_perf.js") {
      const fields = row.test.split("-");
      const prefix = fields.shift();
      const test = fields.join("-");

      // We use browser_ml_suggest_feature_perf.js for suggest feature
      // so skipping the intent and suggest models here
      if (prefix.includes("intent") || prefix.includes("suggest")) {
        return;
      }
      row.test = test;
    }

    if (row.suite === "browser_ml_suggest_feature_perf.js") {
      const fields = row.test.split("-");
      const prefix = fields.shift();
      const test = fields.join("-");

      if (prefix.includes("INTENT") && !test.includes("model-run-latency")) {
        row.suite = "Suggest";
      } else if (prefix.includes("SUGGEST")) {
        row.suite = "Suggest";
      } else {
        return;
      }
      row.test = test;
    }

    if (row.suite === "browser_ml_autofill_perf.js") {
      row.suite = "Autofill";
      row.test = row.test.replace("AUTOFILL-", "");
    }

    if (row.suite === "browser_ml_summarizer_perf.js") {
      row.suite = "Summarizer";
      row.test = row.test
        .replace("SUM-", "")
        .replace("ONNX-COMMUNITY-", "")
        .replace("XENOVA-", "");
    }
    if (row.suite === "browser_ml_smart_tab_perf.js") {
      row.suite = "Smart Tab Grouping";
      row.test = row.test
        .replace("SMART-TAB-TOPIC-", "Topic-")
        .replace("SMART-TAB-EMBEDDING-", "Embedding-");
    }
  });
}

function getValues(suite, test, platform) {
  return (
    data[suite.toLowerCase()]?.[test.toLowerCase()]?.[platform.toLowerCase()] ||
    []
  );
}


function getEngineIdData(engineId) {
  return engineData.filter(e => e.engine_id === engineId).sort(e => e.date);
}

function createEngineStats(engineId, engineData) {
  let totalEngineSuccess = 0;
  let totalEngineFailure = 0;
  let totalInferenceSuccess = 0;
  let totalInferenceFailure = 0;

  engineData.forEach(entry => {
    totalEngineSuccess += (entry.engine_creation_success_count || 0);
    totalEngineFailure += (entry.engine_creation_failure_count || 0);
    totalInferenceSuccess += (entry.inference_success_count || 0);
    totalInferenceFailure += (entry.inference_failure_count || 0);
  });

  // 2) Populate the grid with totals
  document.getElementById(`${engineId}-engineSuccessCount`).textContent = totalEngineSuccess;
  document.getElementById(`${engineId}-engineFailureCount`).textContent = totalEngineFailure;
  document.getElementById(`${engineId}-inferenceSuccessCount`).textContent = totalInferenceSuccess;
  document.getElementById(`${engineId}-inferenceFailureCount`).textContent = totalInferenceFailure;
}

function createEngineRow(engineId) {
  const engineData = getEngineIdData(engineId);
  const featureContainer = document.getElementById("gridContainer");
  const htmlBlock = `
    <div class="feature-group-${engineId}">
          <div class="feature-title">${engineId}</div>
          <div class="chart-container">
              <!-- Chart Section -->
              <div class="chart-wrapper">
                  <canvas id="${engineId}-chart"></canvas>
              </div>
              <!-- Stats Section -->
              <div class="stats-section">
                  <!-- Engine Creation Stats Card -->
                  <div class="stats-card">
                      <div class="stats-title">Engine Creation Stats</div>
                      <div class="stats-grid">
                          <!-- Row 1: Labels -->
                          <div>Success Count</div>
                          <div>Failure Count</div>
                          <!-- Row 2: Values -->
                          <div id="${engineId}-engineSuccessCount"></div>
                          <div id="${engineId}-engineFailureCount"></div>
                      </div>
                  </div>
  
                  <!-- Inference Stats Card -->
                  <div class="stats-card">
                      <div class="stats-title">Inference Stats</div>
                      <div class="stats-grid">
                          <!-- Row 1: Labels -->
                          <div>Success Count</div>
                          <div>Failure Count</div>
                          <!-- Row 2: Values -->
                          <div id="${engineId}-inferenceSuccessCount"></div>
                          <div id="${engineId}-inferenceFailureCount"></div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    `
  featureContainer.insertAdjacentHTML("beforeend", htmlBlock);
  createTwoLineChart(
      document.getElementById(`${engineId}-chart`),
      engineData,
      "ms"
  );
  createEngineStats(engineId, engineData);
}

function createFeatureSelect(engineIds) {
  const selectContainer = document.getElementById("featureSelect");

  const htmlBlockAll = `
    <option value="all" selected>All</option>
  `
  selectContainer.insertAdjacentHTML("beforeend", htmlBlockAll);

  for (let engineId of engineIds) {
    const htmlBlock = `
        <option value="feature-group-${engineId}">${engineId}</option>
    `;
    selectContainer.insertAdjacentHTML("beforeend", htmlBlock);
  }
}

function renderEngineData(engineData) {
  const engineIds = [...new Set(engineData.map(e => e.engine_id))].sort();
  createFeatureSelect(engineIds);
  for (let engineId of engineIds) {
    createEngineRow(engineId);
  }
}

async function loadEngineData() {
  const dataUrl =
      "https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/ml-engine-data.json";

  if (!engineData) {
    try {
      const response = await fetch(dataUrl);
      engineData = await response.json();
      engineData = engineData.query_result.data.rows;
      renderEngineData(engineData);
    } catch (error) {
      console.error("Error fetching or processing data:", error);
    }
  }
}
