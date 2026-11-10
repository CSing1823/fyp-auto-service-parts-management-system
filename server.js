const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const https = require('https');
const { ObjectId } = require("mongodb");

function loadEnvFile(filePath = path.join(__dirname, ".env")) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = express();
const usageStatuses = [
  "Pending Check",
  "Checked, Not Ordered",
  "Checked, Ordered"
];
const enquiryStatuses = [
  "Pending",
  "Checked, Not Told",
  "Checked, Told"
];
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
const oilServicePackages = {
  "5000km (3 months)": 3,
  "7000km (6 months)": 6,
  "10000km (12 months)": 12
};
const customersCollectionName = 'Customers';
const vehiclesServicesCollectionName = 'Vehicles&Services';
const inventoryUsageCollectionName = 'InventoryUsage';
const passwordHashPrefix = "scrypt";
const resetOtpExpiryMs = 180 * 1000;
const resetTokenExpiryMs = 10 * 60 * 1000;
const resetOtpMaxAttempts = 5;
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpUser = process.env.SMTP_USER || "chaihuahautoparts@gmail.com";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const moceanApiToken = process.env.MOCEAN_API_TOKEN || "";
const moceanFrom = process.env.MOCEAN_FROM || "CHAIHUAH";
const configuredSmsReminderIntervalMs = Number(process.env.SMS_REMINDER_CHECK_INTERVAL_MS || 60 * 60 * 1000);
const smsReminderCheckIntervalMs = Number.isFinite(configuredSmsReminderIntervalMs) && configuredSmsReminderIntervalMs > 0
  ? configuredSmsReminderIntervalMs
  : 60 * 60 * 1000;
const smsReminderRequestTimeoutMs = 8000;
const smsReminderProcessingLeaseMs = 2 * 60 * 1000;
const fixedPasswordResetEmail = normalizeEmail(
  process.env.PASSWORD_RESET_EMAIL || "chaihuahautoparts@gmail.com"
);
const mongoUri = process.env.MONGODB_URI;
const isMigrationCommand = process.argv.includes("--run-migrations");
const sessionCookieName = "fyp_staff_session";
const resetCookieName = "fyp_password_reset";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const allowedFrontendOrigins = new Set(
  String(process.env.FRONTEND_ORIGINS || "http://127.0.0.1:5501,http://localhost:5501")
    .split(",").map((origin) => origin.trim()).filter(Boolean)
);
let localSmsReminderSchedulerStarted = false;
let mongoReadyPromise = null;
mongoose.connection.on("disconnected", () => {
  mongoReadyPromise = null;
});

function constantTimeSecretMatches(providedSecret, configuredSecret) {
  if (!providedSecret || !configuredSecret) return false;
  const provided = Buffer.from(String(providedSecret));
  const configured = Buffer.from(String(configuredSecret));
  return provided.length === configured.length && crypto.timingSafeEqual(provided, configured);
}

function sanitizeMongoErrorMessage(error) {
  const message = error && typeof error.message === "string"
    ? error.message
    : "MongoDB operation failed without a message.";

  return message
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "[REDACTED_URI]")
    .replace(/\b(authorization|username|user|password|passwd|pwd|token|secret|api[_-]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1$2[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]")
    .slice(0, 500);
}

function safeMongoDiagnosticValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)) return value;
  return undefined;
}

