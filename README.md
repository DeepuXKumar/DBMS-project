# Hotel Management System — DBMS Project

A MongoDB-based hotel management project for rooms, guests, reservations, payments, staff, and chargeable services. The Node.js API also stores and derives the operational views used by the dashboard.

## Project contents

- `frontend/server.js` — MongoDB connection, API routes, and demo data seeding.
- `frontend/src/` — React dashboard.
- `frontend/.env.example` — MongoDB environment template.
- `mysql/` and `sqlserver/` — optional legacy SQL reference schemas.

## Run it

Start a local MongoDB server, or use a MongoDB Atlas connection string. The API creates the `HotelManagementDB` database and demo collections automatically when they are empty.

Sample data is for demonstration. The booking API rejects overlapping active reservations for the same room.

## Start the web frontend

The frontend uses **React** (Vite for local development). The Node.js/Express API connects it to whichever database you choose.

1. Install Node.js 18 or newer.
2. Start MongoDB locally or obtain an Atlas connection string.
3. Open a terminal in the `frontend` folder and install the packages:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

4. Edit `.env` inside the `frontend` folder. Set `DB_TYPE=mongodb`, `MONGODB_URI` to your MongoDB connection string, and `DB_NAME` to `HotelManagementDB`.
5. Start the React development server and API together from the `frontend` folder:

   ```powershell
   npm run dev
   ```

6. Open `http://localhost:5173` in your browser. Vite serves React and forwards `/api` requests to the Node API on port `3000`.

For a production-style run, use `npm run build` and then `npm start`; Express serves the compiled React app and API on port `3000`.

### Deploy to Vercel

1. Set the Vercel project **Root Directory** to `frontend`.
2. Add `MONGODB_URI` in the Vercel project’s Environment Variables using the connection string for a hosted MongoDB deployment, such as MongoDB Atlas. Do not use `localhost` or `127.0.0.1`; those refer to the Vercel function itself. Add `DB_NAME=HotelManagementDB` if you want to set the database name explicitly.
3. Ensure the MongoDB deployment permits connections from Vercel. If using an Atlas IP access list, configure an appropriate Vercel egress IP where available. For deployments without fixed egress IPs, Atlas may require allowing connections from any IP (`0.0.0.0/0`); use a dedicated database user with a strong password and least-privilege access.
4. Redeploy after saving the environment variables.

Vercel builds the Vite frontend and serves `/api/*` through the serverless function in `frontend/api/`. The local `.env` file is not uploaded to Vercel.

### Guest accounts

Guests can create an account with their name, email, and a password of at least 8 characters, then log in using that email and password. Passwords are stored as salted scrypt hashes. Login uses an HTTP-only session cookie backed by MongoDB; sessions expire after 7 days, and logging out removes the current session.

### Reservation workflow

1. Add the guest on the **Guests** page.
2. Open **Reservations**. The form loads guests and bookable rooms from the database.
3. Select the guest, room, and dates, then submit the form.
4. The browser sends the form to the Node.js API. The API calls the database reservation procedure, which checks dates, room capacity, and overlapping bookings before saving.
5. The reservation list and dashboard refresh with the saved information.

In short: **React renders the page → React sends a request → Node.js talks to MongoDB → the result comes back to React.** Database credentials stay in `frontend/.env`, not in browser code.

## Main relationships

- A guest can have many reservations; each reservation belongs to one guest and one room.
- A room can be reserved many times over time.
- A reservation can have multiple payments and service charges.
- Staff can be assigned to a reservation as the check-in/check-out handler.
- `vw_reservation_summary` and `vw_room_status` provide common operational views.

## Notes

Dates are stored as `DATE`, and the stay uses a half-open interval: check-in is included and check-out is excluded. Therefore a guest can check out on the same date the next guest checks in. Payment and reservation statuses are constrained to known values. The project intentionally keeps room availability as derived data rather than a manually edited field.
