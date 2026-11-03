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

const serviceRecordForm = document.getElementById("serviceRecordForm");
const serviceRecordModalElement = document.getElementById("serviceRecordModal");
const vehicleHistoryModalElement = document.getElementById("vehicleHistoryModal");
const deleteServiceRecordModalElement = document.getElementById("deleteServiceRecordModal");
const deleteServiceRecordCustomer = document.getElementById("deleteServiceRecordCustomer");
const deleteServiceRecordVehicle = document.getElementById("deleteServiceRecordVehicle");
const deleteServiceRecordDetails = document.getElementById("deleteServiceRecordDetails");
const deleteServiceRecordError = document.getElementById("deleteServiceRecordError");
const confirmDeleteServiceRecordButton = document.getElementById("confirmDeleteServiceRecordBtn");
const vehicleSearchInput = document.getElementById("vehicleSearchInput");
const vehicleCardsContainer = document.getElementById("vehicleCardsContainer");
const trackedVehiclesCount = document.getElementById("trackedVehiclesCount");
const dueVehiclesCount = document.getElementById("dueVehiclesCount");
const serviceModalTitle = document.getElementById("serviceModalTitle");
const serviceSubmitBtn = document.getElementById("serviceSubmitBtn");
const historyVehicleTitle = document.getElementById("historyVehicleTitle");
const historyVehicleSubtitle = document.getElementById("historyVehicleSubtitle");
const historySummaryGrid = document.getElementById("historySummaryGrid");
const vehicleHistoryList = document.getElementById("vehicleHistoryList");
const addServiceBtn = document.querySelector(".add-btn");

const serviceRecordIdInput = document.getElementById("serviceRecordId");
const serviceDateInput = document.getElementById("serviceDate");
const customerNameInput = document.getElementById("customerName");
const customerNameCombobox = document.getElementById("customerNameCombobox");
const customerNameOptions = document.getElementById("customerNameOptions");
const customerNameToggle = document.getElementById("customerNameToggle");
const vehiclePlateNumberInput = document.getElementById("vehiclePlateNumber");
const vehiclePlateNumberCombobox = document.getElementById("vehiclePlateNumberCombobox");
const vehiclePlateNumberOptions = document.getElementById("vehiclePlateNumberOptions");
const vehiclePlateNumberToggle = document.getElementById("vehiclePlateNumberToggle");
const vehicleModelInput = document.getElementById("vehicleModel");
const currentMileageInput = document.getElementById("currentMileage");
const oilServicePackageCombobox = document.getElementById("oilServicePackageCombobox");
const oilServicePackageInput = document.getElementById("oilServicePackage");
const oilServicePackageOptions = document.getElementById("oilServicePackageOptions");
const oilServicePackageToggle = document.getElementById("oilServicePackageToggle");
const engineOilTypeInput = document.getElementById("engineOilType");
const partsUsedInput = document.getElementById("partsUsed");
const nextOilServiceDueDateInput = document.getElementById("nextOilServiceDueDate");
const reminderDateInput = document.getElementById("reminderDate");
const reminderStatusInput = document.getElementById("reminderStatus");
const phoneNumberInput = document.getElementById("phoneNumber");
const vehicleBrandInput = document.getElementById("vehicleBrand");

const CUSTOMER_API_URL = "/api/customers";
let oilServiceRecords = [];
let customers = [];
let pendingDeleteServiceRecordId = "";
const oilServicePackageNames = Object.keys(OIL_SERVICE_PACKAGES);

function formatMileage(value) {
  return `${Number(value || 0).toLocaleString()} km`;
}

function getCustomerName(customer) {
  return String(customer.customerName || customer.name || "").trim();
}

function getCustomerPhone(customer) {
  return String(customer.phoneNumber || customer.phone || "").trim();
}

function getCustomerBrand(customer) {
  return String(customer.vehicleBrand || "").trim();
}

function getCustomerModel(customer) {
  const brand = getCustomerBrand(customer);
  const model = String(customer.vehicleModel || customer.vehicle || "").trim();

  if (brand && model.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
    return model.slice(brand.length).trim();
  }

  return model;
}

function getCustomerPlate(customer) {
  return String(customer.carPlateNumber || customer.carPlate || "").trim().toUpperCase();
}

