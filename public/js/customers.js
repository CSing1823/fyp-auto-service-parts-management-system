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

const addCustomerForm = document.getElementById("addCustomerForm");
const customerTableBody = document.getElementById("customerTableBody");
const customerSearchInput = document.getElementById("customerSearchInput");

const customerNameInput = document.getElementById("customerName");
const phoneNumberInput = document.getElementById("phoneNumber");
const vehicleBrandInput = document.getElementById("vehicleBrand");
const vehicleBrandCombobox = document.getElementById("vehicleBrandCombobox");
const vehicleBrandOptions = document.getElementById("vehicleBrandOptions");
const vehicleBrandToggle = document.getElementById("vehicleBrandToggle");
const vehicleModelInput = document.getElementById("vehicleModel");
const carPlateNumberInput = document.getElementById("carPlateNumber");

const editCustomerIdInput = document.getElementById("editRowIndex");
const customerModalTitle = document.getElementById("customerModalTitle");
const customerSubmitBtn = document.getElementById("customerSubmitBtn");
const addCustomerModalElement = document.getElementById("addCustomerModal");
const addCustomerBtn = document.querySelector(".add-btn");
const customerFormError = document.getElementById("customerFormError");
const deleteCustomerModalElement = document.getElementById("deleteCustomerModal");
const deleteCustomerName = document.getElementById("deleteCustomerName");
const deleteCustomerVehicle = document.getElementById("deleteCustomerVehicle");
const deleteCustomerError = document.getElementById("deleteCustomerError");
const confirmDeleteCustomerButton = document.getElementById("confirmDeleteCustomerBtn");
let pendingDeleteCustomerId = "";

const vehicleBrands = [
  "Toyota",
  "Honda",
  "Proton",
  "Perodua",
  "Nissan",
  "Mazda",
  "Mitsubishi",
  "Mercedes-Benz",
  "BMW",
  "Volkswagen",
  "Ford",
  "Hyundai",
  "Kia",
  "Suzuki",
  "Isuzu",
  "Subaru",
  "Lexus",
  "Audi",
  "Peugeot",
  "Renault",
  "Volvo",
  "Mini",
  "Porsche",
  "BYD",
  "Chery",
  "GWM",
  "Tesla",
  "Other"
];

