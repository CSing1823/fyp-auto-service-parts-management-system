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

const API_BASE_URL = "/api/parts-usage";
const STORAGE_KEY = "partsUsageLogs";
const statusOptions = [
  "Pending Check",
  "Checked, Not Ordered",
  "Checked, Ordered"
];

const usageForm = document.getElementById("usageForm");
const usageTableBody = document.getElementById("usageTableBody");
const usageSearchInput = document.getElementById("usageSearchInput");
const usageModalElement = document.getElementById("usageModal");
const deleteUsageModalElement = document.getElementById("deleteUsageModal");
const deleteUsagePartName = document.getElementById("deleteUsagePartName");
const deleteUsagePartDetails = document.getElementById("deleteUsagePartDetails");
const deleteUsageMeta = document.getElementById("deleteUsageMeta");
const deleteUsageStatus = document.getElementById("deleteUsageStatus");
const deleteUsageError = document.getElementById("deleteUsageError");
const confirmDeleteUsageButton = document.getElementById("confirmDeleteUsage");
const usageModalTitle = document.getElementById("usageModalTitle");
const usageSubmitBtn = document.getElementById("usageSubmitBtn");
const addUsageBtn = document.querySelector(".add-btn");
const filterButtons = document.querySelectorAll(".filter-btn");

const usageRecordIdInput = document.getElementById("usageRecordId");
const usageDateInput = document.getElementById("usageDate");
const partCodeInput = document.getElementById("partCode");
const partNameInput = document.getElementById("partName");
const qtyUsedInput = document.getElementById("qtyUsed");
const usageStatusCombobox = document.getElementById("usageStatusCombobox");
const usageStatusInput = document.getElementById("usageStatus");
const usageStatusOptions = document.getElementById("usageStatusOptions");
const usageStatusToggle = document.getElementById("usageStatusToggle");

let usageLogs = [];
let activeStatusFilter = "All";
let pendingDeleteUsageId = "";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const sampleUsageLogs = [
  {
    id: "sample-1",
    date: "2026-04-23",
    partCode: "EO-5W30",
    partName: "Engine Oil 5W-30",
    qtyUsed: 5,
    status: "Pending Check"
  },
  {
    id: "sample-2",
    date: "2026-04-23",
    partCode: "BP-FRONT",
    partName: "Brake Pads (Front)",
    qtyUsed: 2,
    status: "Checked, Not Ordered"
  },
  {
    id: "sample-3",
    date: "2026-04-22",
    partCode: "AF-001",
    partName: "Air Filter",
    qtyUsed: 3,
    status: "Checked, Ordered"
  }
];

function normalizeLog(log) {
  return {
    id: log._id || log.id,
    date: log.date,
    partCode: log.partCode,
    partName: log.partName,
    qtyUsed: Number(log.qtyUsed),
    status: log.status
  };
}

function getStoredLogs() {
  const storedLogs = localStorage.getItem(STORAGE_KEY);

  if (!storedLogs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleUsageLogs));
    return sampleUsageLogs;
  }

  try {
    return JSON.parse(storedLogs).map(normalizeLog);
  } catch (err) {
    console.error(err);
    return sampleUsageLogs;
  }
}

function saveStoredLogs(logs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

function createLocalId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `usage-${Date.now()}`;
}

async function loadUsageLogs() {
  try {
    const res = await apiFetch(API_BASE_URL);
    if (!res.ok) throw new Error("Unable to load usage logs from API");

    const data = await res.json();
    usageLogs = data.map(normalizeLog);
    saveStoredLogs(usageLogs);
  } catch (err) {
    usageLogs = getStoredLogs();
  }

  renderUsageLogs();
}

function getVisibleLogs() {
  const keyword = usageSearchInput.value.trim().toLowerCase();

  return usageLogs.filter((log) => {
    const matchesStatus = activeStatusFilter === "All" || log.status === activeStatusFilter;
    const matchesSearch = [log.date, log.partCode, log.partName, log.status]
      .join(" ")
      .toLowerCase()
      .includes(keyword);

    return matchesStatus && matchesSearch;
  });
}

function getStatusClass(status) {
  if (status === "Checked, Ordered") return "ordered";
  if (status === "Checked, Not Ordered") return "not-ordered";
  return "pending";
}