function getVehicleDisplayName(record) {
  return [record.vehicleBrand, record.vehicleModel].filter(Boolean).join(" ") || record.vehicleModel;
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function getEditDistance(a, b) {
  const first = normalizeSearchText(a);
  const second = normalizeSearchText(b);
  const distances = Array.from({ length: first.length + 1 }, (_, index) => [index]);

  for (let j = 1; j <= second.length; j++) {
    distances[0][j] = j;
  }

  for (let i = 1; i <= first.length; i++) {
    for (let j = 1; j <= second.length; j++) {
      const substitutionCost = first[i - 1] === second[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + substitutionCost
      );
    }
  }

  return distances[first.length][second.length];
}

function customerNameMatchesSearch(name, keyword) {
  const normalizedName = normalizeSearchText(name);
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) return true;
  if (normalizedName.includes(normalizedKeyword)) return true;

  return normalizedName
    .split(/\s+/)
    .some((namePart) =>
      namePart.startsWith(normalizedKeyword) ||
      getEditDistance(namePart.slice(0, normalizedKeyword.length), normalizedKeyword) <= 1
    );
}

async function loadCustomersForVehicleForm() {
  try {
    const res = await apiFetch(`${CUSTOMER_API_URL}?limit=500`);
    if (!res.ok) throw new Error("Unable to load customers");
    customers = await res.json();
  } catch (err) {
    console.error(err);
    customers = [];
  }
}

function renderCustomerNameOptions(selectedName = "") {
  const names = Array.from(new Set(customers.map(getCustomerName).filter(Boolean))).sort();
  const keyword = normalizeSearchText(selectedName);
  const filteredNames = keyword
    ? names.filter((name) => customerNameMatchesSearch(name, keyword))
    : names;

  if (filteredNames.length === 0) {
    customerNameOptions.innerHTML = `<div class="customer-option-empty">No customer found</div>`;
  } else {
    customerNameOptions.innerHTML = filteredNames
      .map((name) => `
        <button type="button" class="customer-option${name === customerNameInput.value ? " active" : ""}" data-customer-name="${escapeHtml(name)}" role="option">
          ${escapeHtml(name)}
        </button>
      `)
      .join("");
  }

  customerNameInput.value = selectedName;
}

function openCustomerNameOptions() {
  renderCustomerNameOptions(customerNameInput.value);
  customerNameOptions.classList.remove("d-none");
  customerNameInput.setAttribute("aria-expanded", "true");
}

function closeCustomerNameOptions() {
  customerNameOptions.classList.add("d-none");
  customerNameInput.setAttribute("aria-expanded", "false");
}

function selectCustomerName(name) {
  customerNameInput.value = name;
  renderCarPlateOptions(name);
  clearCustomerVehicleFields();
  closeCustomerNameOptions();
}

function renderOilServicePackageOptions() {
  oilServicePackageOptions.innerHTML = oilServicePackageNames
    .map((packageName) => `
      <button type="button" class="package-option${packageName === oilServicePackageInput.value ? " active" : ""}" data-package-name="${escapeHtml(packageName)}" role="option">
        ${escapeHtml(packageName)}
      </button>
    `)
    .join("");
}

function openOilServicePackageOptions() {
  renderOilServicePackageOptions();
  oilServicePackageOptions.classList.remove("d-none");
  oilServicePackageInput.setAttribute("aria-expanded", "true");
}

function closeOilServicePackageOptions() {
  oilServicePackageOptions.classList.add("d-none");
  oilServicePackageInput.setAttribute("aria-expanded", "false");
}

function selectOilServicePackage(packageName) {
  oilServicePackageInput.value = packageName;
  closeOilServicePackageOptions();
  updateCalculatedFields();
}

function renderCarPlateOptions(customerName = customerNameInput.value, selectedPlate = "") {
  const customerVehicles = customers.filter((customer) => getCustomerName(customer) === customerName);
  const plates = customerVehicles.map(getCustomerPlate).filter(Boolean);
  const selectedExists = selectedPlate && plates.includes(selectedPlate);
  const optionPlates = !selectedExists && selectedPlate ? [selectedPlate, ...plates] : plates;

  if (optionPlates.length === 0) {
    vehiclePlateNumberOptions.innerHTML = `<div class="car-plate-option-empty">Select a customer first</div>`;
  } else {
    vehiclePlateNumberOptions.innerHTML = optionPlates
      .map((plate) => `
        <button type="button" class="car-plate-option${plate === selectedPlate ? " active" : ""}" data-plate="${escapeHtml(plate)}" role="option">
          ${escapeHtml(plate)}
        </button>
      `)
      .join("");
  }

  vehiclePlateNumberInput.value = selectedPlate;
}