let customers = [];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const customerFieldRules = [
  {
    input: customerNameInput,
    message: document.getElementById("customerNameError"),
    validate(value) {
      if (!value) return "Enter the customer's name.";
      const letterCount = (value.match(/\p{L}/gu) || []).length;
      if (letterCount < 2 || value.length > 100 || !/^[\p{L}\p{M}][\p{L}\p{M}\s'.’\-]*$/u.test(value)) {
        return "Enter a name with at least 2 letters. You may use spaces, apostrophes, periods, or hyphens (up to 100 characters).";
      }
      return "";
    }
  },
  {
    input: phoneNumberInput,
    message: document.getElementById("phoneNumberError"),
    validate(value) {
      if (!value) return "Enter a phone number.";
      const digits = value.replace(/\D/g, "");
      const localDigits = digits.startsWith("60") ? `0${digits.slice(2)}` : digits;
      if (!/^\+?[0-9][0-9\s()-]*$/.test(value) || !/^0\d{8,10}$/.test(localDigits)) {
        return "Enter a valid Malaysian number, such as 011 1234 5678 or +60 11 1234 5678.";
      }
      return "";
    }
  },
  {
    input: vehicleBrandInput,
    message: document.getElementById("vehicleBrandError"),
    validate(value) {
      return value ? "" : "Select or enter a vehicle brand.";
    }
  },
  {
    input: vehicleModelInput,
    message: document.getElementById("vehicleModelError"),
    validate(value) {
      if (!value) return "Enter the vehicle model.";
      if (value.length > 80 || !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'’()\/-]*$/u.test(value)) {
        return "Use letters, numbers, spaces, or common punctuation (up to 80 characters).";
      }
      return "";
    }
  },
  {
    input: carPlateNumberInput,
    message: document.getElementById("carPlateNumberError"),
    validate(value) {
      if (!value) return "Enter the car plate number.";
      const compactValue = value.replace(/[\s-]/g, "");
      if (!/^[A-Z0-9 -]+$/i.test(value) || compactValue.length < 2 || compactValue.length > 20) {
        return "Use 2–20 letters or numbers. Spaces and hyphens are okay.";
      }
      return "";
    }
  }
];

function validateCustomerField(field) {
  const error = field.validate(field.input.value.trim());
  field.input.classList.toggle("is-invalid", Boolean(error));
  field.input.setAttribute("aria-invalid", String(Boolean(error)));
  field.message.textContent = error;
  field.message.classList.toggle("d-none", !error);
  field.message.classList.toggle("d-block", Boolean(error));
  return !error;
}

customerFieldRules.forEach((field) => {
  field.input.addEventListener("blur", () => validateCustomerField(field));
  field.input.addEventListener("input", () => {
    if (field.input.classList.contains("is-invalid")) validateCustomerField(field);
  });
});

function getVehicleBrand(customer) {
  return customer.vehicleBrand || "";
}

function getCustomerName(customer) {
  return customer.customerName || customer.name || "";
}

function getPhoneNumber(customer) {
  return customer.phoneNumber || customer.phone || "";
}

function getVehicleModel(customer) {
  return customer.vehicleModel || customer.vehicle || "";
}

function getCarPlateNumber(customer) {
  return customer.carPlateNumber || customer.carPlate || "";
}

function renderVehicleBrandOptions(filter = "") {
  const keyword = filter.trim().toLowerCase();
  const filteredBrands = vehicleBrands.filter((brand) =>
    brand.toLowerCase().includes(keyword)
  );

  if (filteredBrands.length === 0) {
    vehicleBrandOptions.innerHTML = `
      <div class="brand-option-empty">No brand found</div>
    `;
    return;
  }

  vehicleBrandOptions.innerHTML = filteredBrands
    .map((brand) => `
      <button type="button" class="brand-option${brand === vehicleBrandInput.value ? " active" : ""}" data-brand="${escapeHtml(brand)}" role="option">
        ${escapeHtml(brand)}
      </button>
    `)
    .join("");
}

function openVehicleBrandOptions() {
  renderVehicleBrandOptions(vehicleBrandInput.value);
  vehicleBrandOptions.classList.remove("d-none");
  vehicleBrandInput.setAttribute("aria-expanded", "true");
}

function closeVehicleBrandOptions() {
  vehicleBrandOptions.classList.add("d-none");
  vehicleBrandInput.setAttribute("aria-expanded", "false");
}

function setupVehicleBrandCombobox() {
  if (!vehicleBrandInput || !vehicleBrandOptions || !vehicleBrandToggle) {
    return;
  }

  renderVehicleBrandOptions();

  vehicleBrandInput.addEventListener("focus", openVehicleBrandOptions);
  vehicleBrandInput.addEventListener("input", function () {
    openVehicleBrandOptions();
  });

  vehicleBrandToggle.addEventListener("click", function () {
    if (vehicleBrandOptions.classList.contains("d-none")) {
      openVehicleBrandOptions();
      vehicleBrandInput.focus();
      return;
    }

    closeVehicleBrandOptions();
  });

  vehicleBrandOptions.addEventListener("click", function (e) {
    const option = e.target.closest(".brand-option");
    if (!option) {
      return;
    }

    vehicleBrandInput.value = option.dataset.brand;
    closeVehicleBrandOptions();
    validateCustomerField(customerFieldRules.find((field) => field.input === vehicleBrandInput));
    vehicleModelInput.focus();
  });

  document.addEventListener("click", function (e) {
    if (!vehicleBrandCombobox.contains(e.target)) {
      closeVehicleBrandOptions();
    }
  });
}

/* ======================
   LOAD FROM DATABASE
====================== */
async function loadCustomersFromDB(search = "") {
  try {
    const url = search
  ? `/api/customers?search=${encodeURIComponent(search)}&limit=100`
  : `/api/customers?limit=100`;

    const res = await apiFetch(url);
    const data = await res.json();

    customers = data;
    renderCustomers(data);

  } catch (err) {
    console.error(err);
  }
}

/* ======================
   RENDER TABLE
====================== */
function createCustomerRowHtml(customer) {
  return `
    <tr>
      <td>${escapeHtml(getCustomerName(customer))}</td>
      <td>${escapeHtml(getPhoneNumber(customer))}</td>
      <td>${escapeHtml(getVehicleBrand(customer))}</td>
      <td>${escapeHtml(getVehicleModel(customer))}</td>
      <td>${escapeHtml(getCarPlateNumber(customer))}</td>
      <td class="text-center">
        <button class="btn btn-sm action-btn edit-btn" data-id="${escapeHtml(customer._id)}">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm action-btn delete-btn" data-id="${escapeHtml(customer._id)}">
          <i class="bi bi-trash3"></i>
        </button>
      </td>
    </tr>
  `;
}

function renderCustomers(data = customers) {
  customerTableBody.innerHTML = "";

  if (!data || data.length === 0) {
    customerTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:20px; color:#999;">
          No customer found
        </td>
      </tr>
    `;
    return;
  }

  data.forEach((customer) => {
    customerTableBody.innerHTML += createCustomerRowHtml(customer);
  });

  addDeleteEvents();
  addEditEvents();
}

/* ======================
   RESET FORM
====================== */
function resetCustomerForm() {
  editCustomerIdInput.value = "";
  addCustomerForm.reset();
  closeVehicleBrandOptions();
  customerModalTitle.textContent = "Add Customer";
  customerSubmitBtn.textContent = "Add Customer";
  customerFormError.textContent = "";
  customerFormError.classList.add("d-none");
  customerFieldRules.forEach((field) => {
    field.input.classList.remove("is-invalid");
    field.input.setAttribute("aria-invalid", "false");
    field.message.textContent = "";
    field.message.classList.add("d-none");
    field.message.classList.remove("d-block");
  });
}

 if (addCustomerBtn) {
  addCustomerBtn.addEventListener("click", function () {
    resetCustomerForm();
  });
}

if (addCustomerModalElement) {
  addCustomerModalElement.addEventListener("hidden.bs.modal", function () {
    resetCustomerForm();
  });
}

/* ======================
   SUBMIT (CREATE + UPDATE)
====================== */
addCustomerForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  customerFormError.textContent = "";
  customerFormError.classList.add("d-none");

  const customerName = customerNameInput.value.trim();
  const phoneNumber = phoneNumberInput.value.trim();
  const vehicleBrand = vehicleBrandInput.value.trim();
  const vehicleModel = vehicleModelInput.value.trim();
  const carPlateNumber = carPlateNumberInput.value.trim().toUpperCase();

  const customerId = editCustomerIdInput.value;

  const invalidFields = customerFieldRules.filter((field) => !validateCustomerField(field));
  if (invalidFields.length > 0) {
    invalidFields[0].input.focus();
    return;
  }

  const customerData = { customerName, phoneNumber, vehicleBrand, vehicleModel, carPlateNumber };

  try {
    // UPDATE
    let response;
    if (customerId) {
      response = await apiFetch(`/api/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerData)
      });
    } 
    // CREATE
    else {
      response = await apiFetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerData)
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Unable to save customer details.");
    }

    await loadCustomersFromDB();

    const modal = bootstrap.Modal.getInstance(addCustomerModalElement);
    if (modal) modal.hide();

    resetCustomerForm();

  } catch (err) {
    console.error(err);
    customerFormError.textContent = err.message || "Error saving customer details.";
    customerFormError.classList.remove("d-none");
  }
});

