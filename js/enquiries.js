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

const API_BASE_URL = "http://localhost:3000/api/enquiries";
const STORAGE_KEY = "customerEnquiries";
const statusOptions = ["Pending", "Checked, Not Told", "Checked, Told"];

const enquiryForm = document.getElementById("enquiryForm");
const enquiryTableBody = document.getElementById("enquiryTableBody");
const enquirySearchInput = document.getElementById("enquirySearchInput");
const enquiryModalElement = document.getElementById("enquiryModal");
const viewEnquiryModalElement = document.getElementById("viewEnquiryModal");
const viewEnquiryBody = document.getElementById("viewEnquiryBody");
const enquiryModalTitle = document.getElementById("enquiryModalTitle");
const enquirySubmitBtn = document.getElementById("enquirySubmitBtn");
const addEnquiryBtn = document.querySelector(".add-btn");
const filterButtons = document.querySelectorAll(".filter-btn");

const enquiryRecordIdInput = document.getElementById("enquiryRecordId");
const enquiryDateInput = document.getElementById("enquiryDate");
const customerNameInput = document.getElementById("customerName");
const phoneNumberInput = document.getElementById("phoneNumber");
const itemsEnquiredInput = document.getElementById("itemsEnquired");
const followUpDateInput = document.getElementById("followUpDate");
const enquiryStatusInput = document.getElementById("enquiryStatus");

let enquiries = [];
let activeStatusFilter = "All";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const sampleEnquiries = [
  {
    id: "sample-1",
    date: "2026-04-23",
    customerName: "Ahmad bin Hassan",
    phoneNumber: "012-3456789",
    itemsEnquired: "Engine oil 5W-30 and oil filter availability",
    followUpDate: "2026-04-24",
    status: "Pending"
  },
  {
    id: "sample-2",
    date: "2026-04-22",
    customerName: "Lim Wei Jie",
    phoneNumber: "013-9876543",
    itemsEnquired: "Front brake pads for Honda City",
    followUpDate: "2026-04-23",
    status: "Checked, Not Told"
  },
  {
    id: "sample-3",
    date: "2026-04-21",
    customerName: "Siti Nurhaliza",
    phoneNumber: "014-5551234",
    itemsEnquired: "Air filter and cabin filter",
    followUpDate: "2026-04-22",
    status: "Checked, Told"
  }
];

function normalizeEnquiry(enquiry) {
  return {
    id: enquiry._id || enquiry.id,
    date: enquiry.date,
    customerName: enquiry.customerName,
    phoneNumber: enquiry.phoneNumber,
    itemsEnquired: enquiry.itemsEnquired,
    followUpDate: enquiry.followUpDate,
    status: enquiry.status
  };
}

function createLocalId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `enquiry-${Date.now()}`;
}

function getStoredEnquiries() {
  const storedEnquiries = localStorage.getItem(STORAGE_KEY);

  if (!storedEnquiries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleEnquiries));
    return sampleEnquiries;
  }

  try {
    return JSON.parse(storedEnquiries).map(normalizeEnquiry);
  } catch (err) {
    console.error(err);
    return sampleEnquiries;
  }
}

function saveStoredEnquiries(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

async function loadEnquiries() {
  try {
    const res = await fetch(API_BASE_URL);
    if (!res.ok) throw new Error("Unable to load enquiries from API");

    const data = await res.json();
    enquiries = data.map(normalizeEnquiry);
    saveStoredEnquiries(enquiries);
  } catch (err) {
    enquiries = getStoredEnquiries();
  }

  renderEnquiries();
}

function getStatusClass(status) {
  if (status === "Checked, Told") return "told";
  if (status === "Checked, Not Told") return "not-told";
  return "pending";
}

function getVisibleEnquiries() {
  const keyword = enquirySearchInput.value.trim().toLowerCase();

  return enquiries.filter((enquiry) => {
    const matchesStatus = activeStatusFilter === "All" || enquiry.status === activeStatusFilter;
    const matchesSearch = [
      enquiry.date,
      enquiry.customerName,
      enquiry.phoneNumber,
      enquiry.itemsEnquired,
      enquiry.followUpDate,
      enquiry.status
    ].join(" ").toLowerCase().includes(keyword);

    return matchesStatus && matchesSearch;
  });
}

function createEnquiryRowHtml(enquiry) {
  return `
    <tr>
      <td>${escapeHtml(enquiry.date)}</td>
      <td>${escapeHtml(enquiry.customerName)}</td>
      <td>${escapeHtml(enquiry.phoneNumber)}</td>
      <td class="items-cell">${escapeHtml(enquiry.itemsEnquired)}</td>
      <td>${escapeHtml(enquiry.followUpDate)}</td>
      <td><span class="status-badge ${getStatusClass(enquiry.status)}">${escapeHtml(enquiry.status)}</span></td>
      <td class="text-center">
        <button class="btn btn-sm action-btn view" data-id="${escapeHtml(enquiry.id)}" title="View">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn btn-sm action-btn status" data-id="${escapeHtml(enquiry.id)}" title="Update Status">
          <i class="bi bi-arrow-repeat"></i>
        </button>
        <button class="btn btn-sm action-btn edit" data-id="${escapeHtml(enquiry.id)}" title="Edit">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm action-btn delete" data-id="${escapeHtml(enquiry.id)}" title="Delete">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
}

function renderEnquiries() {
  const visibleEnquiries = getVisibleEnquiries();
  enquiryTableBody.innerHTML = "";

  if (visibleEnquiries.length === 0) {
    enquiryTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-row py-4">No customer enquiries found</td>
      </tr>
    `;
    return;
  }

  enquiryTableBody.innerHTML = visibleEnquiries.map(createEnquiryRowHtml).join("");
  bindActionButtons();
}