function renderUsageStatusOptions() {
  usageStatusOptions.innerHTML = statusOptions
    .map((status) => `
      <button type="button" class="usage-status-option ${getStatusClass(status)}${status === usageStatusInput.value ? " active" : ""}" data-status="${escapeHtml(status)}" role="option">
        ${escapeHtml(status)}
      </button>
    `)
    .join("");
}

function openUsageStatusOptions() {
  renderUsageStatusOptions();
  usageStatusOptions.classList.remove("d-none");
  usageStatusInput.setAttribute("aria-expanded", "true");
}

function closeUsageStatusOptions() {
  usageStatusOptions.classList.add("d-none");
  usageStatusInput.setAttribute("aria-expanded", "false");
}

function selectUsageStatus(status) {
  usageStatusInput.value = status;
  closeUsageStatusOptions();
}

function createUsageRowHtml(log) {
  return `
    <tr>
      <td>${escapeHtml(log.date)}</td>
      <td>${escapeHtml(log.partCode)}</td>
      <td>${escapeHtml(log.partName)}</td>
      <td>${escapeHtml(log.qtyUsed)}</td>
      <td>
        <select class="row-status-select ${getStatusClass(log.status)}" data-id="${escapeHtml(log.id)}" aria-label="Update status for ${escapeHtml(log.partName)}">
          ${statusOptions.map((status) => `
            <option value="${escapeHtml(status)}"${status === log.status ? " selected" : ""}>
              ${escapeHtml(status)}
            </option>
          `).join("")}
        </select>
      </td>
      <td class="text-center">
        <button class="btn btn-sm action-btn edit" data-id="${escapeHtml(log.id)}" title="Edit">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm action-btn delete" data-id="${escapeHtml(log.id)}" title="Delete">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
}

function renderUsageLogs() {
  const visibleLogs = getVisibleLogs();
  usageTableBody.innerHTML = "";

  if (visibleLogs.length === 0) {
    usageTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row py-4">No usage records found</td>
      </tr>
    `;
    return;
  }

  usageTableBody.innerHTML = visibleLogs.map(createUsageRowHtml).join("");
  bindActionButtons();
}

function resetUsageForm() {
  usageForm.reset();
  usageRecordIdInput.value = "";
  usageDateInput.value = new Date().toISOString().slice(0, 10);
  usageStatusInput.value = "Pending Check";
  usageModalTitle.textContent = "Record Parts Usage";
  usageSubmitBtn.textContent = "Record Usage";
}

function getFormData() {
  return {
    date: usageDateInput.value,
    partCode: partCodeInput.value.trim().toUpperCase(),
    partName: partNameInput.value.trim(),
    qtyUsed: Number(qtyUsedInput.value),
    status: usageStatusInput.value
  };
}

async function persistLog(log, method, id = "") {
  try {
    const url = id ? `${API_BASE_URL}/${id}` : API_BASE_URL;
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log)
    });

    if (!res.ok) throw new Error("API save failed");
    return normalizeLog(await res.json());
  } catch (err) {
    return null;
  }
}

