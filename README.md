# Real-Time Slack Clone

A small full-stack Slack-style chat application with React, Express, PostgreSQL, JWT authentication, and Socket.IO real-time messaging.

## Features

- User registration and login with bcrypt password hashing.
- Short-lived access tokens and rotating refresh tokens.
- Protected channel and message API routes.
- Channel creation and channel switching.
- Persistent channel messages and threaded replies.
- Socket.IO rooms for real-time messages.
- PostgreSQL connections configured for AWS RDS SSL.

## Project Structure

```text
slack-clone/
├── slack-clone-backend/
│   ├── authHelpers.js
│   ├── db.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
└── slack-clone-frontend/
    ├── public/
    ├── src/
    │   ├── api.js
    │   ├── App.js
    │   └── App.css
    ├── .env.example
    └── package.json
```

## Requirements

- Node.js 14 or newer
- npm
- A PostgreSQL database, such as an AWS RDS PostgreSQL instance

## Configuration

Create `slack-clone-backend/.env` from [slack-clone-backend/.env.example](slack-clone-backend/.env.example):

```env
PORT=5000
DB_HOST=your_postgres_host
DB_PORT=5432
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_NAME=your_postgres_database
CLIENT_URL=http://localhost:3000
JWT_SECRET=your_long_random_jwt_secret
REFRESH_SECRET=your_different_long_random_refresh_secret
```

Create `slack-clone-frontend/.env` from [slack-clone-frontend/.env.example](slack-clone-frontend/.env.example):

```env
REACT_APP_API_URL=http://localhost:5000
```

Use different, long, randomly generated values for `JWT_SECRET` and `REFRESH_SECRET`. Do not commit `.env` files or real credentials.

## Run Locally

Install and start the backend:

```bash
cd slack-clone-backend
npm install
npm run dev
```

In a second terminal, install and start the frontend:

```bash
cd slack-clone-frontend
npm install
npm start
```

The frontend runs at `http://localhost:3000` and the backend listens at `http://localhost:5000` by default.

## Authentication

After login or registration, the backend returns an `accessToken` and `refreshToken`. The frontend stores them in `localStorage`, sends the access token as a bearer token, and requests a replacement pair when the access token expires.

The refresh token is stored as a SHA-256 hash in the `refresh_tokens` table and is revoked when it is rotated or when the logout endpoint is used.

## REST API

Public endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Authenticate a user |
| `POST` | `/api/auth/refresh` | Rotate access and refresh tokens |
| `POST` | `/api/auth/logout` | Revoke one refresh token |
| `POST` | `/api/auth/logout-all` | Revoke a user's refresh tokens |

Bearer-token endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/channels` | List channels |
| `POST` | `/api/channels` | Create a channel |
| `GET` | `/api/channels/:channelId/messages` | List top-level messages |
| `GET` | `/api/messages/:messageId/replies` | List thread replies |

## Socket.IO Events

The client authenticates the Socket.IO connection with the access token.

- `join_channel`: leaves the previous room and joins the selected channel room.
- `send_message`: persists a message or reply and broadcasts it to the channel.
- `receive_message`: emitted for a top-level message.
- `receive_thread_reply`: emitted for a thread reply.

## Database Tables

The backend expects PostgreSQL tables for users, channels, messages, and refresh tokens. Their main relationships are:

- `users`: account credentials and profile data.
- `channels`: available chat channels.
- `messages`: channel messages and optional threaded replies through `parent_id`.
- `refresh_tokens`: hashed refresh tokens, their user, and expiration time.

## Available Scripts

Backend:

- `npm run dev`: Start the backend with Nodemon.
- `npm test`: Placeholder test script; no backend tests are currently configured.

Frontend:

- `npm start`: Start the React development server.
- `npm run build`: Create a production build.
- `npm test`: Run the React test suite.