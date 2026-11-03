const DASHBOARD_API = {
  customers: "/api/customers?limit=1000",
  services: "/api/oil-services",
  partsUsage: "/api/parts-usage",
  enquiries: "/api/enquiries"
};

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

if (menuToggle && sidebar && sidebarOverlay) {
  menuToggle.addEventListener("click", function () {
    sidebar.classList.toggle("show");
    sidebarOverlay.classList.toggle("show");
  });

  sidebarOverlay.addEventListener("click", function () {
    sidebar.classList.remove("show");
    sidebarOverlay.classList.remove("show");
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayIsoDate() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

async function fetchJson(url) {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

function getRecordId(record) {
  return String(record._id || record.id || "");
}

function groupLatestVehicleRecords(records) {
  const map = new Map();
  const sortedRecords = [...records].sort((a, b) =>
    `${b.serviceDate || ""}${getRecordId(b)}`.localeCompare(`${a.serviceDate || ""}${getRecordId(a)}`)
  );

  sortedRecords.forEach((record) => {
    const key = String(record.vehiclePlateNumber || "").trim().toUpperCase();
    if (key && !map.has(key)) {
      map.set(key, record);
    }
  });

  return Array.from(map.values());
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  if (!value) return "No date";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("overdue") || normalized.includes("pending")) return "critical";
  if (normalized.includes("ordered") || normalized.includes("sent") || normalized.includes("told")) return "progress";
  if (normalized.includes("completed") || normalized.includes("checked")) return "completed";
  return "scheduled";
}

function renderEmpty(container, message) {
  container.innerHTML = `<div class="empty-card">${escapeHtml(message)}</div>`;
}

function renderPartsUsageChecks(records) {
  const container = document.getElementById("partsUsageChecksList");
  if (!container) return;

  const pendingRecords = records
    .filter((record) => record.status === "Pending Check")
    .sort((a, b) => `${b.date || ""}${getRecordId(b)}`.localeCompare(`${a.date || ""}${getRecordId(a)}`))
    .slice(0, 5);

  if (pendingRecords.length === 0) {
    renderEmpty(container, "No pending parts usage checks.");
    return;
  }

  container.innerHTML = pendingRecords.map((record) => `
    <div class="alert-item">
      <div>
        <p class="item-title">${escapeHtml(record.partName)}</p>
        <p class="item-subtitle">${escapeHtml(record.partCode)} &bull; ${escapeHtml(formatDate(record.date))}</p>
      </div>
      <div class="text-end">
        <p class="stock-value stock-critical">${escapeHtml(formatNumber(record.qtyUsed))} used</p>
        <span class="status-badge status-critical">pending check</span>
      </div>
    </div>
  `).join("");
}

function renderRecentServiceActivities(records) {
  const container = document.getElementById("recentServiceActivitiesList");
  if (!container) return;

  const recentRecords = [...records]
    .sort((a, b) => `${b.serviceDate || ""}${getRecordId(b)}`.localeCompare(`${a.serviceDate || ""}${getRecordId(a)}`))
    .slice(0, 5);

  if (recentRecords.length === 0) {
    renderEmpty(container, "No service activities recorded yet.");
    return;
  }

  container.innerHTML = recentRecords.map((record) => `
    <div class="activity-item">
      <div class="flex-grow-1">
        <p class="item-title">${escapeHtml(record.customerName)}</p>
        <p class="item-subtitle">${escapeHtml(record.vehiclePlateNumber)} &bull; ${escapeHtml(record.oilServicePackage)}</p>
        <p class="item-time">${escapeHtml(formatDate(record.serviceDate))}</p>
      </div>
      <span class="status-pill ${statusClass(record.reminderStatus)}">${escapeHtml(record.reminderStatus || "Upcoming")}</span>
    </div>
  `).join("");
}

function renderEnquiryFollowUps(records) {
  const container = document.getElementById("enquiryFollowUpsList");
  if (!container) return;

  const activeRecords = records
    .filter((record) => record.status !== "Checked, Told")
    .sort((a, b) => `${a.followUpDate || ""}${getRecordId(a)}`.localeCompare(`${b.followUpDate || ""}${getRecordId(b)}`))
    .slice(0, 5);

  if (activeRecords.length === 0) {
    renderEmpty(container, "No pending enquiry follow-ups.");
    return;
  }

  container.innerHTML = activeRecords.map((record) => `
    <div class="activity-item compact-item">
      <div class="flex-grow-1">
        <p class="item-title">${escapeHtml(record.customerName)}</p>
        <p class="item-subtitle">${escapeHtml(record.itemsEnquired)}</p>
        <p class="item-time">Follow-up: ${escapeHtml(formatDate(record.followUpDate))}</p>
      </div>
      <span class="status-pill ${statusClass(record.status)}">${escapeHtml(record.status)}</span>
    </div>
  `).join("");
}

function countBy(records, getter) {
  return records.reduce((acc, record) => {
    const key = getter(record) || "Not recorded";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function renderBarChart(id, counts, emptyMessage) {
  const container = document.getElementById(id);
  if (!container) return;

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(...entries.map((entry) => entry[1]), 1);

  if (entries.length === 0) {
    renderEmpty(container, emptyMessage);
    return;
  }

  container.innerHTML = entries.map(([label, value]) => {
    const width = Math.max(6, Math.round((value / maxValue) * 100));

    return `
      <div class="chart-row">
        <div class="chart-row-header">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
        <div class="chart-track">
          <div class="chart-fill" style="width: ${width}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderDashboard(data) {
  const today = todayIsoDate();
  const latestServiceRecords = groupLatestVehicleRecords(data.services);
  const partsUsedToday = data.partsUsage
    .filter((record) => record.date === today)
    .reduce((total, record) => total + Number(record.qtyUsed || 0), 0);
  const upcomingReminders = latestServiceRecords
    .filter((record) => record.reminderStatus === "Upcoming").length;

  setText("totalCustomersValue", formatNumber(data.customers.length));
  setText("totalServicesValue", formatNumber(data.services.length));
  setText("partsUsedTodayValue", formatNumber(partsUsedToday));
  setText("upcomingRemindersValue", formatNumber(upcomingReminders));

  renderPartsUsageChecks(data.partsUsage);
  renderRecentServiceActivities(data.services);
  renderEnquiryFollowUps(data.enquiries);
  renderBarChart(
    "reminderStatusChart",
    countBy(latestServiceRecords, (record) => record.reminderStatus),
    "No reminder records available."
  );
  renderBarChart(
    "oilPackageChart",
    countBy(data.services, (record) => record.oilServicePackage),
    "No oil service package data available."
  );
}

async function initializeDashboard() {
  try {
    const [customers, services, partsUsage, enquiries] = await Promise.all([
      fetchJson(DASHBOARD_API.customers),
      fetchJson(DASHBOARD_API.services),
      fetchJson(DASHBOARD_API.partsUsage),
      fetchJson(DASHBOARD_API.enquiries)
    ]);

    renderDashboard({ customers, services, partsUsage, enquiries });
  } catch (err) {
    console.error(err);
    ["partsUsageChecksList", "recentServiceActivitiesList", "enquiryFollowUpsList", "reminderStatusChart", "oilPackageChart"]
      .forEach((id) => {
        const container = document.getElementById(id);
        if (container) renderEmpty(container, "Unable to load dashboard data.");
      });
  }
}

initializeDashboard();