function openCarPlateOptions() {
  renderCarPlateOptions(customerNameInput.value, vehiclePlateNumberInput.value);
  vehiclePlateNumberOptions.classList.remove("d-none");
  vehiclePlateNumberInput.setAttribute("aria-expanded", "true");
}

function closeCarPlateOptions() {
  vehiclePlateNumberOptions.classList.add("d-none");
  vehiclePlateNumberInput.setAttribute("aria-expanded", "false");
}

function selectCarPlate(plate) {
  vehiclePlateNumberInput.value = plate;
  closeCarPlateOptions();
  populateVehicleFieldsFromCustomer();
}

function getSelectedCustomerVehicle() {
  return customers.find((customer) =>
    getCustomerName(customer) === customerNameInput.value &&
    getCustomerPlate(customer) === vehiclePlateNumberInput.value
  );
}

function clearCustomerVehicleFields() {
  phoneNumberInput.value = "";
  vehicleBrandInput.value = "";
  vehicleModelInput.value = "";
}

function populateVehicleFieldsFromCustomer() {
  const selectedCustomer = getSelectedCustomerVehicle();

  if (!selectedCustomer) {
    clearCustomerVehicleFields();
    return;
  }

  phoneNumberInput.value = getCustomerPhone(selectedCustomer);
  vehicleBrandInput.value = getCustomerBrand(selectedCustomer);
  vehicleModelInput.value = getCustomerModel(selectedCustomer);
}

function setCustomerSelectionFromRecord(record) {
  renderCustomerNameOptions(record.customerName);
  renderCarPlateOptions(record.customerName, record.vehiclePlateNumber);

  phoneNumberInput.value = record.phoneNumber || "";
  vehicleBrandInput.value = record.vehicleBrand || "";
  vehicleModelInput.value = record.vehicleModel || "";

  const selectedCustomer = getSelectedCustomerVehicle();
  if (selectedCustomer) {
    phoneNumberInput.value = getCustomerPhone(selectedCustomer);
    vehicleBrandInput.value = getCustomerBrand(selectedCustomer);
    vehicleModelInput.value = getCustomerModel(selectedCustomer);
  }
}

function buildServiceRecordFromForm() {
  const computedDates = calculateOilServiceDates(
    serviceDateInput.value,
    oilServicePackageInput.value
  );

  return normalizeOilServiceRecord({
    id: serviceRecordIdInput.value || createLocalOilServiceId(),
    serviceDate: serviceDateInput.value,
    customerName: customerNameInput.value,
    phoneNumber: phoneNumberInput.value.trim(),
    vehiclePlateNumber: vehiclePlateNumberInput.value,
    vehicleBrand: vehicleBrandInput.value.trim(),
    vehicleModel: vehicleModelInput.value.trim(),
    currentMileage: Number(currentMileageInput.value),
    oilServicePackage: oilServicePackageInput.value,
    engineOilType: engineOilTypeInput.value.trim(),
    partsUsed: partsUsedInput.value.trim(),
    nextOilServiceDueDate: computedDates.nextOilServiceDueDate,
    reminderDate: computedDates.reminderDate
  });
}

function updateCalculatedFields() {
  const computedDates = calculateOilServiceDates(
    serviceDateInput.value,
    oilServicePackageInput.value
  );

  nextOilServiceDueDateInput.value = computedDates.nextOilServiceDueDate;
  reminderDateInput.value = computedDates.reminderDate;
  reminderStatusInput.value = getReminderStatus(
    computedDates.reminderDate,
    computedDates.nextOilServiceDueDate
  );
}

function resetServiceRecordForm() {
  serviceRecordForm.reset();
  serviceRecordIdInput.value = "";
  serviceDateInput.value = todayIsoDate();
  oilServicePackageInput.value = "5000km (3 months)";
  renderCustomerNameOptions();
  renderCarPlateOptions();
  clearCustomerVehicleFields();
  serviceModalTitle.textContent = "Add Service Record";
  serviceSubmitBtn.textContent = "Add Service Record";
  updateCalculatedFields();
}

