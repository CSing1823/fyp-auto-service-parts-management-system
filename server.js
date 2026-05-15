const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const tls = require('tls');
const { ObjectId } = require("mongodb");

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
const resetOtpExpiryMs = 60 * 1000;
const resetTokenExpiryMs = 10 * 60 * 1000;
const resetOtpMaxAttempts = 5;
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpUser = process.env.SMTP_USER || "chaihuahautoparts@gmail.com";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const fixedPasswordResetEmail = normalizeEmail(
  process.env.PASSWORD_RESET_EMAIL || "chaihuahautoparts@gmail.com"
);
const mongoUri = process.env.MONGODB_URI;

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
    console.error("Customer field migration failed:", err.message);
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
    console.error("Customers collection rename migration failed:", err.message);
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
    console.error("Vehicles & Services collection migration failed:", err.message);
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
    console.error("Inventory Usage collection rename migration failed:", err.message);
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
app.use(cors());
app.use(express.json());

// =====================
// Connect MongoDB
// =====================
if (!mongoUri) {
  console.error("Missing MONGODB_URI environment variable.");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(async () => {
    console.log("MongoDB connected");
    await migrateCustomersCollectionName();
    await migrateCustomerFields();
    await migrateOilServiceRecordsCollection();
    await migrateInventoryUsageCollectionName();
  })
  .catch(err => console.log(err));

// =====================
// Test route
// =====================
app.get('/', (req, res) => {
  res.send("Server is running");
});

// =====================
// STAFF LOGIN
// =====================
app.post('/api/auth/login', async (req, res) => {
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

    res.json({
      user: {
        id: staffUser._id,
        name: staffUser.name,
        email: staffUser.email,
        role: staffUser.role || "Staff"
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

// =====================
// STAFF PASSWORD RESET
// =====================
app.post('/api/auth/forgot-password', async (req, res) => {
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

app.post('/api/auth/verify-reset-otp', async (req, res) => {
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

    res.json({
      message: "OTP verified. You can reset your password now.",
      resetToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unable to verify OTP. Please try again." });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const email = fixedPasswordResetEmail;
    const resetToken = String(req.body.resetToken || "");
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

    res.json({ message: "Password reset successfully. Please sign in with your new password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unable to reset password. Please try again." });
  }
});

// =====================
// CREATE customer
// =====================
app.post('/api/customers', async (req, res) => {
  try {
    const payload = buildCustomerPayload(req.body);
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

  if (!enquiryStatuses.includes(payload.status)) {
    throw new Error("Invalid enquiry status");
  }

  return payload;
}

// =====================
// CREATE customer enquiry
// =====================
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

function getReminderStatus(reminderDate, dueDate, currentDate = getCurrentIsoDate()) {
  if (currentDate > dueDate) {
    return "Overdue";
  }

  if (currentDate < reminderDate) {
    return "Upcoming";
  }

  if (currentDate >= reminderDate && currentDate < dueDate) {
    const reminderTriggerDate = addDaysToIsoDate(reminderDate, 7);
    if (currentDate >= reminderTriggerDate) {
      return "Reminder Sent";
    }

    return "Due Soon";
  }

  return "Upcoming";
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
// CREATE oil service record
// =====================
app.post('/api/oil-services', async (req, res) => {
  try {
    const payload = buildOilServicePayload(req.body);
    const result = await mongoose.connection
      .collection(vehiclesServicesCollectionName)
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
      const reminderStatus = getReminderStatus(record.reminderDate, record.nextOilServiceDueDate);
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
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
