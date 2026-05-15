# FYP Workshop Management System

Web-based workshop management system for customers, vehicles, enquiries, reminders, inventory usage, and staff authentication.

## Requirements

- Node.js
- MongoDB database connection string

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` file using `.env.example` as a guide.

3. Start the server:

   ```bash
   npm start
   ```

4. Open the app from `index.html` or visit the local server routes used by the project.

## Staff User

Seed a staff user with:

```bash
npm run seed-staff -- staff@email.com password "Staff Name" "Role"
```

Make sure `MONGODB_URI` is set before running the seed command.
