# PharmaCare — Pharmacy Management System

A complete, production-ready Pharmacy Management System built with **PHP 8.3** (backend) and **React 19** (frontend).

---

## Features

| Module | Description |
|--------|-------------|
| Dashboard | Live KPIs, charts, alerts |
| POS | Barcode scanner, cart, split payment, hold/resume |
| Medicines | CRUD, image upload, CSV import/export, barcode |
| Batches | FIFO batch tracking, expiry management |
| Purchases | Purchase orders, supplier invoices, stock receiving |
| Inventory | Stock levels, adjustments, history |
| Sales | Full sales history, invoice detail, cancel |
| Returns | Sale & purchase returns, auto stock restore |
| Reports | 12 report types with CSV export |
| Customers | Loyalty points, purchase history |
| Suppliers | Balance tracking, purchase history |
| Users | CRUD, role-based permissions, activity log |
| Notifications | Real-time alerts, mark read, delete |
| Settings | Pharmacy info, tax, invoice, printer, backup |

---

## Tech Stack

- **Backend**: PHP 8.3, MVC, PDO, Custom JWT, Apache  
- **Frontend**: React 19, Vite, TailwindCSS 3, Recharts, React Router 7  
- **Database**: MySQL 8+  

---

## Installation

### Requirements

- XAMPP (PHP 8.3 + MySQL 8 + Apache)
- Node.js 20+
- Composer (optional — no third-party PHP packages required)

### 1 — Clone / Copy

Place the project folder at `C:\xampp\htdocs\pharm\`

### 2 — Database Setup

1. Open **phpMyAdmin** → Create database `pharm_db`
2. Import `backend/database/schema.sql`

### 3 — Backend Config

```bash
# Copy and edit environment file
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pharm_db
DB_USER=root
DB_PASS=

JWT_SECRET=change-this-to-a-random-64-char-secret
CORS_ORIGINS=http://localhost:5173
```

### 4 — Apache Virtual Host (optional)

The backend works at `http://localhost/pharm/backend/public` by default with XAMPP.

### 5 — Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost/pharm/backend/public
```

### 6 — Run Frontend

```bash
npm run dev
```

Open: `http://localhost:5173`

---

## Default Login

| Field | Value |
|-------|-------|
| Email | `owner@pharmacy.com` |
| Password | `Admin@123` |

**Change the password immediately after first login.**

---

## Project Structure

```
pharm/
├── backend/
│   ├── app/
│   │   ├── controllers/     # 18 controllers
│   │   ├── helpers/         # JWT, Response, Validator, Logger, Upload
│   │   ├── middleware/       # AuthMiddleware, RateLimitMiddleware
│   │   ├── routes/          # Router + api.php
│   │   └── config/          # database.php
│   ├── database/
│   │   └── schema.sql       # Complete DB schema + seed data
│   ├── public/
│   │   └── index.php        # Entry point
│   ├── storage/
│   │   ├── logs/
│   │   └── backups/
│   ├── uploads/             # Medicine images, logos
│   └── .env
│
└── frontend/
    ├── src/
    │   ├── pages/           # 18 page components
    │   ├── components/ui/   # Reusable UI components
    │   ├── context/         # AuthContext, ThemeContext
    │   ├── hooks/           # useApi, usePagination
    │   ├── layouts/         # MainLayout
    │   ├── services/        # Axios instance
    │   └── utils/           # format.js
    ├── .env
    └── vite.config.js
```

---

## Roles & Permissions

| Role | Access |
|------|--------|
| Owner | Full access to everything |
| Admin | Full access except owner-level settings |
| Pharmacist | Medicines, POS, Sales, Returns, Batches |
| Cashier | POS, Sales view, Customers |
| Inventory Manager | Inventory, Batches, Purchases, Reports |

---

## API Endpoints

All endpoints are prefixed with `/api/`.

### Authentication
```
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Core Resources
```
GET|POST       /api/medicines
GET|PUT|DELETE /api/medicines/{id}
GET            /api/medicines/search
GET            /api/medicines/low-stock
GET            /api/medicines/expired
GET            /api/medicines/near-expiry

GET|POST       /api/categories
GET|POST       /api/companies
GET|POST       /api/suppliers
GET|POST       /api/customers
GET|POST       /api/batches
GET|POST       /api/purchases
GET|POST       /api/sales
GET|POST       /api/returns

POST           /api/pos/sale
POST           /api/pos/hold
GET            /api/pos/held
GET            /api/pos/barcode/{code}

GET            /api/reports/{type}
GET            /api/reports/{type}/export
GET            /api/dashboard
GET            /api/dashboard/charts

GET|POST       /api/users
GET|PUT|DELETE /api/users/{id}
PUT            /api/users/{id}/permissions
PATCH          /api/users/{id}/toggle-active

GET|POST       /api/settings
GET            /api/settings/backup
GET            /api/notifications
PATCH          /api/notifications/{id}/read
PATCH          /api/notifications/read-all
DELETE         /api/notifications/{id}
```

---

## Security

- JWT access tokens (15 min) + refresh tokens (7 days, rotated)
- bcrypt password hashing (cost 12)
- SQL injection prevention via PDO prepared statements
- XSS protection via JSON-only API
- CORS whitelist from `.env`
- Rate limiting on auth endpoints (file-based)
- Permission checks on every protected endpoint
- Input validation on all write operations

---

## Build for Production

```bash
cd frontend
npm run build
```

Output in `frontend/dist/` — deploy to any static host or serve via Apache.

For backend, point Apache `DocumentRoot` to `backend/public/`.

---

## License

Commercial — All rights reserved.
