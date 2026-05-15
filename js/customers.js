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
  ? `http://localhost:3000/api/customers?search=${encodeURIComponent(search)}&limit=100`
  : `http://localhost:3000/api/customers?limit=100`;

    const res = await fetch(url);
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

  const customerName = customerNameInput.value.trim();
  const phoneNumber = phoneNumberInput.value.trim();
  const vehicleBrand = vehicleBrandInput.value.trim();
  const vehicleModel = vehicleModelInput.value.trim();
  const carPlateNumber = carPlateNumberInput.value.trim().toUpperCase();

  const customerId = editCustomerIdInput.value;

  if (!customerName || !phoneNumber || !vehicleBrand || !vehicleModel || !carPlateNumber) {
    alert("Please fill all fields");
    return;
  }

  const customerData = { customerName, phoneNumber, vehicleBrand, vehicleModel, carPlateNumber };

  try {
    // UPDATE
    if (customerId) {
      await fetch(`http://localhost:3000/api/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerData)
      });
    } 
    // CREATE
    else {
      await fetch("http://localhost:3000/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerData)
      });
    }

    await loadCustomersFromDB();

    const modal = bootstrap.Modal.getInstance(addCustomerModalElement);
    if (modal) modal.hide();

    resetCustomerForm();

  } catch (err) {
    console.error(err);
    alert("Error saving data");
  }
});

/* ======================
   DELETE
====================== */
function addDeleteEvents() {
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async function () {
      const id = this.dataset.id;

      if (!confirm("Delete this customer?")) return;

      try {
        await fetch(`http://localhost:3000/api/customers/${id}`, {
          method: "DELETE"
        });

        await loadCustomersFromDB();
      } catch (err) {
        console.error(err);
      }
    });
  });
}

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