/* ======================
   DELETE
====================== */
function addDeleteEvents() {
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const customer = customers.find((item) => item._id === id);
      if (!customer) return;

      pendingDeleteCustomerId = id;
      deleteCustomerName.textContent = getCustomerName(customer);
      deleteCustomerVehicle.textContent = [
        getVehicleBrand(customer),
        getVehicleModel(customer),
        getCarPlateNumber(customer)
      ].filter(Boolean).join(" · ");
      deleteCustomerError.textContent = "";
      deleteCustomerError.classList.add("d-none");
      bootstrap.Modal.getOrCreateInstance(deleteCustomerModalElement).show();
    });
  });
}

confirmDeleteCustomerButton.addEventListener("click", async function () {
  if (!pendingDeleteCustomerId) return;

  confirmDeleteCustomerButton.disabled = true;
  confirmDeleteCustomerButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Deleting...';

  try {
    const response = await apiFetch(`/api/customers/${pendingDeleteCustomerId}`, {
      method: "DELETE"
    });
    if (!response.ok) throw new Error("Unable to delete this customer. Please try again.");

    await loadCustomersFromDB();
    bootstrap.Modal.getInstance(deleteCustomerModalElement).hide();
  } catch (err) {
    console.error(err);
    deleteCustomerError.textContent = err.message || "Unable to delete this customer. Please try again.";
    deleteCustomerError.classList.remove("d-none");
  } finally {
    confirmDeleteCustomerButton.disabled = false;
    confirmDeleteCustomerButton.innerHTML = '<i class="bi bi-trash3 me-1" aria-hidden="true"></i> Delete Customer';
  }
});

deleteCustomerModalElement.addEventListener("hidden.bs.modal", function () {
  pendingDeleteCustomerId = "";
  deleteCustomerError.textContent = "";
  deleteCustomerError.classList.add("d-none");
});

/* ======================
   EDIT
====================== */
function addEditEvents() {
  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const customer = customers.find(c => c._id === id);

      if (!customer) return;

      customerNameInput.value = getCustomerName(customer);
      phoneNumberInput.value = getPhoneNumber(customer);
      vehicleBrandInput.value = getVehicleBrand(customer);
      vehicleModelInput.value = getVehicleModel(customer);
      carPlateNumberInput.value = getCarPlateNumber(customer);

      editCustomerIdInput.value = customer._id;

      customerModalTitle.textContent = "Edit Customer";
      customerSubmitBtn.textContent = "Update Customer";

      const modal = new bootstrap.Modal(addCustomerModalElement);
      modal.show();
    });
  });
}

/* ======================
   SEARCH (BACKEND)
====================== */
if (customerSearchInput) {
  customerSearchInput.addEventListener("input", function () {
    const keyword = this.value.trim();
    loadCustomersFromDB(keyword);
  });
}

/* ======================
   INIT
====================== */
setupVehicleBrandCombobox();
loadCustomersFromDB();
