# Real-Time Slack Clone

A full-stack, real-time messaging application inspired by Slack. Built with React, Node.js, Express, Socket.io, and hosted PostgreSQL on AWS RDS.

---

## Architecture & Tech Stack

### Project Structure
```text
slack-clone/
├── slack-clone-backend/      # Express API & Socket.io Server
│   ├── db.js                 # PostgreSQL (pg pool) Connection with SSL
│   ├── server.js             # WebSocket Event Handlers & REST Endpoints
│   ├── .env                  # DB Credentials & Ports (Git ignored)
│   └── .env.example          # Template for backend environment variables
│
└── slack-clone-frontend/     # React Client
    ├── src/
    │   ├── App.js            # Workspace UI, Channel Switcher & Message Stream
    │   └── index.js
    └── package.json
```

## Technologies Used

Frontend: React, WebSockets (socket.io-client), Inline Styles.

Backend: Node.js, Express, Socket.io, dotenv, cors.

Database: AWS RDS PostgreSQL (pg pool driver with SSL enabled).

## Features Implemented

    Real-Time Messaging: Socket.io room-based communication allowing instantaneous message broadcasting without polling.

    Database Persistence: Real-time messages are stored in AWS RDS PostgreSQL tables (users, channels, messages).

    Dynamic Channel Switching: Users can switch between channels (#general, #random, #tech-talk). The app leaves the prior Socket room, joins the new one, and retrieves historical messages from PostgreSQL.

    Automatic Schema Initialization: Startup auto-migration in server.js verifies and creates required tables and seed channels if they do not exist.

    Auto-Scrolling Chat: Smart scroll-to-bottom behavior using React refs as new messages stream in.

## Getting Started
### Prerequisites

    Node.js (v14+ recommended)

    npm or yarn

    Running AWS RDS PostgreSQL Instance

# 1. Database & Environment Configuration

In slack-clone-backend/, create a .env file (refer to .env.example):
```
PORT=5000
DB_HOST=your-rds-endpoint.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_rds_password
DB_NAME=postgres
CLIENT_URL=http://localhost:3000
```

# 2. Backend Setup
Bash

```
cd slack-clone-backend
npm install
npm run dev # Starts Node server with auto-reload on port 5000
```

# 3. Frontend Setup

Open a second terminal window:

```
cd slack-clone-frontend
npm install
npm start # Starts React dev server on http://localhost:3000
```

## Database Schema Overview

    users: Contains user profiles (id, email, password_hash, display_name, avatar_url).

    channels: Workspace channels (id, name, description).

    messages: Message entries mapped to channels and users (id, channel_id, user_id, content, parent_id, reply_count, created_at).