function getSafeMongoErrorDiagnostics(error) {
  const details = {
    name: safeMongoDiagnosticValue(error?.name),
    code: safeMongoDiagnosticValue(error?.code),
    codeName: safeMongoDiagnosticValue(error?.codeName),
    labels: Array.isArray(error?.errorLabels)
      ? error.errorLabels
        .map(safeMongoDiagnosticValue)
        .filter((label) => label !== undefined)
        .slice(0, 10)
      : [],
    message: sanitizeMongoErrorMessage(error)
  };

  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${passwordHashPrefix}:${salt}:${hash}`;
}

function verifyPassword(password, storedPasswordHash) {
  const [prefix, salt, storedHash] = String(storedPasswordHash || "").split(":");

  if (prefix !== passwordHashPrefix || !salt || !storedHash) {
    return false;
  }

  const enteredHash = hashPassword(password, salt).split(":")[2];
  const enteredHashBuffer = Buffer.from(enteredHash, "hex");
  const storedHashBuffer = Buffer.from(storedHash, "hex");

  return (
    enteredHashBuffer.length === storedHashBuffer.length &&
    crypto.timingSafeEqual(enteredHashBuffer, storedHashBuffer)
  );
}

function splitLegacyVehicle(vehicleValue) {
  const value = String(vehicleValue || "").trim();
  const matchedBrand = vehicleBrands
    .filter((brand) => brand !== "Other")
    .sort((a, b) => b.length - a.length)
    .find((brand) => value.toLowerCase().startsWith(`${brand.toLowerCase()} `));

  if (!matchedBrand) {
    return {
      vehicleBrand: "",
      vehicle: value
    };
  }

  return {
    vehicleBrand: matchedBrand,
    vehicle: value.slice(matchedBrand.length).trim()
  };
}

function buildCustomerPayload(body) {
  const legacyVehicle = splitLegacyVehicle(body.vehicleModel || body.vehicle);
  const vehicleBrand = String(body.vehicleBrand || legacyVehicle.vehicleBrand).trim();
  const payload = {
    customerName: String(body.customerName || body.name || "").trim(),
    phoneNumber: String(body.phoneNumber || body.phone || "").trim(),
    vehicleBrand,
    vehicleModel: String(
      vehicleBrand === legacyVehicle.vehicleBrand
        ? legacyVehicle.vehicle
        : body.vehicleModel || body.vehicle || ""
    ).trim(),
    carPlateNumber: String(body.carPlateNumber || body.carPlate || "").trim().toUpperCase()
  };

  if (!payload.customerName || !payload.phoneNumber || !payload.vehicleBrand || !payload.vehicleModel || !payload.carPlateNumber) {
    throw new Error("Missing required customer fields");
  }

  return payload;
}

function validateCustomerName(customerName) {
  const validName = /^[\p{L}\p{M}][\p{L}\p{M}\s'.’\-]*$/u.test(customerName);
  const nameLetterCount = (customerName.match(/\p{L}/gu) || []).length;
  if (!validName || nameLetterCount < 2 || customerName.length > 100) {
    throw new Error("Customer name must contain at least 2 letters, and may include spaces, apostrophes, periods, or hyphens (up to 100 characters).");
  }
}

function validateMalaysianPhoneNumber(phone) {
  const digits = phone.replace(/\D/g, "");
  const localDigits = digits.startsWith("60") ? `0${digits.slice(2)}` : digits;
  if (!/^\+?[0-9][0-9\s()-]*$/.test(phone) || !/^0\d{8,10}$/.test(localDigits)) {
    throw new Error("Enter a valid Malaysian phone number, such as 011 1234 5678 or +60 11 1234 5678.");
  }
}

function validateCustomerFields(payload) {
  validateCustomerName(payload.customerName);
  validateMalaysianPhoneNumber(payload.phoneNumber);

  const validModel = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'’()\/-]*$/u.test(payload.vehicleModel);
  if (!validModel || payload.vehicleModel.length > 80) {
    throw new Error("Vehicle model may contain letters, numbers, spaces, and common punctuation (up to 80 characters).");
  }

  const compactPlate = payload.carPlateNumber.replace(/[\s-]/g, "");
  if (!/^[A-Z0-9 -]+$/i.test(payload.carPlateNumber) || compactPlate.length < 2 || compactPlate.length > 20) {
    throw new Error("Car plate must use 2–20 letters or numbers. Spaces and hyphens are okay.");
  }
}

async function migrateCustomerFields() {
  try {
    const customersCollection = mongoose.connection.collection(customersCollectionName);
    const customers = await customersCollection
      .find({})
      .limit(500)
      .toArray();

    const updates = customers
      .map((customer) => {
        const payload = buildCustomerPayload(customer);
        const orderedCustomer = {
          _id: customer._id,
          customerName: payload.customerName,
          phoneNumber: payload.phoneNumber,
          vehicleBrand: payload.vehicleBrand,
          vehicleModel: payload.vehicleModel,
          carPlateNumber: payload.carPlateNumber,
          updatedAt: customer.updatedAt || new Date()
        };

        return {
          replaceOne: {
            filter: { _id: customer._id },
            replacement: orderedCustomer
          }
        };
      })
      .filter(Boolean);

    if (updates.length > 0) {
      await customersCollection.bulkWrite(updates);
      console.log(`Migrated ${updates.length} customer field records`);
    }
  } catch (err) {
    throw err;
  }
}

async function migrateCustomersCollectionName() {
  try {
    const db = mongoose.connection.db;
    const lowerCaseCollection = 'customers';
    const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = existingCollections.map((collection) => collection.name);
    const hasLowerCaseCustomers = collectionNames.includes(lowerCaseCollection);
    const hasTitleCaseCustomers = collectionNames.includes(customersCollectionName);

    if (!hasLowerCaseCustomers) return;

    if (!hasTitleCaseCustomers) {
      await db.collection(lowerCaseCollection).rename(customersCollectionName);
      console.log(`Renamed ${lowerCaseCollection} collection to ${customersCollectionName}`);
      return;
    }

    const oldCustomers = await db.collection(lowerCaseCollection).find({}).toArray();
    if (oldCustomers.length === 0) return;

    await db.collection(customersCollectionName).bulkWrite(
      oldCustomers.map((customer) => ({
        replaceOne: {
          filter: { _id: customer._id },
          replacement: customer,
          upsert: true
        }
      }))
    );
    console.log(`Synced ${oldCustomers.length} customer records into ${customersCollectionName}`);
  } catch (err) {
    throw err;
  }
}

async function getCustomersCollection() {
  return mongoose.connection.collection(customersCollectionName);
}

async function migrateOilServiceRecordsCollection() {
  try {
    const db = mongoose.connection.db;
    const existingCollections = await db.listCollections(
      { name: vehiclesServicesCollectionName },
      { nameOnly: true }
    ).toArray();

    if (existingCollections.length === 0) {
      await db.createCollection(vehiclesServicesCollectionName);
      console.log(`Created ${vehiclesServicesCollectionName} collection`);
    }

    const legacyRecords = await db.collection('oilServiceRecords')
      .find({})
      .limit(1000)
      .toArray();

    if (legacyRecords.length === 0) return;

    const vehiclesServicesCollection = db.collection(vehiclesServicesCollectionName);
    const updates = legacyRecords.map((record) => ({
      updateOne: {
        filter: { legacyOilServiceRecordId: record._id },
        update: {
          $setOnInsert: {
            ...record,
            legacyOilServiceRecordId: record._id
          }
        },
        upsert: true
      }
    }));

    await vehiclesServicesCollection.bulkWrite(updates);
    console.log(`Synced ${updates.length} oil service records into ${vehiclesServicesCollectionName}`);
  } catch (err) {
    throw err;
  }
}

async function migrateInventoryUsageCollectionName() {
  try {
    const db = mongoose.connection.db;
    const legacyCollectionName = 'partsUsageLogs';
    const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = existingCollections.map((collection) => collection.name);
    const hasLegacyCollection = collectionNames.includes(legacyCollectionName);
    const hasInventoryUsageCollection = collectionNames.includes(inventoryUsageCollectionName);

    if (!hasLegacyCollection) return;

    if (!hasInventoryUsageCollection) {
      await db.collection(legacyCollectionName).rename(inventoryUsageCollectionName);
      console.log(`Renamed ${legacyCollectionName} collection to ${inventoryUsageCollectionName}`);
      return;
    }

    const legacyRecords = await db.collection(legacyCollectionName).find({}).toArray();
    if (legacyRecords.length === 0) return;

    await db.collection(inventoryUsageCollectionName).bulkWrite(
      legacyRecords.map((record) => ({
        replaceOne: {
          filter: { _id: record._id },
          replacement: record,
          upsert: true
        }
      }))
    );
    console.log(`Synced ${legacyRecords.length} parts usage records into ${inventoryUsageCollectionName}`);
  } catch (err) {
    throw err;
  }
}

function getInventoryUsageCollection() {
  return mongoose.connection.collection(inventoryUsageCollectionName);
}

function hashResetSecret(secret) {
  return crypto
    .createHash("sha256")
    .update(String(secret || ""))
    .digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function createResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function encodeSmtpLine(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function sendSmtpCommand(socket, command, expectedCodes) {
  return new Promise((resolve, reject) => {
    let response = "";

    const onData = (chunk) => {
      response += chunk.toString("utf8");
      const lines = response.trimEnd().split(/\r?\n/);
      const lastLine = lines[lines.length - 1] || "";

      if (!/^\d{3} /.test(lastLine)) {
        return;
      }

      socket.off("data", onData);
      socket.off("error", onError);

      const statusCode = Number(lastLine.slice(0, 3));
      if (!expectedCodes.includes(statusCode)) {
        reject(new Error(`SMTP command failed: ${lastLine}`));
        return;
      }

      resolve(response);
    };

    const onError = (err) => {
      socket.off("data", onData);
      reject(err);
    };

    socket.on("data", onData);
    socket.once("error", onError);

    if (command) {
      socket.write(`${command}\r\n`);
    }
  });
}

async function sendPasswordResetOtp(email, otp) {
  if (!smtpPass) {
    throw new Error("Email service is not configured. Set SMTP_PASS before requesting an OTP.");
  }

  const socket = tls.connect({
    host: smtpHost,
    port: smtpPort,
    servername: smtpHost
  });

  const message = [
    `From: Chai Huah Auto Parts & Service <${smtpFrom}>`,
    `To: ${email}`,
    "Subject: Password reset OTP",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Your password reset OTP is:",
    "",
    otp,
    "",
    "This OTP expires in 60 seconds. If you did not request this, you can ignore this email."
  ].join("\r\n");

  try {
    await sendSmtpCommand(socket, null, [220]);
    await sendSmtpCommand(socket, "EHLO localhost", [250]);
    await sendSmtpCommand(socket, "AUTH LOGIN", [334]);
    await sendSmtpCommand(socket, encodeSmtpLine(smtpUser), [334]);
    await sendSmtpCommand(socket, encodeSmtpLine(smtpPass), [235]);
    await sendSmtpCommand(socket, `MAIL FROM:<${smtpFrom}>`, [250]);
    await sendSmtpCommand(socket, `RCPT TO:<${email}>`, [250, 251]);
    await sendSmtpCommand(socket, "DATA", [354]);
    await sendSmtpCommand(socket, `${message}\r\n.`, [250]);
    await sendSmtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
}

// =====================
// Middleware
// =====================
app.use((req, res, next) => cors({
  origin(origin, callback) {
    return callback(null, !origin || isAllowedRequestOrigin(req));
  },
  credentials: true
})(req, res, next));
app.use(express.json());

function sessionCookieOptions(maxAge) {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction || process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge })
  };
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return "";
  try { return decodeURIComponent(cookie.slice(name.length + 1)); }
  catch { return ""; }
}

function getSessionId(req) { return getCookie(req, sessionCookieName); }

function isAllowedRequestOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  if (allowedFrontendOrigins.has(origin)) return true;
  const forwardedProto = String(req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
  return origin === `${forwardedProto}://${req.get("host")}`;
}

