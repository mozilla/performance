// Populate sidebar
let sidebar = document.getElementById('main-sidebar');
if (sidebar !== null) {
  sidebar.innerHTML = `
  <div class="nano" id="leftside-navigation">
   <ul class="nano-content">
      <!-- Bugs menu -->
    <li class="sub-menu">
     <a href="/">
      <i class="fa-solid fa-bug"></i>
      <span>
       Performance Bugs
      </span>
     </a>
    </li>

      <!-- Speedometer menu -->
    <li class="sub-menu">
     <a href="javascript:void(0);">
      <i class="fa-solid fa-gauge-high"></i>
      <span>
       Speedometer
      </span>
      <i class="arrow fa-solid fa-angle-right pull-right">
      </i>
     </a>
     <ul>
      <li>
       <a href="speedometer.html">
        Details
       </a>
      </li>
      <li>
        <a href="https://treeherder.mozilla.org/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1&highlightCommonAlerts=0&replicates=0&series=autoland,185987,1,13&series=autoland,4588356,1,13&series=autoland,83179,1,13&series=autoland,4590694,1,13&series=autoland,5042134,1,13&timerange=7776000">
        Autoland
       </a>
      </li>
     </ul>
    </li>

      <!-- Android menu -->
    <li class="sub-menu">
     <a href="android.html">
      <i class="fa-brands fa-android"></i>
      <span>
        Android
      </span>
     </a>
    </li>

      <!-- Pageload menu -->
    <li class="sub-menu">
     <a href="pageload.html">
      <i class="fa-regular fa-window-maximize"></i>
      <span>
       Pageload
      </span>
     </a>
    </li>

      <!-- JS menu -->
    <li class="sub-menu">
     <a href="js.html">
      <i class="fa-brands fa-js">
      </i>
      <span>
       JS
      </span>
     </a>
    </li>

      <!-- Networking menu -->
    <li class="sub-menu">
     <a href="networking.html">
      <i class="fa-solid fa-bars-progress"></i>
      <span>
       Networking
      </span>
     </a>
    </li>

      <!-- Experiments menu -->
    <li class="sub-menu">
     <a href="https://protosaur.dev/perf-reports/">
      <i class="fa-solid fa-chart-line"></i>
      <span>
       Experiments
      </span>
     </a>
    </li>

      <!-- Documentation menu -->
    <li class="sub-menu">
     <a href="javascript:void(0);">
      <i class="fa-solid fa-book"></i>
      <span>
       Documentation
      </span>
      <i class="arrow fa fa-angle-right pull-right">
      </i>
     </a>
     <ul>
      <li>
       <a href="https://firefox-source-docs.mozilla.org/performance/reporting_a_performance_problem.html">
        Reporting a Performance Problem
       </a>
      </li>
      <li>
       <a href="https://firefox-source-docs.mozilla.org/testing/perfdocs/mach-try-perf.html">
        Running Performance Tests
       </a>
      </li>
      <li>
       <a href="https://profiler.firefox.com/">
        Firefox Profiler
       </a>
      </li>
      <li>
       <a href="https://wiki.mozilla.org/Performance/Triage">
        Performance Triage
       </a>
      </li>
     </ul>
    </li>

   </ul>
  </div>
  `;
}

// jQuery for sidebar interactions
$(document).ready(function() {
  // Handle submenu toggle
  $("#leftside-navigation .sub-menu > a").click(function(e) {
    e.stopPropagation();
    $("#leftside-navigation ul ul").slideUp();
    if (!$(this).next().is(":visible")) {
      $(this).next().slideDown();
    }
  });

  // Handle iframe source change
  $("#leftside-navigation a[data-url]").click(function(e) {
    e.preventDefault();
    var url = $(this).data("url");
    $("#content-iframe").attr("src", url);
  });
});

