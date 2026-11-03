const OIL_SERVICE_API_URL = "/api/oil-services";
const SERVICE_REMINDER_SMS_API_URL = "/api/service-reminders/process-sms";
const OIL_SERVICE_STORAGE_KEY = "oilServiceRecords";
const OIL_SERVICE_PACKAGES = {
  "5000km (3 months)": 3,
  "7000km (6 months)": 6,
  "10000km (12 months)": 12
};
const REMINDER_STATUS_ORDER = ["Upcoming", "Reminder Sent", "Overdue"];

const sampleOilServiceRecords = [
  {
    id: "oil-1",
    serviceDate: "2026-03-15",
    customerName: "Ahmad bin Hassan",
    phoneNumber: "012-3456789",
    vehiclePlateNumber: "WXY 1234",
    vehicleBrand: "Toyota",
    vehicleModel: "Vios",
    currentMileage: 45000,
    oilServicePackage: "5000km (3 months)",
    engineOilType: "Synthetic 5W-30",
    partsUsed: "Oil filter, drain plug washer",
    nextOilServiceDueDate: "2026-06-15",
    reminderDate: "2026-06-01",
    reminderStatus: "Upcoming"
  },
  {
    id: "oil-2",
    serviceDate: "2026-03-20",
    customerName: "Lim Wei Jie",
    phoneNumber: "012-3456789",
    vehiclePlateNumber: "ABC 5678",
    vehicleBrand: "Honda",
    vehicleModel: "City",
    currentMileage: 38500,
    oilServicePackage: "7000km (6 months)",
    engineOilType: "Semi Synthetic 10W-40",
    partsUsed: "Oil filter",
    nextOilServiceDueDate: "2026-09-20",
    reminderDate: "2026-09-06",
    reminderStatus: "Upcoming"
  },
  {
    id: "oil-3",
    serviceDate: "2025-12-10",
    customerName: "Siti Nurhaliza",
    phoneNumber: "012-3456789",
    vehiclePlateNumber: "DEF 9012",
    vehicleBrand: "Perodua",
    vehicleModel: "Myvi",
    currentMileage: 23000,
    oilServicePackage: "5000km (3 months)",
    engineOilType: "Synthetic 0W-20",
    partsUsed: "Oil filter, air filter",
    nextOilServiceDueDate: "2026-03-10",
    reminderDate: "2026-02-24",
    reminderStatus: "Overdue"
  }
];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeOilServiceRecord(record) {
  const vehicleBrand = String(record.vehicleBrand || "").trim();
  const vehicleModel = String(record.vehicleModel || "").trim();
  const normalizedRecord = {
    id: record._id || record.id,
    serviceDate: record.serviceDate,
    customerName: String(record.customerName || "").trim(),
    phoneNumber: String(record.phoneNumber || "").trim(),
    vehiclePlateNumber: String(record.vehiclePlateNumber || record.carPlateNumber || record.carPlate || "").trim().toUpperCase(),
    vehicleBrand,
    vehicleModel: vehicleBrand && vehicleModel.toLowerCase().startsWith(`${vehicleBrand.toLowerCase()} `)
      ? vehicleModel.slice(vehicleBrand.length).trim()
      : vehicleModel,
    currentMileage: Number(record.currentMileage),
    oilServicePackage: record.oilServicePackage,
    engineOilType: String(record.engineOilType || "").trim(),
    partsUsed: String(record.partsUsed || "").trim(),
    smsReminderSentAt: record.smsReminderSentAt || "",
    smsReminderProvider: record.smsReminderProvider || "",
    smsReminderStatus: record.smsReminderStatus || "",
    smsReminderLastError: record.smsReminderLastError || ""
  };

  const computedDates = calculateOilServiceDates(
    normalizedRecord.serviceDate,
    normalizedRecord.oilServicePackage
  );

  normalizedRecord.nextOilServiceDueDate = record.nextOilServiceDueDate || computedDates.nextOilServiceDueDate;
  normalizedRecord.reminderDate = record.reminderDate || computedDates.reminderDate;
  normalizedRecord.reminderStatus = getReminderStatus(
    normalizedRecord.reminderDate,
    normalizedRecord.nextOilServiceDueDate,
    todayIsoDate(),
    normalizedRecord.smsReminderSentAt
  );

  return normalizedRecord;
}

function createLocalOilServiceId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `oil-service-${Date.now()}`;
}

function toIsoDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function addMonthsToIsoDate(isoDate, monthCount) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setMonth(date.getMonth() + monthCount);
  return toIsoDate(date);
}

function subtractDaysFromIsoDate(isoDate, dayCount) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() - dayCount);
  return toIsoDate(date);
}

function calculateOilServiceDates(serviceDate, oilServicePackage) {
  const monthCount = OIL_SERVICE_PACKAGES[oilServicePackage];

  if (!serviceDate || !monthCount) {
    return {
      nextOilServiceDueDate: "",
      reminderDate: ""
    };
  }

  const nextOilServiceDueDate = addMonthsToIsoDate(serviceDate, monthCount);
  const reminderDate = subtractDaysFromIsoDate(nextOilServiceDueDate, 14);

  return {
    nextOilServiceDueDate,
    reminderDate
  };
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function getReminderStatus(reminderDate, dueDate, currentDate = todayIsoDate(), smsReminderSentAt = "") {
  if (!reminderDate || !dueDate) return "Upcoming";

  if (currentDate > dueDate) {
    return "Overdue";
  }

  if (smsReminderSentAt) {
    return "Reminder Sent";
  }

  if (currentDate < reminderDate) {
    return "Upcoming";
  }

  if (currentDate >= reminderDate && currentDate <= dueDate) {
    return "Upcoming";
  }

  return "Upcoming";
}

function addDaysToIsoDate(isoDate, dayCount) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + dayCount);
  return toIsoDate(date);
}

function getOilServiceStatusClass(status) {
  if (status === "Overdue") return "overdue";
  if (status === "Reminder Sent") return "reminder-sent";
  return "upcoming";
}

function saveOilServiceRecordsToStorage(records) {
  localStorage.setItem(OIL_SERVICE_STORAGE_KEY, JSON.stringify(records));
}

function getOilServiceRecordsFromStorage() {
  const storedRecords = localStorage.getItem(OIL_SERVICE_STORAGE_KEY);

  if (!storedRecords) {
    saveOilServiceRecordsToStorage(sampleOilServiceRecords);
    return sampleOilServiceRecords.map(normalizeOilServiceRecord);
  }

  try {
    return JSON.parse(storedRecords).map(normalizeOilServiceRecord);
  } catch (err) {
    console.error(err);
    return sampleOilServiceRecords.map(normalizeOilServiceRecord);
  }
}

async function loadOilServiceRecords() {
  try {
    const res = await apiFetch(OIL_SERVICE_API_URL);
    if (!res.ok) throw new Error("Unable to load oil service records from API");

    const data = await res.json();
    const normalized = data.map(normalizeOilServiceRecord);
    saveOilServiceRecordsToStorage(normalized);
    return normalized;
  } catch (err) {
    return getOilServiceRecordsFromStorage();
  }
}

async function processDueSmsReminders() {
  try {
    const res = await apiFetch(SERVICE_REMINDER_SMS_API_URL, { method: "POST" });
    if (!res.ok) throw new Error("Unable to process SMS reminders");

    return await res.json();
  } catch (err) {
    return null;
  }
}

async function persistOilServiceRecord(record, method, id = "") {
  try {
    const url = id ? `${OIL_SERVICE_API_URL}/${id}` : OIL_SERVICE_API_URL;
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    if (!res.ok) throw new Error("API save failed");
    return normalizeOilServiceRecord(await res.json());
  } catch (err) {
    return null;
  }
}

async function deleteOilServiceRecordFromApi(id) {
  try {
    const res = await apiFetch(`${OIL_SERVICE_API_URL}/${id}`, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    return false;
  }
}

function groupLatestVehicleRecords(records) {
  const map = new Map();
  const sortedRecords = [...records].sort((a, b) =>
    `${b.serviceDate}${b.id}`.localeCompare(`${a.serviceDate}${a.id}`)
  );

  sortedRecords.forEach((record) => {
    const key = record.vehiclePlateNumber;
    if (!map.has(key)) {
      map.set(key, record);
    }
  });

  return Array.from(map.values());
}

function getVehicleHistory(records, vehiclePlateNumber) {
  return records
    .filter((record) => record.vehiclePlateNumber === vehiclePlateNumber)
    .sort((a, b) => `${b.serviceDate}${b.id}`.localeCompare(`${a.serviceDate}${a.id}`));
}