async function authenticateStaff(req, res, next) {
  try {
    const rawSessionId = getSessionId(req);
    if (!rawSessionId) return res.status(401).json({ message: "Authentication required." });
    const sessionHash = hashResetSecret(rawSessionId);
    const now = new Date();
    const session = await mongoose.connection.collection("staffSessions").findOne({
      sessionHash,
      expiresAt: { $gt: now }
    });
    if (!session) return res.status(401).json({ message: "Session is invalid or expired." });
    const staffUser = await mongoose.connection.collection("staffUsers").findOne({
      _id: session.staffUserId,
      isActive: { $ne: false }
    });
    if (!staffUser) {
      await mongoose.connection.collection("staffSessions").deleteOne({ _id: session._id });
      return res.status(401).json({ message: "Authentication required." });
    }
    req.staffUser = {
      id: staffUser._id,
      name: staffUser.name,
      email: staffUser.email,
      role: staffUser.role || "Staff"
    };
    req.staffSession = session;
    next();
  } catch (err) {
    console.error("Session validation failed:", err.message);
    res.status(500).json({ message: "Unable to validate session." });
  }
}

function requireSameOrigin(req, res, next) {
  if (!isAllowedRequestOrigin(req)) return res.status(403).json({ message: "Request origin is not allowed." });
  next();
}

const protectBusinessApi = [authenticateStaff, requireSameOrigin];

async function ensureMongoReady(req, res, next) {
  // The cron route authenticates its caller before opening a database connection.
  if (req.path.replace(/\/+$/, "") === "/cron/sms-reminders") return next();
  try {
    await ensureMongoConnection();
    startLocalSmsReminderScheduler();
    return next();
  } catch (err) {
    console.error("MongoDB API readiness failure.", getSafeMongoErrorDiagnostics(err));
    return res.status(503).json({ message: "The database is temporarily unavailable." });
  }
}

app.use("/api", ensureMongoReady);

// =====================
// Connect MongoDB
// =====================
async function ensureMongoConnection() {
  const readyState = mongoose.connection.readyState;
  if (mongoReadyPromise && (readyState === 1 || readyState === 2)) {
    return mongoReadyPromise;
  }
  if (!mongoUri) {
    mongoReadyPromise = null;
    const error = new Error("MongoDB is not configured.");
    console.error("MongoDB connection failure.", getSafeMongoErrorDiagnostics(error));
    throw error;
  }

  console.info("MongoDB connection attempt started.", { readyState });
  const connectionPromise = readyState === 2
    ? mongoose.connection.asPromise()
    : (readyState === 1 ? Promise.resolve(mongoose.connection) : mongoose.connect(mongoUri));
  const readinessPromise = connectionPromise.catch((err) => {
    console.error("MongoDB connection failure.", getSafeMongoErrorDiagnostics(err));
    throw err;
  }).then(async () => {
    console.info("MongoDB connection successfully established.", { readyState: mongoose.connection.readyState });
    console.info("MongoDB TTL index creation started.", { indexName: "staff_sessions_expiry" });
    try {
      await mongoose.connection.collection("staffSessions").createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: "staff_sessions_expiry" }
      );
    } catch (err) {
      console.error("MongoDB TTL index creation failure.", getSafeMongoErrorDiagnostics(err));
      throw err;
    }
    console.info("MongoDB TTL index creation successfully completed.", { indexName: "staff_sessions_expiry" });
    return mongoose.connection;
  }).catch((err) => {
    if (mongoReadyPromise === readinessPromise) mongoReadyPromise = null;
    throw err;
  });
  mongoReadyPromise = readinessPromise;
  return readinessPromise;
}

async function runExplicitMigrations() {
  await ensureMongoConnection();
  await migrateCustomersCollectionName();
  await migrateCustomerFields();
  await migrateOilServiceRecordsCollection();
  await migrateInventoryUsageCollectionName();
}

if (isMigrationCommand) {
  if (!process.argv.includes("--confirm")) {
    console.error("No migration was run. Use npm run migrate -- --confirm after reviewing the backup and verification procedure.");
    process.exitCode = 1;
  } else {
    runExplicitMigrations()
      .then(async () => {
        console.log("Explicit database migrations completed.");
        await mongoose.disconnect();
      })
      .catch(async () => {
        console.error("Database migration command failed. Review the migration target and server-side database logs.");
        await mongoose.disconnect().catch(() => {});
        process.exitCode = 1;
      });
  }
} else {
  ensureMongoConnection()
    .then(() => {
      console.log("MongoDB ready");
      startLocalSmsReminderScheduler();
    })
    .catch((err) => console.error(
      "Initial MongoDB readiness failure; API requests will return 503 until the database is ready.",
      getSafeMongoErrorDiagnostics(err)
    ));
}

function startLocalSmsReminderScheduler() {
  const isVercelRuntime = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
  if (isVercelRuntime || process.env.NODE_ENV === "production" || localSmsReminderSchedulerStarted) return;
  localSmsReminderSchedulerStarted = true;

  processDueSmsReminders()
    .then(logSmsReminderSummary)
    .catch((err) => console.error("Initial SMS reminder processing failed:", err.message));

  setInterval(() => {
    processDueSmsReminders()
      .then(logSmsReminderSummary)
      .catch((err) => console.error("SMS reminder processing failed:", err.message));
  }, smsReminderCheckIntervalMs);
}

function logSmsReminderSummary(result) {
  if (result.dueCount > 0) {
    console.log(`SMS reminders checked: ${result.sentCount} accepted, ${result.failedCount} failed, ${result.unknownCount} needs review, ${result.skippedCount} skipped`);
  }
}

