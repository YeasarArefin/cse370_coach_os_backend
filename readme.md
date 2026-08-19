# Coaching Management System

A clean, modern web-based management system designed for coach. The platform replaces manual record-keeping by organizing all academic and administrative activities around **Batches**.

---

## Overview

The system provides a role-based management dashboard:

- **Teacher (Owner / Admin):** Publicly signs up, creates and manages batches, registers student accounts, assigns students to cohorts, marks attendance, posts announcements with automated email notifications, and oversees coaching operations.
- **Student:** Account is created and provisioned by the teacher. Students have read-only access to their assigned batches, attendance logs, notices, and academic performance.

---

## Tech Stack

### Frontend

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **UI Components:** [Shadcn UI](https://ui.shadcn.com/) + [Lucide Icons](https://lucide.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Server State & Caching:** [TanStack React Query](https://tanstack.com/query)
- **Authentication & Session:** [NextAuth.js](https://next-auth.js.org/) (Credentials Provider)

### Backend

- **Runtime:** [Node.js](https://nodejs.org/) with [Express.js](https://expressjs.com/)
- **Database:** [Aiven MySQL](https://aiven.io/mysql) / MySQL 8.x
- **Database Driver:** `mysql2/promise` (Direct raw SQL queries — no ORM)
- **Security:** `bcryptjs` for secure password hashing
- **Notifications:** `nodemailer` for batch and global announcement emails

---

## System Architecture

```text
Browser (Client UI)
       │
       ▼
Next.js Frontend (NextAuth + TanStack Query)
       │
       ▼ HTTP / REST API
Express.js Backend (Routes + Controllers)
       │
       ▼ Raw SQL
MySQL Database (Aiven)
```

The system strictly avoids unnecessary abstraction layers (no ORMs, repositories, or DTO mappers) to maintain clean, readable, and explainable code.

---

## Project Structure

```text
├── backend/
│   ├── controllers/      # Request handlers containing raw SQL logic
│   ├── routes/           # Express API route endpoints
│   ├── sql/              # MySQL database schema (schema.sql)
│   ├── utils/            # Utility helpers (e.g., mailer)
│   ├── db.js             # MySQL database connection pool (mysql2)
│   ├── server.js         # Express app entry point & middleware
│   └── package.json
│
├── frontend/
│   ├── app/              # Next.js App Router (pages, layouts, auth routes)
│   │   ├── (auth)/       # Sign in & Sign up pages
│   │   ├── (dashboard)/  # Protected management views (students, batches, attendance, notices)
│   │   └── api/          # NextAuth route handler
│   ├── components/       # UI & feature components (StudentTable, BatchDetailSheet, etc.)
│   ├── lib/              # Utility functions & NextAuth options
│   ├── types/            # TypeScript interfaces and data models
│   └── package.json
│
├── AGENTS.md             # Development & architectural rules
├── architecture.md       # High-level architecture documentation
├── coding-rules.md       # Coding conventions & constraints
├── design.md             # UI design system specification
├── progress.md           # Implementation checklist and track log
├── project.md            # Product overview & feature specification
└── tables.md             # Database schema design
```

---

## Features

- **Authentication & Role-Based Access:** Secure teacher sign-up and sign-in with password hashing (`bcryptjs`) and session management via NextAuth.
- **Batch Management:** Create, update, and manage cohorts with schedule information and enrolled student counts.
- **Student Roster:** Manage student profiles, phone numbers, addresses, and multi-batch enrollments.
- **Student-to-Batch Assignment:** Enroll students into multiple batches or remove them seamlessly using junction tables.
- **Attendance Tracking:** Mark batch-wise attendance (Present / Absent / Late), bulk marking actions, and real-time attendance rate metrics.
- **Notices & Email Broadcasts:** Publish global announcements or cohort-specific notices with automated email delivery via Nodemailer.
- **Minimalist & Accessible UI:** Clean paper-white design system with light/dark theme switching support.

---

## Getting Started & Setup Guide

### Prerequisites

Ensure you have the following installed on your machine:

- **Node.js** (v18.x or v20.x recommended)
- **npm** (or yarn / pnpm)
- **MySQL Database** (Local instance or Cloud provider like Aiven MySQL)

---

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd <repository-folder>
```

---

### Step 2: Database Setup

1. Create a MySQL database (e.g., `coaching_center`).
2. Run the SQL schema script located in `backend/sql/schema.sql` against your MySQL database to create the necessary tables (`users`, `teachers`, `batches`, `students`, `batch_students`, `attendance`, `notices`).

---

### Step 3: Backend Setup

1. Open a terminal and navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the `backend/` directory:

   ```env
   PORT=5000
   CLIENT_URL=http://localhost:3000

   # MySQL Database Configuration
   DB_HOST=your-mysql-host.aivencloud.com
   DB_PORT=your-mysql-port
   DB_USER=your-mysql-username
   DB_PASSWORD=your-mysql-password
   DB_NAME=your-database-name

   # SMTP Email Configuration (Optional / For Notices)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-gmail-app-password
   SMTP_FROM="Coaching Center" <your-email@gmail.com>
   ```

4. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend will be running at `http://localhost:5000`.

---

### Step 4: Frontend Setup

1. Open a new terminal and navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env.local` file in the `frontend/` directory:

   ```env
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secure-random-secret-key

   # Backend API URLs
   BACKEND_URL=http://localhost:5000
   BACKEND_URL=http://localhost:5000
   ```

4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Standard Workflow

1. **Sign Up as Teacher:** Open `http://localhost:3000` and click **Get Started** or **Register** to create a teacher account.
2. **Create Batches:** Navigate to the **Batches** page from the sidebar and add your classes/cohorts.
3. **Register Students:** Go to the **Students** page and add student records, assigning them to their primary batch.
4. **Assign Students:** Open batch details from the Batches page to assign additional existing students to the batch.
5. **Take Attendance:** Open the **Attendance** page, select a batch and date, and record attendance with one click.
6. **Send Notices:** Post notices from the **Notices** page with automatic email dispatches to students.
