const crypto = require("crypto");
const mongoose = require("mongoose");

const mongoUri = process.env.MONGODB_URI;

const [, , emailArg, passwordArg, nameArg = "Workshop Admin", roleArg = "Admin"] = process.argv;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function seedStaffUser() {
  const email = normalizeEmail(emailArg);
  const password = String(passwordArg || "");

  if (!email || !password) {
    console.error("Usage: npm run seed-staff -- staff@email.com password \"Staff Name\" \"Role\"");
    process.exit(1);
  }

  if (!mongoUri) {
    console.error("Missing MONGODB_URI environment variable.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  await mongoose.connection.collection("staffUsers").updateOne(
    { email },
    {
      $set: {
        name: nameArg,
        email,
        passwordHash: hashPassword(password),
        role: roleArg,
        isActive: true,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    { upsert: true }
  );

  console.log(`Staff user ready: ${email}`);
  await mongoose.disconnect();
}

seedStaffUser().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