// =====================
// Send the site root to the public login-first entry page.
// =====================
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// =====================
// STAFF LOGIN
// =====================
app.post('/api/auth/login', requireSameOrigin, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const staffUser = await mongoose.connection
      .collection('staffUsers')
      .findOne({ email, isActive: { $ne: false } });

    if (!staffUser || !verifyPassword(password, staffUser.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const rawSessionId = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    await mongoose.connection.collection("staffSessions").insertOne({
      sessionHash: hashResetSecret(rawSessionId),
      staffUserId: staffUser._id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionDurationMs),
      userAgent: String(req.get("user-agent") || "").slice(0, 500),
      ipAddress: req.ip
    });
    res.cookie(sessionCookieName, rawSessionId, sessionCookieOptions());
    res.json({ user: { id: staffUser._id, name: staffUser.name, email: staffUser.email, role: staffUser.role || "Staff" } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

app.post('/api/auth/logout', requireSameOrigin, async (req, res) => {
  try {
    const rawSessionId = getSessionId(req);
    if (rawSessionId) await mongoose.connection.collection("staffSessions").deleteOne({ sessionHash: hashResetSecret(rawSessionId) });
    res.clearCookie(sessionCookieName, sessionCookieOptions());
    res.json({ message: "Signed out successfully." });
  } catch (err) {
    console.error("Logout failed:", err.message);
    res.status(500).json({ message: "Unable to sign out." });
  }
});

app.get('/api/auth/session', authenticateStaff, (req, res) => {
  res.json({ user: req.staffUser });
});

// =====================
// STAFF PASSWORD RESET
// =====================
app.post('/api/auth/forgot-password', requireSameOrigin, async (req, res) => {
  try {
    const email = fixedPasswordResetEmail;

    const staffUser = await mongoose.connection
      .collection('staffUsers')
      .findOne({ email, isActive: { $ne: false } });

    if (!staffUser) {
      return res.json({
        message: "If this email belongs to a staff account, an OTP will be sent."
      });
    }

    const otp = generateOtp();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + resetOtpExpiryMs);

    await mongoose.connection.collection('passwordResetOtps').insertOne({
      email,
      staffUserId: staffUser._id,
      otpHash: hashResetSecret(otp),
      attempts: 0,
      verified: false,
      used: false,
      createdAt: now,
      expiresAt
    });

    await sendPasswordResetOtp(email, otp);

    res.json({
      message: "OTP sent. Please check your email.",
      expiresInSeconds: resetOtpExpiryMs / 1000
    });
  } catch (err) {
    console.error(err);
    const message = err.message.includes("Email service is not configured")
      ? err.message
      : "Unable to send OTP. Please check the email service settings and try again.";
    res.status(500).json({ message });
  }
});

app.post('/api/auth/verify-reset-otp', requireSameOrigin, async (req, res) => {
  try {
    const email = fixedPasswordResetEmail;
    const otp = String(req.body.otp || "").trim();

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter the 6-digit OTP." });
    }

    const now = new Date();
    const resetOtp = await mongoose.connection
      .collection('passwordResetOtps')
      .findOne({
        email,
        used: false,
        verified: false,
        expiresAt: { $gt: now }
      }, { sort: { createdAt: -1 } });

    if (!resetOtp) {
      return res.status(400).json({ message: "OTP has expired. Request another OTP." });
    }

    if (resetOtp.attempts >= resetOtpMaxAttempts) {
      return res.status(429).json({ message: "Too many incorrect attempts. Request another OTP." });
    }

    const isOtpValid = hashResetSecret(otp) === resetOtp.otpHash;

    if (!isOtpValid) {
      await mongoose.connection.collection('passwordResetOtps').updateOne(
        { _id: resetOtp._id },
        { $inc: { attempts: 1 } }
      );

      return res.status(400).json({ message: "Incorrect OTP. Please try again." });
    }

    const resetToken = createResetToken();
    await mongoose.connection.collection('passwordResetOtps').updateOne(
      { _id: resetOtp._id },
      {
        $set: {
          verified: true,
          resetTokenHash: hashResetSecret(resetToken),
          resetTokenExpiresAt: new Date(now.getTime() + resetTokenExpiryMs)
        }
      }
    );

    res.cookie(resetCookieName, resetToken, sessionCookieOptions(resetTokenExpiryMs));
    res.json({ message: "OTP verified. You can reset your password now." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unable to verify OTP. Please try again." });
  }
});

app.post('/api/auth/reset-password', requireSameOrigin, async (req, res) => {
  try {
    const email = fixedPasswordResetEmail;
    const resetToken = getCookie(req, resetCookieName);
    const newPassword = String(req.body.newPassword || "");

    if (!email || !resetToken || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const now = new Date();
    const resetOtp = await mongoose.connection
      .collection('passwordResetOtps')
      .findOne({
        email,
        verified: true,
        used: false,
        resetTokenHash: hashResetSecret(resetToken),
        resetTokenExpiresAt: { $gt: now }
      }, { sort: { createdAt: -1 } });

    if (!resetOtp) {
      return res.status(400).json({ message: "Reset session expired. Request another OTP." });
    }

    await mongoose.connection.collection('staffUsers').updateOne(
      { _id: resetOtp.staffUserId, email },
      {
        $set: {
          passwordHash: hashPassword(newPassword),
          updatedAt: now
        }
      }
    );

    await mongoose.connection.collection('passwordResetOtps').updateOne(
      { _id: resetOtp._id },
      { $set: { used: true, usedAt: now } }
    );

    res.clearCookie(resetCookieName, sessionCookieOptions());
    res.json({ message: "Password reset successfully. Please sign in with your new password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unable to reset password. Please try again." });
  }
});

// =====================
// CREATE customer
// =====================
app.use('/api/customers', ...protectBusinessApi);
app.post('/api/customers', async (req, res) => {
  try {
    const payload = buildCustomerPayload(req.body);
    validateCustomerFields(payload);
    const customersCollection = await getCustomersCollection();
    const result = await customersCollection.insertOne({
        customerName: payload.customerName,
        phoneNumber: payload.phoneNumber,
        vehicleBrand: payload.vehicleBrand,
        vehicleModel: payload.vehicleModel,
        carPlateNumber: payload.carPlateNumber,
        updatedAt: new Date()
      });

    res.status(201).json({ _id: result.insertedId, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// READ customers (with search)
// =====================
app.get('/api/customers', async (req, res) => {
  try {
    const search = req.query.search;

    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { vehicleBrand: { $regex: search, $options: 'i' } },
          { vehicle: { $regex: search, $options: 'i' } },
          { vehicleModel: { $regex: search, $options: 'i' } },
          { carPlate: { $regex: search, $options: 'i' } },
          { carPlateNumber: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const limit = parseInt(req.query.limit) || 100;

    const customersCollection = await getCustomersCollection();
    const customers = await customersCollection
      .find(query)
      .sort({ _id: -1 })   // latest first
      .limit(limit)        // only top N
      .toArray();

    res.json(customers);

  } catch (err) {
    res.status(500).send(err);
  }
});

// =====================
// UPDATE customer
// =====================
app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const payload = buildCustomerPayload(req.body);
    validateCustomerFields(payload);

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid customer id");
    }

    const customersCollection = await getCustomersCollection();
    await customersCollection
      .replaceOne(
        { _id: new ObjectId(id) },
        {
          _id: new ObjectId(id),
          customerName: payload.customerName,
          phoneNumber: payload.phoneNumber,
          vehicleBrand: payload.vehicleBrand,
          vehicleModel: payload.vehicleModel,
          carPlateNumber: payload.carPlateNumber,
          updatedAt: new Date()
        }
      );

    res.json({ _id: id, ...payload });

  } catch (err) {
    console.error(err);
    res.status(400).send(err.message);
  }
});

// =====================
// DELETE customer
// =====================
app.delete('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid customer id");
    }

    const customersCollection = await getCustomersCollection();
    const result = await customersCollection
      .deleteOne({ _id: new ObjectId(id) });

    res.send(result);

  } catch (err) {
    res.status(500).send(err);
  }
});

function buildUsagePayload(body) {
  const payload = {
    date: body.date,
    partCode: String(body.partCode || "").trim().toUpperCase(),
    partName: String(body.partName || "").trim(),
    qtyUsed: Number(body.qtyUsed),
    status: body.status
  };

  if (!payload.date || !payload.partCode || !payload.partName || payload.qtyUsed < 1) {
    throw new Error("Missing required parts usage fields");
  }

  if (!usageStatuses.includes(payload.status)) {
    throw new Error("Invalid parts usage status");
  }

  return payload;
}

// =====================
// CREATE parts usage log
// =====================
app.use('/api/parts-usage', ...protectBusinessApi);
app.post('/api/parts-usage', async (req, res) => {
  try {
    const payload = buildUsagePayload(req.body);
    const result = await getInventoryUsageCollection().insertOne({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      });

    res.status(201).json({ _id: result.insertedId, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// READ parts usage logs
// =====================
app.get('/api/parts-usage', async (req, res) => {
  try {
    const search = req.query.search;
    let query = {};

    if (search) {
      query = {
        $or: [
          { date: { $regex: search, $options: 'i' } },
          { partCode: { $regex: search, $options: 'i' } },
          { partName: { $regex: search, $options: 'i' } },
          { status: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const usageLogs = await getInventoryUsageCollection()
      .find(query)
      .sort({ date: -1, _id: -1 })
      .limit(200)
      .toArray();

    res.json(usageLogs);
  } catch (err) {
    res.status(500).send(err);
  }
});

// =====================
// UPDATE parts usage log
// =====================
app.put('/api/parts-usage/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const payload = buildUsagePayload(req.body);

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid usage log id");
    }

    await getInventoryUsageCollection()
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...payload, updatedAt: new Date() } }
      );

    res.json({ _id: id, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// DELETE parts usage log
// =====================
app.delete('/api/parts-usage/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid usage log id");
    }

    const result = await getInventoryUsageCollection()
      .deleteOne({ _id: new ObjectId(id) });

    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

function buildEnquiryPayload(body) {
  const payload = {
    date: body.date,
    customerName: String(body.customerName || "").trim(),
    phoneNumber: String(body.phoneNumber || "").trim(),
    itemsEnquired: String(body.itemsEnquired || "").trim(),
    followUpDate: body.followUpDate,
    status: body.status
  };

  if (!payload.date || !payload.customerName || !payload.phoneNumber || !payload.itemsEnquired || !payload.followUpDate) {
    throw new Error("Missing required enquiry fields");
  }

  validateCustomerName(payload.customerName);
  validateMalaysianPhoneNumber(payload.phoneNumber);

  if (!enquiryStatuses.includes(payload.status)) {
    throw new Error("Invalid enquiry status");
  }

  return payload;
}

// =====================
// CREATE customer enquiry
// =====================
app.use('/api/enquiries', ...protectBusinessApi);
app.post('/api/enquiries', async (req, res) => {
  try {
    const payload = buildEnquiryPayload(req.body);
    const result = await mongoose.connection
      .collection('customerEnquiries')
      .insertOne({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      });

    res.status(201).json({ _id: result.insertedId, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// READ customer enquiries
// =====================
app.get('/api/enquiries', async (req, res) => {
  try {
    const search = req.query.search;
    let query = {};

    if (search) {
      query = {
        $or: [
          { date: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { itemsEnquired: { $regex: search, $options: 'i' } },
          { followUpDate: { $regex: search, $options: 'i' } },
          { status: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const enquiries = await mongoose.connection
      .collection('customerEnquiries')
      .find(query)
      .sort({ date: -1, _id: -1 })
      .limit(200)
      .toArray();

    res.json(enquiries);
  } catch (err) {
    res.status(500).send(err);
  }
});

// =====================
// UPDATE customer enquiry
// =====================
app.put('/api/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const payload = buildEnquiryPayload(req.body);

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid enquiry id");
    }

    await mongoose.connection
      .collection('customerEnquiries')
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...payload, updatedAt: new Date() } }
      );

    res.json({ _id: id, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// DELETE customer enquiry
// =====================
app.delete('/api/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid enquiry id");
    }

    const result = await mongoose.connection
      .collection('customerEnquiries')
      .deleteOne({ _id: new ObjectId(id) });

    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

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

function addDaysToIsoDate(isoDate, dayCount) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + dayCount);
  return toIsoDate(date);
}

function subtractDaysFromIsoDate(isoDate, dayCount) {
  return addDaysToIsoDate(isoDate, -dayCount);
}

function getCurrentIsoDate() {
  return toIsoDate(new Date());
}

function getReminderStatus(
  reminderDate,
  dueDate,
  currentDate = getCurrentIsoDate(),
  smsReminderSentAt = "",
  hasNewerServiceRecord = false
) {
  if (currentDate > dueDate && !hasNewerServiceRecord) {
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

function buildSmsReminderMessage(record) {
  const vehicleDetails = [record.vehicleBrand, record.vehicleModel]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  const vehicleText = vehicleDetails
    ? `${record.vehiclePlateNumber} (${vehicleDetails})`
    : record.vehiclePlateNumber;

  return [
    "Chai Huah Auto Parts & Service:",
    `Hi ${record.customerName}, your vehicle ${vehicleText} is due for engine oil service on ${record.nextOilServiceDueDate}.`,
    "Please contact our workshop to arrange your service visit. Thank you."
  ].join(" ");
}

function normalizeSmsPhoneNumber(phoneNumber, options = {}) {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  const includePlus = options.includePlus !== false;
  let normalized = "";

  if (!digits) {
    return "";
  }

  if (digits.startsWith("60")) {
    normalized = digits;
  } else if (digits.startsWith("0")) {
    normalized = `60${digits.slice(1)}`;
  } else {
    normalized = digits;
  }

  return includePlus ? `+${normalized}` : normalized;
}

function createSmsError(message, outcome) {
  const error = new Error(message);
  error.smsOutcome = outcome;
  return error;
}

function sendMoceanSms(to, message) {
  return new Promise((resolve, reject) => {
    if (!moceanApiToken || !moceanFrom) {
      reject(createSmsError("SMS provider is not configured.", "failed"));
      return;
    }

    const requestBody = new URLSearchParams({
      "mocean-from": moceanFrom,
      "mocean-to": to,
      "mocean-text": message
    }).toString();

    const request = https.request(
      {
        hostname: "rest.moceanapi.com",
        path: "/rest/2/sms",
        method: "POST",
        headers: {
          Authorization: `Bearer ${moceanApiToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(requestBody)
        }
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => { data += chunk; });
        response.on("aborted", () => reject(createSmsError("SMS provider response was interrupted; outcome needs review.", "unknown")));
        response.on("error", () => reject(createSmsError("SMS provider response could not be read; outcome needs review.", "unknown")));
        response.on("end", () => {
          let parsed = {};
          try { parsed = JSON.parse(data); }
          catch { parsed = {}; }

          const firstMessage = Array.isArray(parsed.messages) ? parsed.messages[0] : {};
          if (response.statusCode === 202) {
            const hasMessageStatus = firstMessage.status !== undefined && firstMessage.status !== null;
            if (hasMessageStatus && Number(firstMessage.status) !== 0) {
              reject(createSmsError("SMS provider rejected the message.", "failed"));
              return;
            }
            resolve({
              provider: "mocean",
              messageId: firstMessage.msgid || parsed.msgid || "",
              status: "accepted"
            });
            return;
          }

          if (!response.statusCode || response.statusCode >= 500) {
            reject(createSmsError("SMS provider returned an inconclusive server response; outcome needs review.", "unknown"));
            return;
          }
          reject(createSmsError(`SMS provider rejected the request (HTTP ${response.statusCode}).`, "failed"));
        });
      }
    );

    const absoluteTimeout = setTimeout(() => {
      request.destroy(createSmsError("SMS request timed out; outcome needs review.", "unknown"));
    }, smsReminderRequestTimeoutMs);
    request.setTimeout(smsReminderRequestTimeoutMs, () => {
      request.destroy(createSmsError("SMS request timed out; outcome needs review.", "unknown"));
    });
    request.on("close", () => clearTimeout(absoluteTimeout));
    request.on("error", (error) => {
      reject(error.smsOutcome ? error : createSmsError("SMS connection failed; outcome needs review.", "unknown"));
    });
    request.write(requestBody);
    request.end();
  });
}

async function sendSmsReminder(record) {
  const message = buildSmsReminderMessage(record);

  if (!normalizeSmsPhoneNumber(record.phoneNumber)) {
    throw createSmsError("Customer phone number is missing.", "failed");
  }

  if (moceanApiToken) {
    return sendMoceanSms(normalizeSmsPhoneNumber(record.phoneNumber, { includePlus: false }), message);
  }

  if (process.env.NODE_ENV === "production") {
    throw createSmsError("SMS provider is not configured.", "failed");
  }

  const to = normalizeSmsPhoneNumber(record.phoneNumber);
  console.log(`[Mock SMS] To: ${to} | ${message}`);
  return {
    provider: "mock",
    messageId: `mock-${Date.now()}`,
    status: "sent"
  };
}

async function processDueSmsReminders(options = {}) {
  const today = getCurrentIsoDate();
  const collection = mongoose.connection.collection(vehiclesServicesCollectionName);
  const batchLimit = Number.isInteger(options.batchLimit) && options.batchLimit > 0
    ? Math.min(options.batchLimit, 100)
    : 100;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - smsReminderProcessingLeaseMs);
  const staleProcessingRecords = await collection.find({
    smsReminderStatus: "Processing",
    smsReminderProcessingUntil: { $lt: now }
  }, {
    projection: { _id: 1, smsReminderClaimToken: 1 }
  }).toArray();
  let staleRecoveryCount = 0;
  for (const staleRecord of staleProcessingRecords) {
    const staleToken = staleRecord.smsReminderClaimToken;
    const filter = {
      _id: staleRecord._id,
      smsReminderStatus: "Processing",
      smsReminderProcessingUntil: { $lt: now },
      ...(staleToken ? { smsReminderClaimToken: staleToken } : {})
    };
    const update = {
      $set: {
        smsReminderStatus: "Unknown",
        smsReminderLastError: "Processing lease expired before the SMS outcome was recorded. Review before retrying.",
        smsReminderOutcomeUnknownAt: now,
        updatedAt: now,
        ...(staleToken ? {
          "smsReminderAttemptHistory.$[attempt].status": "Unknown",
          "smsReminderAttemptHistory.$[attempt].completedAt": now,
          "smsReminderAttemptHistory.$[attempt].error": "Processing lease expired; provider outcome is uncertain."
        } : {})
      },
      $unset: {
        smsReminderProcessingAt: "",
        smsReminderClaimToken: "",
        smsReminderProcessingUntil: ""
      }
    };
    const recovery = await collection.updateOne(
      filter,
      update,
      staleToken ? { arrayFilters: [{ "attempt.claimToken": staleToken, "attempt.status": "Processing" }] } : {}
    );
    staleRecoveryCount += Number(recovery.modifiedCount || 0);
  }
  // Older records may have a processing timestamp but predate the status/lease fields.
  const legacyStaleResult = await collection.updateMany(
    {
      smsReminderStatus: { $exists: false },
      smsReminderSentAt: { $exists: false },
      smsReminderProcessingAt: { $lt: staleBefore }
    },
    {
      $set: {
        smsReminderStatus: "Unknown",
        smsReminderLastError: "Legacy processing state has an uncertain SMS outcome. Review before retrying.",
        smsReminderOutcomeUnknownAt: now,
        updatedAt: now
      },
      $unset: { smsReminderProcessingAt: "" }
    }
  );
  staleRecoveryCount += Number(legacyStaleResult.modifiedCount || 0);

  let records;
  if (options.retryRecordId) {
    records = await collection.find({
      _id: options.retryRecordId,
      reminderDate: { $lte: today },
      nextOilServiceDueDate: { $gte: today },
      smsReminderSentAt: { $exists: false },
      smsReminderStatus: "Failed"
    }).limit(1).toArray();
  } else {
    records = await collection
      .find({
        reminderDate: { $lte: today },
        nextOilServiceDueDate: { $gte: today },
        smsReminderSentAt: { $exists: false },
        $or: [
          { smsReminderStatus: "Pending" },
          { smsReminderStatus: { $exists: false } }
        ],
        smsReminderProcessingAt: { $exists: false }
      })
      .sort({ reminderDate: 1, _id: 1 })
      .limit(batchLimit)
      .toArray();
  }

  const result = {
    checkedAt: new Date(),
    dueCount: records.length,
    sentCount: 0,
    claimedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    unknownCount: staleRecoveryCount,
    supersededCount: 0,
    failures: []
  };

  for (const record of records) {
    const processingStartedAt = new Date();
    const claimToken = crypto.randomUUID();

    try {
      const claimFilter = {
        _id: record._id,
        smsReminderSentAt: { $exists: false },
        smsReminderProcessingAt: { $exists: false },
        ...(options.retryRecordId
          ? { smsReminderStatus: "Failed" }
          : { $or: [{ smsReminderStatus: "Pending" }, { smsReminderStatus: { $exists: false } }] })
      };
      const claimResult = await collection.findOneAndUpdate(
        claimFilter,
        {
          $set: {
            smsReminderStatus: "Processing",
            smsReminderProcessingAt: processingStartedAt,
            smsReminderProcessingUntil: new Date(processingStartedAt.getTime() + smsReminderProcessingLeaseMs),
            smsReminderClaimToken: claimToken,
            updatedAt: processingStartedAt
          },
          $inc: { smsReminderAttemptCount: 1 },
          $push: {
            smsReminderAttemptHistory: {
              claimToken,
              startedAt: processingStartedAt,
              status: "Processing"
            }
          }
        },
        { returnDocument: "after" }
      );
      const claimedRecord = claimResult && claimResult.value ? claimResult.value : claimResult;

      if (!claimedRecord) {
        result.skippedCount += 1;
        continue;
      }
      result.claimedCount += 1;

      const newerRecord = await collection.findOne({
        vehiclePlateNumber: claimedRecord.vehiclePlateNumber,
        $or: [
          { serviceDate: { $gt: claimedRecord.serviceDate } },
          { serviceDate: claimedRecord.serviceDate, _id: { $gt: claimedRecord._id } }
        ]
      });

      if (newerRecord) {
        await collection.updateOne(
          {
            _id: claimedRecord._id,
            smsReminderStatus: "Processing",
            smsReminderClaimToken: claimToken
          },
          {
            $set: {
              smsReminderStatus: "Superseded",
              smsReminderLastError: "A newer service record exists; this reminder was not sent.",
              updatedAt: new Date(),
              "smsReminderAttemptHistory.$[attempt].status": "Superseded",
              "smsReminderAttemptHistory.$[attempt].completedAt": new Date(),
              "smsReminderAttemptHistory.$[attempt].error": "A newer service record exists."
            },
            $unset: { smsReminderProcessingAt: "", smsReminderProcessingUntil: "", smsReminderClaimToken: "" }
          },
          { arrayFilters: [{ "attempt.claimToken": claimToken }] }
        );
        result.skippedCount += 1;
        result.supersededCount += 1;
        continue;
      }

      let smsResult;
      try {
        smsResult = await sendSmsReminder(claimedRecord);
      } catch (err) {
        const outcome = err.smsOutcome === "failed" ? "Failed" : "Unknown";
        const completedAt = new Date();
        const safeDescription = outcome === "Failed"
          ? (err.message || "SMS provider rejected the request.").slice(0, 240)
          : "SMS submission outcome is uncertain. Review before retrying.";
        await collection.updateOne(
          { _id: claimedRecord._id, smsReminderStatus: "Processing", smsReminderClaimToken: claimToken },
          {
            $set: {
              smsReminderStatus: outcome,
              smsReminderLastError: safeDescription,
              updatedAt: completedAt,
              [outcome === "Failed" ? "smsReminderFailedAt" : "smsReminderOutcomeUnknownAt"]: completedAt,
              "smsReminderAttemptHistory.$[attempt].status": outcome,
              "smsReminderAttemptHistory.$[attempt].completedAt": completedAt,
              "smsReminderAttemptHistory.$[attempt].error": safeDescription
            },
            $unset: { smsReminderProcessingAt: "", smsReminderProcessingUntil: "", smsReminderClaimToken: "" }
          },
          { arrayFilters: [{ "attempt.claimToken": claimToken }] }
        );
        console.error("SMS reminder attempt ended", {
          reminderId: String(claimedRecord._id),
          outcome,
          reason: safeDescription
        });
        if (outcome === "Failed") result.failedCount += 1;
        else result.unknownCount += 1;
        result.failures.push({ id: String(claimedRecord._id), outcome, message: safeDescription });
        continue;
      }

      const acceptedAt = new Date();
      try {
        const saved = await collection.updateOne(
          { _id: claimedRecord._id, smsReminderStatus: "Processing", smsReminderClaimToken: claimToken },
          {
            $set: {
              reminderStatus: "Reminder Sent",
              smsReminderSentAt: acceptedAt,
              smsReminderProvider: smsResult.provider,
              smsReminderMessageId: smsResult.messageId,
              smsReminderStatus: "Sent",
              smsReminderLastError: "",
              updatedAt: acceptedAt,
              "smsReminderAttemptHistory.$[attempt].status": "Sent",
              "smsReminderAttemptHistory.$[attempt].completedAt": acceptedAt,
              "smsReminderAttemptHistory.$[attempt].messageId": smsResult.messageId
            },
            $unset: { smsReminderProcessingAt: "", smsReminderProcessingUntil: "", smsReminderClaimToken: "" }
          },
          { arrayFilters: [{ "attempt.claimToken": claimToken }] }
        );
        if (!saved.matchedCount) {
          result.unknownCount += 1;
          result.failures.push({ id: String(claimedRecord._id), outcome: "Unknown", message: "Provider accepted the SMS but the claim expired before its result could be saved." });
          continue;
        }
        result.sentCount += 1;
      } catch (err) {
        // Keep the claim token and Processing state if MongoDB is unavailable. Lease recovery will mark it Unknown, never resend it.
        console.error("SMS accepted but reminder result could not be saved", { reminderId: String(claimedRecord._id) });
        try {
          await collection.updateOne(
            { _id: claimedRecord._id, smsReminderStatus: "Processing", smsReminderClaimToken: claimToken },
            {
              $set: {
                smsReminderStatus: "Unknown",
                smsReminderLastError: "Mocean accepted the SMS, but its result could not be saved. Review before retrying.",
                smsReminderOutcomeUnknownAt: new Date(),
                updatedAt: new Date(),
                "smsReminderAttemptHistory.$[attempt].status": "Unknown",
                "smsReminderAttemptHistory.$[attempt].error": "Result persistence failed after provider acceptance."
              },
              $unset: { smsReminderProcessingAt: "", smsReminderProcessingUntil: "", smsReminderClaimToken: "" }
            },
            { arrayFilters: [{ "attempt.claimToken": claimToken }] }
          );
        } catch (markErr) {
          // Leave Processing in place; the lease sweep will conservatively move it to Unknown.
        }
        result.unknownCount += 1;
      }
    } catch (err) {
      await collection.updateOne(
        { _id: record._id, smsReminderStatus: "Processing", smsReminderClaimToken: claimToken },
        {
          $set: {
            smsReminderStatus: "Failed",
            smsReminderLastError: "Unable to prepare the SMS attempt. Staff review is required.",
            smsReminderFailedAt: new Date(),
            updatedAt: new Date(),
            "smsReminderAttemptHistory.$[attempt].status": "Failed",
            "smsReminderAttemptHistory.$[attempt].error": "Unable to prepare the SMS attempt."
          },
          $unset: { smsReminderProcessingAt: "", smsReminderProcessingUntil: "", smsReminderClaimToken: "" }
        },
        { arrayFilters: [{ "attempt.claimToken": claimToken }] }
      );

      result.failedCount += 1;
      result.failures.push({
        id: String(record._id),
        outcome: "Failed",
        message: "Unable to prepare the SMS attempt. Staff review is required."
      });
    }
  }

  const remainingQuery = {
    reminderDate: { $lte: today },
    nextOilServiceDueDate: { $gte: today },
    smsReminderSentAt: { $exists: false },
    $or: [
      { smsReminderStatus: "Pending" },
      { smsReminderStatus: { $exists: false } }
    ],
    smsReminderProcessingAt: { $exists: false }
  };
  result.remainingCount = options.retryRecordId ? 0 : await collection.countDocuments(remainingQuery);
  result.hasMore = result.remainingCount > 0;

  return result;
}

function buildOilServicePayload(body) {
  const payload = {
    serviceDate: body.serviceDate,
    customerName: String(body.customerName || "").trim(),
    phoneNumber: String(body.phoneNumber || "").trim(),
    vehiclePlateNumber: String(body.vehiclePlateNumber || body.carPlateNumber || body.carPlate || "").trim().toUpperCase(),
    vehicleBrand: String(body.vehicleBrand || "").trim(),
    vehicleModel: String(body.vehicleModel || "").trim(),
    currentMileage: Number(body.currentMileage),
    oilServicePackage: body.oilServicePackage,
    engineOilType: String(body.engineOilType || "").trim(),
    partsUsed: String(body.partsUsed || "").trim()
  };

  if (
    !payload.serviceDate ||
    !payload.customerName ||
    !payload.phoneNumber ||
    !payload.vehiclePlateNumber ||
    !payload.vehicleBrand ||
    !payload.vehicleModel ||
    payload.currentMileage < 0 ||
    !oilServicePackages[payload.oilServicePackage]
  ) {
    throw new Error("Missing required oil service fields");
  }

  payload.nextOilServiceDueDate = addMonthsToIsoDate(
    payload.serviceDate,
    oilServicePackages[payload.oilServicePackage]
  );
  payload.reminderDate = subtractDaysFromIsoDate(payload.nextOilServiceDueDate, 14);
  payload.reminderStatus = getReminderStatus(
    payload.reminderDate,
    payload.nextOilServiceDueDate
  );

  return payload;
}

// =====================
// PROCESS due SMS service reminders
// =====================
app.post('/api/cron/sms-reminders', async (req, res) => {
  const authorization = String(req.get("authorization") || "");
  const bearerSecret = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!constantTimeSecretMatches(bearerSecret, process.env.CRON_SECRET || "")) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    await ensureMongoConnection();
    startLocalSmsReminderScheduler();
  } catch (err) {
    console.error("MongoDB is unavailable for the scheduled reminder request.");
    return res.status(503).json({ message: "The database is temporarily unavailable." });
  }

  try {
    const result = await processDueSmsReminders({ batchLimit: 25 });
    return res.json({
      checkedAt: result.checkedAt,
      dueCount: result.dueCount,
      claimedCount: result.claimedCount,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      supersededCount: result.supersededCount,
      failedCount: result.failedCount,
      unknownCount: result.unknownCount,
      remainingCount: result.remainingCount,
      hasMore: result.hasMore
    });
  } catch (err) {
    console.error("Scheduled SMS reminder processing failed:", err.message);
    return res.status(500).json({ message: "Unable to process scheduled SMS reminders." });
  }
});

app.use('/api/service-reminders', ...protectBusinessApi);
app.post('/api/service-reminders/process-sms', async (req, res) => {
  try {
    const result = await processDueSmsReminders();
    res.json(result);
  } catch (err) {
    console.error("Staff-triggered SMS reminder processing failed:", err.message);
    res.status(500).json({ message: "Unable to process SMS reminders." });
  }
});

app.post('/api/service-reminders/:id/retry', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid reminder ID." });
  }

  try {
    const collection = mongoose.connection.collection(vehiclesServicesCollectionName);
    const id = new ObjectId(req.params.id);
    const record = await collection.findOne({ _id: id });
    if (!record || record.smsReminderStatus !== "Failed" || record.smsReminderSentAt) {
      return res.status(409).json({ message: "Only failed reminders can be retried." });
    }
    const today = getCurrentIsoDate();
    if (record.reminderDate > today || record.nextOilServiceDueDate < today) {
      return res.status(409).json({ message: "This reminder is outside its eligible date window and cannot be retried." });
    }

    const result = await processDueSmsReminders({ retryRecordId: id });
    if (!result.claimedCount) {
      return res.status(409).json({ message: "The reminder could not be claimed for retry." });
    }
    return res.json({
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      unknownCount: result.unknownCount,
      skippedCount: result.skippedCount,
      supersededCount: result.supersededCount
    });
  } catch (err) {
    console.error("Manual SMS reminder retry failed:", err.message);
    return res.status(500).json({ message: "Unable to retry SMS reminder." });
  }
});

// =====================
// CREATE oil service record
// =====================
app.use('/api/oil-services', ...protectBusinessApi);
app.post('/api/oil-services', async (req, res) => {
  try {
    const payload = buildOilServicePayload(req.body);
    const collection = mongoose.connection.collection(vehiclesServicesCollectionName);
    const result = await collection.insertOne({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    await processDueSmsReminders();
    const savedRecord = await collection.findOne({ _id: result.insertedId });

    res.status(201).json(savedRecord || { _id: result.insertedId, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// READ oil service records
// =====================
app.get('/api/oil-services', async (req, res) => {
  try {
    const search = req.query.search;
    let query = {};

    if (search) {
      query = {
        $or: [
          { serviceDate: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { vehiclePlateNumber: { $regex: search, $options: 'i' } },
          { vehicleBrand: { $regex: search, $options: 'i' } },
          { vehicleModel: { $regex: search, $options: 'i' } },
          { oilServicePackage: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const records = await mongoose.connection
      .collection(vehiclesServicesCollectionName)
      .find(query)
      .sort({ serviceDate: -1, _id: -1 })
      .limit(500)
      .toArray();

    const normalized = records.map((record) => {
      const hasNewerServiceRecord = records.some((candidate) =>
        candidate.vehiclePlateNumber === record.vehiclePlateNumber &&
        (
          candidate.serviceDate > record.serviceDate ||
          (candidate.serviceDate === record.serviceDate && String(candidate._id) > String(record._id))
        )
      );
      const reminderStatus = getReminderStatus(
        record.reminderDate,
        record.nextOilServiceDueDate,
        getCurrentIsoDate(),
        ["Sent", "accepted", "sent"].includes(String(record.smsReminderStatus || ""))
          ? record.smsReminderSentAt
          : "",
        hasNewerServiceRecord
      );
      return {
        ...record,
        reminderStatus
      };
    });

    res.json(normalized);
  } catch (err) {
    res.status(500).send(err);
  }
});

// =====================
// UPDATE oil service record
// =====================
app.put('/api/oil-services/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const payload = buildOilServicePayload(req.body);

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid oil service id");
    }

    await mongoose.connection
      .collection(vehiclesServicesCollectionName)
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...payload, updatedAt: new Date() } }
      );

    res.json({ _id: id, ...payload });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// =====================
// DELETE oil service record
// =====================
app.delete('/api/oil-services/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid oil service id");
    }

    const result = await mongoose.connection
      .collection(vehiclesServicesCollectionName)
      .deleteOne({ _id: new ObjectId(id) });

    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// =====================
// Start server
// =====================
if (!isMigrationCommand) {
  app.listen(3000, () => {
    console.log("Server running on port 3000");
  });
}
