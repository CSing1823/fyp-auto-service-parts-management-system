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

3. Start the Express backend in a terminal:

   ```bash
   npm start
   ```

4. Open `public/index.html` with VS Code Live Server. The workspace Live Server setting serves `public/` at the frontend root on port `5501`.
5. Leave the backend running separately on port `3000` while using the frontend.

## Staff User

Seed a staff user with:

```bash
npm run seed-staff -- staff@email.com password "Staff Name" "Role"
```

Make sure `MONGODB_URI` is set before running the seed command.