function resetEnquiryForm() {
  enquiryForm.reset();
  enquiryRecordIdInput.value = "";
  enquiryDateInput.value = new Date().toISOString().slice(0, 10);
  followUpDateInput.value = new Date().toISOString().slice(0, 10);
  enquiryStatusInput.value = "Pending";
  enquiryModalTitle.textContent = "Add Enquiry";
  enquirySubmitBtn.textContent = "Add Enquiry";
}

function getFormData() {
  return {
    date: enquiryDateInput.value,
    customerName: customerNameInput.value.trim(),
    phoneNumber: phoneNumberInput.value.trim(),
    itemsEnquired: itemsEnquiredInput.value.trim(),
    followUpDate: followUpDateInput.value,
    status: enquiryStatusInput.value
  };
}

async function persistEnquiry(enquiry, method, id = "") {
  try {
    const url = id ? `${API_BASE_URL}/${id}` : API_BASE_URL;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enquiry)
    });

    if (!res.ok) throw new Error("API save failed");
    return normalizeEnquiry(await res.json());
  } catch (err) {
    return null;
  }
}

async function deleteEnquiryFromApi(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/${id}`, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    return false;
  }
}

enquiryForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const formData = getFormData();
  const existingId = enquiryRecordIdInput.value;

  if (!formData.date || !formData.customerName || !formData.phoneNumber || !formData.itemsEnquired || !formData.followUpDate) {
    alert("Please fill in all enquiry details");
    return;
  }

  if (existingId) {
    const savedEnquiry = await persistEnquiry(formData, "PUT", existingId);
    enquiries = enquiries.map((enquiry) => {
      if (enquiry.id !== existingId) return enquiry;
      return savedEnquiry || { ...formData, id: existingId };
    });
  } else {
    const savedEnquiry = await persistEnquiry(formData, "POST");
    enquiries.unshift(savedEnquiry || { ...formData, id: createLocalId() });
  }

  saveStoredEnquiries(enquiries);
  renderEnquiries();

  const modal = bootstrap.Modal.getInstance(enquiryModalElement);
  if (modal) modal.hide();
  resetEnquiryForm();
});

function bindActionButtons() {
  document.querySelectorAll(".action-btn.view").forEach((btn) => {
    btn.addEventListener("click", function () {
      const enquiry = enquiries.find((item) => item.id === this.dataset.id);
      if (!enquiry) return;

      viewEnquiryBody.innerHTML = `
        <div class="detail-row">
          <span class="detail-label">Date</span>
          <span class="detail-value">${escapeHtml(enquiry.date)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Customer Name</span>
          <span class="detail-value">${escapeHtml(enquiry.customerName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Phone Number</span>
          <span class="detail-value">${escapeHtml(enquiry.phoneNumber)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Items Enquired</span>
          <span class="detail-value">${escapeHtml(enquiry.itemsEnquired)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Follow-up Date</span>
          <span class="detail-value">${escapeHtml(enquiry.followUpDate)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="status-badge ${getStatusClass(enquiry.status)}">${escapeHtml(enquiry.status)}</span>
        </div>
      `;

      new bootstrap.Modal(viewEnquiryModalElement).show();
    });
  });

  document.querySelectorAll(".action-btn.edit").forEach((btn) => {
    btn.addEventListener("click", function () {
      const enquiry = enquiries.find((item) => item.id === this.dataset.id);
      if (!enquiry) return;

      enquiryRecordIdInput.value = enquiry.id;
      enquiryDateInput.value = enquiry.date;
      customerNameInput.value = enquiry.customerName;
      phoneNumberInput.value = enquiry.phoneNumber;
      itemsEnquiredInput.value = enquiry.itemsEnquired;
      followUpDateInput.value = enquiry.followUpDate;
      enquiryStatusInput.value = enquiry.status;
      enquiryModalTitle.textContent = "Edit Enquiry";
      enquirySubmitBtn.textContent = "Update Enquiry";

      new bootstrap.Modal(enquiryModalElement).show();
    });
  });

  document.querySelectorAll(".action-btn.delete").forEach((btn) => {
    btn.addEventListener("click", async function () {
      const id = this.dataset.id;
      if (!confirm("Delete this customer enquiry?")) return;

      await deleteEnquiryFromApi(id);
      enquiries = enquiries.filter((enquiry) => enquiry.id !== id);
      saveStoredEnquiries(enquiries);
      renderEnquiries();
    });
  });

  document.querySelectorAll(".action-btn.status").forEach((btn) => {
    btn.addEventListener("click", async function () {
      const id = this.dataset.id;
      const enquiry = enquiries.find((item) => item.id === id);
      if (!enquiry) return;

      const currentIndex = statusOptions.indexOf(enquiry.status);
      const nextStatus = statusOptions[(currentIndex + 1) % statusOptions.length];
      const updatedEnquiry = { ...enquiry, status: nextStatus };
      const savedEnquiry = await persistEnquiry(updatedEnquiry, "PUT", id);

      enquiries = enquiries.map((item) => {
        if (item.id !== id) return item;
        return savedEnquiry || updatedEnquiry;
      });

      saveStoredEnquiries(enquiries);
      renderEnquiries();
    });
  });
}

if (addEnquiryBtn) {
  addEnquiryBtn.addEventListener("click", resetEnquiryForm);
}

if (enquiryModalElement) {
  enquiryModalElement.addEventListener("hidden.bs.modal", resetEnquiryForm);
}

if (enquirySearchInput) {
  enquirySearchInput.addEventListener("input", renderEnquiries);
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", function () {
    filterButtons.forEach((button) => button.classList.remove("active"));
    this.classList.add("active");
    activeStatusFilter = this.dataset.status;
    renderEnquiries();
  });
});

resetEnquiryForm();
loadEnquiries();