async function deleteLogFromApi(id) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/${id}`, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    return false;
  }
}

confirmDeleteUsageButton.addEventListener("click", async function () {
  if (!pendingDeleteUsageId) return;

  const id = pendingDeleteUsageId;
  confirmDeleteUsageButton.disabled = true;
  confirmDeleteUsageButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Deleting';
  deleteUsageError.hidden = true;

  try {
    const deleted = await deleteLogFromApi(id);
    if (!deleted) throw new Error("The usage record could not be deleted. Please try again.");

    usageLogs = usageLogs.filter((log) => log.id !== id);
    saveStoredLogs(usageLogs);
    renderUsageLogs();
    bootstrap.Modal.getOrCreateInstance(deleteUsageModalElement).hide();
  } catch (err) {
    deleteUsageError.textContent = err.message || "The usage record could not be deleted. Please try again.";
    deleteUsageError.hidden = false;
  } finally {
    confirmDeleteUsageButton.disabled = false;
    confirmDeleteUsageButton.textContent = "Delete Record";
  }
});

deleteUsageModalElement.addEventListener("hidden.bs.modal", function () {
  pendingDeleteUsageId = "";
  deleteUsageError.hidden = true;
});

usageForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const formData = getFormData();
  const existingId = usageRecordIdInput.value;

  if (!formData.date || !formData.partCode || !formData.partName || formData.qtyUsed < 1) {
    alert("Please fill in all usage details correctly");
    return;
  }

  if (existingId) {
    const savedLog = await persistLog(formData, "PUT", existingId);
    usageLogs = usageLogs.map((log) => {
      if (log.id !== existingId) return log;
      return savedLog || { ...formData, id: existingId };
    });
  } else {
    const savedLog = await persistLog(formData, "POST");
    usageLogs.unshift(savedLog || { ...formData, id: createLocalId() });
  }

  saveStoredLogs(usageLogs);
  renderUsageLogs();

  const modal = bootstrap.Modal.getInstance(usageModalElement);
  if (modal) modal.hide();
  resetUsageForm();
});

function bindActionButtons() {
  document.querySelectorAll(".row-status-select").forEach((select) => {
    select.addEventListener("change", async function () {
      const id = this.dataset.id;
      const log = usageLogs.find((item) => item.id === id);
      if (!log) return;

      const updatedLog = { ...log, status: this.value };
      const savedLog = await persistLog(updatedLog, "PUT", id);

      usageLogs = usageLogs.map((item) => {
        if (item.id !== id) return item;
        return savedLog || updatedLog;
      });

      saveStoredLogs(usageLogs);
      renderUsageLogs();
    });
  });

  document.querySelectorAll(".action-btn.edit").forEach((btn) => {
    btn.addEventListener("click", function () {
      const log = usageLogs.find((item) => item.id === this.dataset.id);
      if (!log) return;

      usageRecordIdInput.value = log.id;
      usageDateInput.value = log.date;
      partCodeInput.value = log.partCode;
      partNameInput.value = log.partName;
      qtyUsedInput.value = log.qtyUsed;
      usageStatusInput.value = log.status;
      usageModalTitle.textContent = "Edit Parts Usage";
      usageSubmitBtn.textContent = "Update Usage";

      new bootstrap.Modal(usageModalElement).show();
    });
  });

  document.querySelectorAll(".action-btn.delete").forEach((btn) => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const log = usageLogs.find((item) => item.id === id);
      if (!log) return;

      pendingDeleteUsageId = id;
      deleteUsagePartName.textContent = log.partName || "Unnamed part";
      deleteUsagePartDetails.textContent = `${log.partCode || "No part code"} · Quantity used: ${log.qtyUsed ?? "—"}`;
      deleteUsageMeta.textContent = `Usage date: ${log.date || "—"}`;
      deleteUsageStatus.textContent = log.status || "Status not recorded";
      deleteUsageStatus.className = `usage-delete-status ${getStatusClass(log.status)}`;
      deleteUsageError.hidden = true;
      bootstrap.Modal.getOrCreateInstance(deleteUsageModalElement).show();
    });
  });

}

if (addUsageBtn) {
  addUsageBtn.addEventListener("click", resetUsageForm);
}

if (usageModalElement) {
  usageModalElement.addEventListener("hidden.bs.modal", resetUsageForm);
}

if (usageSearchInput) {
  usageSearchInput.addEventListener("input", renderUsageLogs);
}

usageStatusInput.addEventListener("focus", openUsageStatusOptions);
usageStatusInput.addEventListener("click", openUsageStatusOptions);

usageStatusToggle.addEventListener("click", function () {
  if (usageStatusOptions.classList.contains("d-none")) {
    openUsageStatusOptions();
    usageStatusInput.focus();
    return;
  }

  closeUsageStatusOptions();
});

usageStatusOptions.addEventListener("click", function (e) {
  const option = e.target.closest(".usage-status-option");
  if (!option) return;

  selectUsageStatus(option.dataset.status);
});

document.addEventListener("click", function (e) {
  if (!usageStatusCombobox.contains(e.target)) {
    closeUsageStatusOptions();
  }
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", function () {
    filterButtons.forEach((button) => button.classList.remove("active"));
    this.classList.add("active");
    activeStatusFilter = this.dataset.status;
    renderUsageLogs();
  });
});

resetUsageForm();
loadUsageLogs();