function getVisibleVehicleCards() {
  const keyword = vehicleSearchInput.value.trim().toLowerCase();
  const latestRecords = groupLatestVehicleRecords(oilServiceRecords);

  return latestRecords.filter((record) =>
    [
      record.customerName,
      record.phoneNumber,
      record.vehiclePlateNumber,
      record.vehicleBrand,
      record.vehicleModel,
      record.oilServicePackage,
      record.reminderStatus
    ].join(" ").toLowerCase().includes(keyword)
  );
}

function createVehicleCardHtml(record) {
  return `
    <div class="col-md-6 col-xl-4">
      <div class="vehicle-card">
        <div class="vehicle-top">
          <div class="vehicle-icon-box">
            <i class="bi bi-car-front-fill"></i>
          </div>
          <span class="plate-badge">${escapeHtml(record.vehiclePlateNumber)}</span>
        </div>

        <h4 class="vehicle-title">${escapeHtml(getVehicleDisplayName(record))}</h4>
        <p class="vehicle-meta">${escapeHtml(record.customerName)}${record.phoneNumber ? ` &bull; ${escapeHtml(record.phoneNumber)}` : ""}</p>

        <div class="metric-grid">
          <div class="metric-box">
            <span class="metric-label">Current Mileage</span>
            <span class="metric-value">${escapeHtml(formatMileage(record.currentMileage))}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Oil Package</span>
            <span class="metric-value">${escapeHtml(record.oilServicePackage)}</span>
          </div>
        </div>

        <div class="service-info">
          <div class="service-row">
            <i class="bi bi-droplet-half"></i>
            <span>Last Oil Change: ${escapeHtml(record.serviceDate)}</span>
          </div>
          <div class="service-row">
            <i class="bi bi-calendar-event"></i>
            <span>Next Oil Change Due: ${escapeHtml(record.nextOilServiceDueDate)}</span>
          </div>
          <div class="service-row">
            <span class="status-pill ${getOilServiceStatusClass(record.reminderStatus)}">
              ${escapeHtml(record.reminderStatus)}
            </span>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn detail-btn flex-fill view-history-btn" data-plate="${escapeHtml(record.vehiclePlateNumber)}">
            View History
          </button>
          <button class="btn secondary-btn flex-fill quick-add-btn" data-plate="${escapeHtml(record.vehiclePlateNumber)}">
            Edit Service Record
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderVehicleCards() {
  const visibleCards = getVisibleVehicleCards();
  const latestRecords = groupLatestVehicleRecords(oilServiceRecords);
  const reminderSentRecords = latestRecords.filter((record) => record.reminderStatus === "Reminder Sent");

  trackedVehiclesCount.textContent = latestRecords.length;
  dueVehiclesCount.textContent = reminderSentRecords.length;

  if (visibleCards.length === 0) {
    vehicleCardsContainer.innerHTML = `
      <div class="col-12">
        <div class="empty-state">
          No vehicle service records found. Add a service record to start tracking oil change history and reminders.
        </div>
      </div>
    `;
    return;
  }

  vehicleCardsContainer.innerHTML = visibleCards.map(createVehicleCardHtml).join("");
  bindVehicleCardActions();
}

function renderVehicleHistory(plateNumber) {
  const history = getVehicleHistory(oilServiceRecords, plateNumber);
  const latestRecord = history[0];

  if (!latestRecord) return;

  historyVehicleTitle.textContent = getVehicleDisplayName(latestRecord);
  historyVehicleSubtitle.textContent = `${latestRecord.vehiclePlateNumber} - ${latestRecord.customerName}`;
  historySummaryGrid.innerHTML = `
    <div class="detail-box">
      <span class="detail-label">Phone Number</span>
      <span class="detail-value">${escapeHtml(latestRecord.phoneNumber || "Not recorded")}</span>
    </div>
    <div class="detail-box">
      <span class="detail-label">Vehicle Brand</span>
      <span class="detail-value">${escapeHtml(latestRecord.vehicleBrand || "Not recorded")}</span>
    </div>
    <div class="detail-box">
      <span class="detail-label">Current Mileage</span>
      <span class="detail-value">${escapeHtml(formatMileage(latestRecord.currentMileage))}</span>
    </div>
    <div class="detail-box">
      <span class="detail-label">Last Oil Change</span>
      <span class="detail-value">${escapeHtml(latestRecord.serviceDate)}</span>
    </div>
    <div class="detail-box">
      <span class="detail-label">Next Oil Change Due</span>
      <span class="detail-value">${escapeHtml(latestRecord.nextOilServiceDueDate)}</span>
    </div>
    <div class="detail-box">
      <span class="detail-label">Reminder Date</span>
      <span class="detail-value">${escapeHtml(latestRecord.reminderDate)}</span>
    </div>
    <div class="detail-box">
      <span class="detail-label">Reminder Status</span>
      <span class="status-pill ${getOilServiceStatusClass(latestRecord.reminderStatus)}">${escapeHtml(latestRecord.reminderStatus)}</span>
    </div>
  `;

  vehicleHistoryList.innerHTML = history.map((record) => `
    <div class="history-item">
      <div class="history-item-top">
        <div>
          <p class="history-title">${escapeHtml(record.oilServicePackage)}</p>
          <p class="history-subtitle">${escapeHtml(record.customerName)} - ${escapeHtml(record.vehiclePlateNumber)}</p>
        </div>
        <span class="history-date">${escapeHtml(record.serviceDate)}</span>
      </div>

      <div class="history-meta">
        <div class="history-meta-box">
          <span class="history-meta-label">Mileage</span>
          <span class="history-meta-value">${escapeHtml(formatMileage(record.currentMileage))}</span>
        </div>
        <div class="history-meta-box">
          <span class="history-meta-label">Next Due Date</span>
          <span class="history-meta-value">${escapeHtml(record.nextOilServiceDueDate)}</span>
        </div>
        <div class="history-meta-box">
          <span class="history-meta-label">Reminder Date</span>
          <span class="history-meta-value">${escapeHtml(record.reminderDate)}</span>
        </div>
      </div>

      <div class="history-note">
        <div>Phone Number: ${escapeHtml(record.phoneNumber || "Not recorded")}</div>
        <div>Vehicle Brand: ${escapeHtml(record.vehicleBrand || "Not recorded")}</div>
        <div>Engine Oil Type: ${escapeHtml(record.engineOilType || "Not recorded")}</div>
        <div>Parts Used: ${escapeHtml(record.partsUsed || "Not recorded")}</div>
      </div>

      <div class="history-actions">
        <button type="button" class="btn secondary-btn history-edit-btn" data-id="${escapeHtml(record.id)}">
          <i class="bi bi-pencil-square me-2" aria-hidden="true"></i>Edit Record
        </button>
        <button type="button" class="btn secondary-btn history-delete-btn" data-id="${escapeHtml(record.id)}">
          <i class="bi bi-trash3 me-2" aria-hidden="true"></i>Delete Record
        </button>
      </div>
    </div>
  `).join("");

  bindHistoryActions();
}

function bindVehicleCardActions() {
  document.querySelectorAll(".view-history-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      renderVehicleHistory(this.dataset.plate);
      new bootstrap.Modal(vehicleHistoryModalElement).show();
    });
  });

  document.querySelectorAll(".quick-add-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const latestRecord = groupLatestVehicleRecords(oilServiceRecords)
        .find((record) => record.vehiclePlateNumber === this.dataset.plate);

      resetServiceRecordForm();

      if (latestRecord) {
        serviceRecordIdInput.value = latestRecord.id;
        serviceDateInput.value = latestRecord.serviceDate;
        setCustomerSelectionFromRecord(latestRecord);
        currentMileageInput.value = latestRecord.currentMileage;
        oilServicePackageInput.value = latestRecord.oilServicePackage;
        engineOilTypeInput.value = latestRecord.engineOilType;
        partsUsedInput.value = latestRecord.partsUsed;
        updateCalculatedFields();
        serviceModalTitle.textContent = "Edit Service Record";
        serviceSubmitBtn.textContent = "Update Service Record";
      }

      new bootstrap.Modal(serviceRecordModalElement).show();
    });
  });
}

function bindHistoryActions() {
  document.querySelectorAll(".history-edit-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const record = oilServiceRecords.find((item) => item.id === this.dataset.id);
      if (!record) return;

      serviceRecordIdInput.value = record.id;
      serviceDateInput.value = record.serviceDate;
      setCustomerSelectionFromRecord(record);
      currentMileageInput.value = record.currentMileage;
      oilServicePackageInput.value = record.oilServicePackage;
      engineOilTypeInput.value = record.engineOilType;
      partsUsedInput.value = record.partsUsed;
      updateCalculatedFields();
      serviceModalTitle.textContent = "Edit Service Record";
      serviceSubmitBtn.textContent = "Update Service Record";

      const historyModal = bootstrap.Modal.getInstance(vehicleHistoryModalElement);
      if (historyModal) historyModal.hide();

      new bootstrap.Modal(serviceRecordModalElement).show();
    });
  });

  document.querySelectorAll(".history-delete-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const recordToDelete = oilServiceRecords.find((item) => item.id === id);
      if (!recordToDelete) return;

      pendingDeleteServiceRecordId = id;
      deleteServiceRecordCustomer.textContent = recordToDelete.customerName || "Customer not recorded";
      deleteServiceRecordVehicle.textContent = [
        recordToDelete.vehicleBrand,
        recordToDelete.vehicleModel,
        recordToDelete.vehiclePlateNumber
      ].filter(Boolean).join(" · ");
      deleteServiceRecordDetails.textContent = [
        recordToDelete.oilServicePackage,
        recordToDelete.serviceDate ? `Service date: ${recordToDelete.serviceDate}` : ""
      ].filter(Boolean).join(" · ");
      deleteServiceRecordError.textContent = "";
      deleteServiceRecordError.classList.add("d-none");
      bootstrap.Modal.getOrCreateInstance(deleteServiceRecordModalElement).show();
    });
  });
}

confirmDeleteServiceRecordButton.addEventListener("click", async function () {
  if (!pendingDeleteServiceRecordId) return;

  const recordToDelete = oilServiceRecords.find((item) => item.id === pendingDeleteServiceRecordId);
  if (!recordToDelete) return;

  confirmDeleteServiceRecordButton.disabled = true;
  confirmDeleteServiceRecordButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Deleting...';

  try {
    const deleted = await deleteOilServiceRecordFromApi(pendingDeleteServiceRecordId);
    if (!deleted) throw new Error("Unable to delete this service record. Please try again.");

    oilServiceRecords = oilServiceRecords.filter((record) => record.id !== pendingDeleteServiceRecordId);
    saveOilServiceRecordsToStorage(oilServiceRecords);
    renderVehicleCards();

    await new Promise((resolve) => {
      deleteServiceRecordModalElement.addEventListener("hidden.bs.modal", resolve, { once: true });
      bootstrap.Modal.getInstance(deleteServiceRecordModalElement).hide();
    });

    const remainingHistory = getVehicleHistory(oilServiceRecords, recordToDelete.vehiclePlateNumber);
    if (remainingHistory.length === 0) {
      const historyModal = bootstrap.Modal.getInstance(vehicleHistoryModalElement);
      if (historyModal) historyModal.hide();
    } else {
      renderVehicleHistory(recordToDelete.vehiclePlateNumber);
    }
  } catch (err) {
    console.error(err);
    deleteServiceRecordError.textContent = err.message || "Unable to delete this service record. Please try again.";
    deleteServiceRecordError.classList.remove("d-none");
  } finally {
    confirmDeleteServiceRecordButton.disabled = false;
    confirmDeleteServiceRecordButton.innerHTML = '<i class="bi bi-trash3 me-1" aria-hidden="true"></i> Delete Record';
  }
});

deleteServiceRecordModalElement.addEventListener("hidden.bs.modal", function () {
  pendingDeleteServiceRecordId = "";
  deleteServiceRecordError.textContent = "";
  deleteServiceRecordError.classList.add("d-none");
});

serviceRecordForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const record = buildServiceRecordFromForm();

  if (
    !record.serviceDate ||
    !record.customerName ||
    !record.phoneNumber ||
    !record.vehiclePlateNumber ||
    !record.vehicleBrand ||
    !record.vehicleModel ||
    record.currentMileage < 0 ||
    !record.oilServicePackage
  ) {
    alert("Please complete all required service record fields.");
    return;
  }

  if (serviceRecordIdInput.value) {
    const savedRecord = await persistOilServiceRecord(record, "PUT", serviceRecordIdInput.value);
    oilServiceRecords = oilServiceRecords.map((item) =>
      item.id === serviceRecordIdInput.value ? (savedRecord || record) : item
    );
  } else {
    const savedRecord = await persistOilServiceRecord(record, "POST");
    oilServiceRecords.unshift(savedRecord || record);
  }

  saveOilServiceRecordsToStorage(oilServiceRecords);
  renderVehicleCards();

  const modal = bootstrap.Modal.getInstance(serviceRecordModalElement);
  if (modal) modal.hide();
  resetServiceRecordForm();
});

if (vehicleSearchInput) {
  vehicleSearchInput.addEventListener("input", renderVehicleCards);
}

if (addServiceBtn) {
  addServiceBtn.addEventListener("click", resetServiceRecordForm);
}

if (serviceRecordModalElement) {
  serviceRecordModalElement.addEventListener("hidden.bs.modal", resetServiceRecordForm);
}

[serviceDateInput, oilServicePackageInput].forEach((element) => {
  element.addEventListener("input", updateCalculatedFields);
  element.addEventListener("change", updateCalculatedFields);
});

customerNameInput.addEventListener("change", function () {
  const hasExactCustomerMatch = customers.some((customer) => getCustomerName(customer) === this.value);

  renderCarPlateOptions(hasExactCustomerMatch ? this.value : "");
  clearCustomerVehicleFields();
  closeCustomerNameOptions();
});

customerNameInput.addEventListener("input", function () {
  const hasExactCustomerMatch = customers.some((customer) => getCustomerName(customer) === this.value);

  renderCustomerNameOptions(this.value);
  openCustomerNameOptions();
  renderCarPlateOptions(hasExactCustomerMatch ? this.value : "");
  clearCustomerVehicleFields();
});

customerNameInput.addEventListener("focus", openCustomerNameOptions);

customerNameToggle.addEventListener("click", function () {
  if (customerNameOptions.classList.contains("d-none")) {
    openCustomerNameOptions();
    customerNameInput.focus();
  } else {
    closeCustomerNameOptions();
  }
});

customerNameOptions.addEventListener("click", function (e) {
  const option = e.target.closest(".customer-option");
  if (!option) return;

  selectCustomerName(option.dataset.customerName);
});

document.addEventListener("click", function (e) {
  if (!customerNameCombobox.contains(e.target)) {
    closeCustomerNameOptions();
  }
});

vehiclePlateNumberInput.addEventListener("focus", openCarPlateOptions);
vehiclePlateNumberInput.addEventListener("click", openCarPlateOptions);

vehiclePlateNumberToggle.addEventListener("click", function () {
  if (vehiclePlateNumberOptions.classList.contains("d-none")) {
    openCarPlateOptions();
    vehiclePlateNumberInput.focus();
  } else {
    closeCarPlateOptions();
  }
});

vehiclePlateNumberOptions.addEventListener("click", function (e) {
  const option = e.target.closest(".car-plate-option");
  if (!option) return;

  selectCarPlate(option.dataset.plate);
});

document.addEventListener("click", function (e) {
  if (!vehiclePlateNumberCombobox.contains(e.target)) {
    closeCarPlateOptions();
  }
});

oilServicePackageInput.addEventListener("focus", openOilServicePackageOptions);
oilServicePackageInput.addEventListener("click", openOilServicePackageOptions);

oilServicePackageToggle.addEventListener("click", function () {
  if (oilServicePackageOptions.classList.contains("d-none")) {
    openOilServicePackageOptions();
    oilServicePackageInput.focus();
  } else {
    closeOilServicePackageOptions();
  }
});

oilServicePackageOptions.addEventListener("click", function (e) {
  const option = e.target.closest(".package-option");
  if (!option) return;

  selectOilServicePackage(option.dataset.packageName);
});

document.addEventListener("click", function (e) {
  if (!oilServicePackageCombobox.contains(e.target)) {
    closeOilServicePackageOptions();
  }
});

async function initializeVehiclesPage() {
  await loadCustomersForVehicleForm();
  resetServiceRecordForm();
  oilServiceRecords = await loadOilServiceRecords();
  renderVehicleCards();
}

initializeVehiclesPage();
