const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000' }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_access_secret_key';

// Auth Middleware for Express
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <TOKEN>"

  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT Verification Error:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

const {
  hashToken,
  generateAccessToken,
  generateAndSaveRefreshToken,
  REFRESH_SECRET,
} = require('./authHelpers');

// ----------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------

// 1. User Registration
app.post('/api/auth/register', async (req, res) => {
  const { email, password, display_name } = req.body;

  if (!email || !password || !display_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if email exists
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [email.toLowerCase(), password_hash, display_name]
    );

    const newUser = result.rows[0];
    const accessToken = generateAccessToken(newUser);
    const refreshToken = await generateAndSaveRefreshToken(newUser);

    res.status(201).json({ user: newUser, accessToken, refreshToken });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. User Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateAndSaveRefreshToken(user);

    delete user.password_hash;
    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ----------------------------------------------------
// PROTECTED API ROUTES
// ----------------------------------------------------

app.get('/api/channels', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM channels ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/api/channels', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const formattedName = name.trim().toLowerCase().replace(/\s+/g, '-');

  try {
    const result = await pool.query(
      'INSERT INTO channels (name, description) VALUES ($1, $2) RETURNING *',
      [formattedName, description || '']
    );
    io.emit('channel_created', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

app.get('/api/channels/:channelId/messages', authenticateToken, async (req, res) => {
  const { channelId } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.id, m.channel_id, m.user_id, m.content, m.parent_id, m.created_at,
              u.display_name, u.avatar_url
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1 AND m.parent_id IS NULL
       ORDER BY m.created_at ASC`,
      [channelId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/messages/:messageId/replies', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.channel_id, m.user_id, m.content, m.parent_id, m.created_at,
              u.display_name, u.avatar_url
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.parent_id = $1 ORDER BY m.created_at ASC`,
      [req.params.messageId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
});

// ----------------------------------------------------
// SOCKET.IO WITH AUTH
// ----------------------------------------------------

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  socket.on('join_channel', ({ previousChannelId, newChannelId }) => {
    if (previousChannelId) socket.leave(`channel_${previousChannelId}`);
    if (newChannelId) socket.join(`channel_${newChannelId}`);
  });

  socket.on('send_message', async (data) => {
    const { channel_id, content, parent_id } = data;
    const user_id = socket.user.id; // Extract user_id securely from JWT

    try {
      const insertResult = await pool.query(
        'INSERT INTO messages (channel_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [channel_id, user_id, content, parent_id || null]
      );

      const fullMsg = await pool.query(
        `SELECT m.id, m.channel_id, m.user_id, m.content, m.parent_id, m.created_at, u.display_name
         FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
        [insertResult.rows[0].id]
      );

      const savedMessage = fullMsg.rows[0];

      if (parent_id) {
        io.to(`channel_${channel_id}`).emit('receive_thread_reply', savedMessage);
      } else {
        io.to(`channel_${channel_id}`).emit('receive_message', savedMessage);
      }
    } catch (err) {
      console.error('Error saving message:', err.message);
    }
  });
});

// REFRESH TOKEN ENDPOINT
app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    // Verify JWT signature & expiration
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const tokenHash = hashToken(refreshToken);

    // Look for matching non-expired token in DB
    const tokenQuery = await pool.query(
      `SELECT * FROM refresh_tokens 
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
      [decoded.id, tokenHash]
    );

    if (tokenQuery.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or revoked refresh token' });
    }

    // Fetch user info
    const userResult = await pool.query('SELECT id, email, display_name FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];

    // Optional: Refresh Token Rotation (Delete old, issue new)
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    const newRefreshToken = await generateAndSaveRefreshToken(user);
    const newAccessToken = generateAccessToken(user);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

// LOGOUT (REVOKE SINGLE SESSION)
app.post('/api/auth/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const tokenHash = hashToken(refreshToken);
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// LOGOUT ALL DEVICES (REVOKE ALL SESSIONS)
app.post('/api/auth/logout-all', async (req, res) => {
  const { userId } = req.body; // Protect with auth middleware in production

  try {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    res.json({ message: 'Logged out from all devices' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke all sessions' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));