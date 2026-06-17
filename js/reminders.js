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

const reminderSearchInput = document.getElementById("reminderSearchInput");
const reminderCardsContainer = document.getElementById("reminderCardsContainer");
const reminderSummaryGrid = document.getElementById("reminderSummaryGrid");
const reminderFilterButtons = document.querySelectorAll(".filter-btn");

let reminderRecords = [];
let activeReminderFilter = "All";

function createSummaryCard(label, value, icon, toneClass) {
  return `
    <div class="col-sm-6 col-xl-3">
      <div class="summary-card ${toneClass}">
        <div class="summary-icon">
          <i class="bi ${icon}"></i>
        </div>
        <div>
          <p class="summary-label">${escapeHtml(label)}</p>
          <h3 class="summary-value">${escapeHtml(value)}</h3>
        </div>
      </div>
    </div>
  `;
}

function renderReminderSummary(records) {
  const latestRecords = groupLatestVehicleRecords(records);
  const counts = {
    tracked: latestRecords.length,
    upcoming: latestRecords.filter((record) => record.reminderStatus === "Upcoming").length,
    reminderSent: latestRecords.filter((record) => record.reminderStatus === "Reminder Sent").length,
    overdue: latestRecords.filter((record) => record.reminderStatus === "Overdue").length
  };

  reminderSummaryGrid.innerHTML = [
    createSummaryCard("Tracked Vehicles", counts.tracked, "bi-car-front-fill", "neutral"),
    createSummaryCard("Upcoming", counts.upcoming, "bi-calendar-check-fill", "upcoming"),
    createSummaryCard("Reminder Sent", counts.reminderSent, "bi-chat-dots-fill", "warning"),
    createSummaryCard("Overdue", counts.overdue, "bi-exclamation-triangle-fill", "danger")
  ].join("");
}

function getVisibleReminderRecords() {
  const keyword = reminderSearchInput.value.trim().toLowerCase();
  const latestRecords = groupLatestVehicleRecords(reminderRecords);

  return latestRecords.filter((record) => {
    const matchesStatus = activeReminderFilter === "All" || record.reminderStatus === activeReminderFilter;
    const matchesSearch = [
      record.customerName,
      record.vehiclePlateNumber,
      record.vehicleModel,
      record.oilServicePackage,
      record.reminderStatus
    ].join(" ").toLowerCase().includes(keyword);

    return matchesStatus && matchesSearch;
  });
}

function createReminderCardHtml(record) {
  return `
    <div class="col-lg-6">
      <div class="reminder-card">
        <div class="reminder-header">
          <div>
            <h4 class="mb-1">${escapeHtml(record.customerName)}</h4>
            <div class="meta-line">
              <span class="plate-badge">${escapeHtml(record.vehiclePlateNumber)}</span>
              <span class="model-label">${escapeHtml(record.vehicleModel)}</span>
            </div>
          </div>
          <span class="status-pill ${getOilServiceStatusClass(record.reminderStatus)}">
            ${escapeHtml(record.reminderStatus)}
          </span>
        </div>

        <div class="service-box">
          <div class="service-box-header">
            <div>
              <p class="label-text">Oil Service Package</p>
              <p class="value-text">${escapeHtml(record.oilServicePackage)}</p>
            </div>
          </div>

          <div class="detail-grid">
            <div class="detail-cell">
              <p class="label-text">Current Mileage</p>
              <p class="value-text">${escapeHtml(formatReminderMileage(record.currentMileage))}</p>
            </div>
            <div class="detail-cell">
              <p class="label-text">Last Oil Change</p>
              <p class="value-text">${escapeHtml(record.serviceDate)}</p>
            </div>
            <div class="detail-cell">
              <p class="label-text">Next Oil Change Due</p>
              <p class="value-text">${escapeHtml(record.nextOilServiceDueDate)}</p>
            </div>
            <div class="detail-cell">
              <p class="label-text">Reminder Date</p>
              <p class="value-text">${escapeHtml(record.reminderDate)}</p>
            </div>
          </div>
        </div>

        <div class="contact-list">
          <div class="contact-row">
            <i class="bi bi-droplet-half"></i>
            <span>Oil Type: ${escapeHtml(record.engineOilType || "Not recorded")}</span>
          </div>
          <div class="contact-row">
            <i class="bi bi-tools"></i>
            <span>Parts Used: ${escapeHtml(record.partsUsed || "Not recorded")}</span>
          </div>
          <div class="contact-row">
            <i class="bi bi-calendar2-check"></i>
            <span>Recommended action window starts on ${escapeHtml(record.reminderDate)}</span>
          </div>
          ${record.smsReminderSentAt ? `
            <div class="contact-row">
              <i class="bi bi-chat-dots-fill"></i>
              <span>SMS reminder sent on ${escapeHtml(formatReminderDateTime(record.smsReminderSentAt))}</span>
            </div>
          ` : ""}
          ${record.smsReminderLastError && record.reminderStatus !== "Reminder Sent" ? `
            <div class="contact-row">
              <i class="bi bi-exclamation-circle-fill"></i>
              <span>SMS reminder pending: ${escapeHtml(record.smsReminderLastError)}</span>
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

function formatReminderMileage(value) {
  return `${Number(value || 0).toLocaleString()} km`;
}

function formatReminderDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function renderReminderCards() {
  const visibleRecords = getVisibleReminderRecords();
  renderReminderSummary(reminderRecords);

  if (visibleRecords.length === 0) {
    reminderCardsContainer.innerHTML = `
      <div class="col-12">
        <div class="empty-state">
          No reminder records match the current search or status filter.
        </div>
      </div>
    `;
    return;
  }

  reminderCardsContainer.innerHTML = visibleRecords.map(createReminderCardHtml).join("");
}

if (reminderSearchInput) {
  reminderSearchInput.addEventListener("input", renderReminderCards);
}

reminderFilterButtons.forEach((btn) => {
  btn.addEventListener("click", function () {
    reminderFilterButtons.forEach((button) => button.classList.remove("active"));
    this.classList.add("active");
    activeReminderFilter = this.dataset.status;
    renderReminderCards();
  });
});

async function initializeRemindersPage() {
  await processDueSmsReminders();
  reminderRecords = await loadOilServiceRecords();
  renderReminderCards();
}

initializeRemindersPage();
