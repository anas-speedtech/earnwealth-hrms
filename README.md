# EWS HRMS

Human Resource Management System built with Node.js, Express, React, TypeScript, MySQL 8, and Prisma.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Database:** MySQL 8 with Prisma ORM
- **Testing:** Jest + Supertest

## Prerequisites

- Node.js >= 18
- npm >= 9
- MySQL 8 (local or via Docker)

## Quick Start

```bash
# 1. Install all dependencies (root + workspaces)
npm run install:all

# 2. Start MySQL (choose one)
docker compose up -d
# OR: start your local MySQL service

# 3. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your database credentials and JWT secrets

# 4. Run database migrations
npm run db:migrate

# 5. Seed initial data
npm run db:seed

# 6. Start both frontend and backend in development
npm run dev
```

## Development

| Command | Description |
|---|---|
| `npm run dev` | Start both frontend (port 5173) and backend (port 5000) |
| `npm run dev:server` | Start backend only |
| `npm run dev:client` | Start frontend only |
| `npm run build` | Build both packages for production |
| `npm test` | Run server tests |
| `npm run db:studio` | Open Prisma Studio (database browser) |

## Project Structure

```
EWS-HRMS1/
├── package.json          # Root workspace config
├── server/               # Backend (Express + TypeScript)
│   └── src/
│       ├── index.ts      # Express entry point
│       ├── config/       # Env, database, CORS config
│       ├── middleware/   # Auth, validation, error handling
│       ├── routes/       # API route handlers
│       ├── services/     # Business logic
│       ├── utils/        # Helpers (password, JWT, email, PDF)
│       └── types/        # Shared TypeScript types
├── client/               # Frontend (React + Vite + TypeScript)
│   └── src/
│       ├── main.tsx      # React entry
│       ├── App.tsx       # Route tree
│       ├── pages/        # Page components (by role)
│       ├── components/   # Reusable UI + layout components
│       ├── contexts/     # React contexts (Auth, Toast)
│       ├── hooks/        # Custom hooks
│       ├── services/     # API client functions
│       └── types/        # Shared TypeScript types
├── prisma/
│   ├── schema.prisma     # Database schema definition
│   └── seed.ts           # Initial data seeder
└── docker-compose.yml    # MySQL 8 container
```

## Environment Variables

See `.env.example` (root), `server/.env.example`, and `client/.env.example` for all required variables.

**Never commit `.env` files to version control.**

## Default Ports

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- MySQL: localhost:3306

## License

Internal use — EWS.
