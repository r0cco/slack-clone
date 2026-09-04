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