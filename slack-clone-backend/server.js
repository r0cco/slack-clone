const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Auto-create required tables on startup if they don't exist
async function initDb() {
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(100) NOT NULL,
          display_name VARCHAR(50),
          avatar_url TEXT,
          is_online BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS channels (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(80),
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          parent_id UUID REFERENCES messages(id) ON DELETE CASCADE,
          reply_count INT DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users (id, email, password_hash, full_name, display_name)
      VALUES ('11111111-1111-1111-1111-111111111111', 'dev@example.com', 'hash', 'Dev User', 'DevUser')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO channels (id, name, description)
      VALUES 
        ('00000000-0000-0000-0000-000000000001', 'general', 'General discussion'),
        ('00000000-0000-0000-0000-000000000002', 'random', 'Random chatter'),
        ('00000000-0000-0000-0000-000000000003', 'tech-talk', 'Tech discussion')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ Database tables verified/created on AWS RDS!');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

initDb();

// ------------------------------------------------------------
// SOCKET.IO REAL-TIME EVENT HANDLERS
// ------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('⚡ User connected:', socket.id);

  // 1. Join/Switch channel rooms
  socket.on('join_channel', (data) => {
    // Handles both string ID or { previousChannelId, newChannelId } object
    const newChannelId = typeof data === 'string' ? data : data.newChannelId;
    const previousChannelId = typeof data === 'object' ? data.previousChannelId : null;

    if (previousChannelId) {
      socket.leave(previousChannelId);
      console.log(`User ${socket.id} left channel ${previousChannelId}`);
    }

    if (newChannelId) {
      socket.join(newChannelId);
      console.log(`User ${socket.id} joined channel ${newChannelId}`);
    }
  });

  // 2. Handle incoming real-time messages
  socket.on('send_message', async (data) => {
    const { channel_id, user_id, content, parent_id } = data;

    try {
      // Step A: Save message to PostgreSQL
      const query = `
        INSERT INTO messages (channel_id, user_id, content, parent_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [channel_id, user_id, content, parent_id || null];
      const result = await pool.query(query, values);
      const savedMessage = result.rows[0];

      // Step B: Update reply_count if it is a threaded reply
      if (parent_id) {
        await pool.query(
          'UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1',
          [parent_id]
        );
      }

      // Step C: Fetch user display metadata to include in live message frame
      const userRes = await pool.query(
        'SELECT display_name, avatar_url FROM users WHERE id = $1',
        [user_id]
      );
      if (userRes.rows.length > 0) {
        savedMessage.display_name = userRes.rows[0].display_name;
        savedMessage.avatar_url = userRes.rows[0].avatar_url;
      }

      // Step D: Broadcast message to everyone in the channel
      io.to(channel_id).emit('receive_message', savedMessage);

    } catch (err) {
      console.error('Error saving message:', err.message);
      socket.emit('error', 'Failed to send message');
    }
  });

  // 3. Typing indicator
  socket.on('typing', ({ channel_id, username }) => {
    socket.to(channel_id).emit('user_typing', { username });
  });

  socket.on('disconnect', () => {
    console.log('🔥 User disconnected:', socket.id);
  });
});

// ------------------------------------------------------------
// REST API ENDPOINTS
// ------------------------------------------------------------

// Get list of all channels
app.get('/api/channels', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM channels ORDER BY name ASC');
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message, channels: [] });
  }
});

// Load historical messages for a specific channel
app.get('/api/channels/:channelId/messages', async (req, res) => {
  const { channelId } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.*, u.display_name, u.avatar_url 
       FROM messages m 
       LEFT JOIN users u ON m.user_id = u.id 
       WHERE m.channel_id = $1 AND m.parent_id IS NULL 
       ORDER BY m.created_at ASC 
       LIMIT 50`,
      [channelId]
    );
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message, messages: [] });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});