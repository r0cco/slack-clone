import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { fetchWithAuth } from './api';

let socket = null;

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));

  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Main Slack State
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  const messagesEndRef = useRef(null);

  // Initialize Socket connection on token available
  useEffect(() => {
    if (!token) return;

    socket = io('http://localhost:5000', {
      auth: { token },
    });

    socket.on('connect_error', () => {
      setAuthError('Session expired. Please log in again.');
      handleLogout();
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [token]);

  // Fetch Channels on Login
  useEffect(() => {
    if (!token) return;

    fetchWithAuth('http://localhost:5000/api/channels', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setChannels(data);
          setActiveChannel(data[0]);
        }
      });
  }, [token]);

  // Fetch Channel Messages
  useEffect(() => {
    if (!token || !activeChannel) return;

    fetchWithAuth(`http://localhost:5000/api/channels/${activeChannel.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));

    socket.emit('join_channel', { newChannelId: activeChannel.id });

    const handleReceiveMessage = (newMessage) => {
      if (newMessage.channel_id === activeChannel.id) {
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    return () => socket.off('receive_message', handleReceiveMessage);
  }, [activeChannel, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError('');

    const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
    const body = isRegistering
      ? { email, password, display_name: displayName }
      : { email, password };

    fetchWithAuth(`http://localhost:5000${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setAuthError(data.error);
        } else {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          setToken(data.token);
          setUser(data.user);
        }
      })
      .catch(() => setAuthError('Failed to connect to server'));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChannel) return;

    socket.emit('send_message', {
      channel_id: activeChannel.id,
      content: inputMessage,
    });

    setInputMessage('');
  };

  // Render Login / Register View
  if (!token) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authBox}>
          <h2>{isRegistering ? 'Sign up for Slack Clone' : 'Sign in to Slack Clone'}</h2>
          {authError && <div style={styles.errorBanner}>{authError}</div>}

          <form onSubmit={handleAuthSubmit}>
            {isRegistering && (
              <>
                <label style={styles.label}>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={styles.input}
                  required
                />
              </>
            )}

            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
            />

            <button type="submit" style={styles.authButton}>
              {isRegistering ? 'Register' : 'Sign In'}
            </button>
          </form>

          <p style={styles.toggleText}>
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span
              style={styles.toggleLink}
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError('');
              }}
            >
              {isRegistering ? 'Sign In' : 'Sign Up'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // Render Main Slack View
  return (
    <div style={styles.appContainer}>
      <div style={styles.sidebar}>
        <h3 style={styles.workspaceHeader}>Slack Workspace</h3>
        <div style={styles.userInfo}>
          <span>👤 {user?.display_name}</span>
          <button style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>

        <div style={styles.sectionHeader}>Channels</div>
        {channels.map((ch) => (
          <div
            key={ch.id}
            style={{
              ...styles.channelItem,
              backgroundColor: activeChannel?.id === ch.id ? '#1164A3' : 'transparent',
            }}
            onClick={() => setActiveChannel(ch)}
          >
            # {ch.name}
          </div>
        ))}
      </div>

      <div style={styles.chatArea}>
        <div style={styles.chatHeader}>
          <h3>#{activeChannel?.name || 'Loading...'}</h3>
        </div>

        <div style={styles.messageList}>
          {messages.map((msg, index) => (
            <div key={msg.id || index} style={styles.messageCard}>
              <div style={styles.avatar}>{msg.display_name?.[0]?.toUpperCase() || 'U'}</div>
              <div>
                <strong>{msg.display_name || 'User'}</strong>
                <div style={styles.messageText}>{msg.content}</div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} style={styles.inputContainer}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Message #${activeChannel?.name || ''}`}
            style={styles.inputField}
          />
          <button type="submit" style={styles.sendButton}>Send</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  authContainer: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F8F8', fontFamily: 'Arial, sans-serif' },
  authBox: { backgroundColor: '#FFF', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '350px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', marginTop: '12px' },
  input: { width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' },
  authButton: { width: '100%', backgroundColor: '#4A154B', color: '#FFF', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer' },
  errorBanner: { backgroundColor: '#FADBD8', color: '#78281F', padding: '8px', borderRadius: '4px', fontSize: '12px', marginBottom: '10px' },
  toggleText: { fontSize: '12px', textAlign: 'center', marginTop: '15px' },
  toggleLink: { color: '#1264A3', cursor: 'pointer', fontWeight: 'bold' },
  // App styles
  appContainer: { display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' },
  sidebar: { width: '220px', backgroundColor: '#3F0E40', color: '#FFFFFF', padding: '15px' },
  workspaceHeader: { borderBottom: '1px solid #522653', paddingBottom: '10px', marginTop: 0 },
  userInfo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '15px' },
  logoutBtn: { backgroundColor: 'transparent', border: '1px solid #9D83A0', color: '#FFF', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' },
  sectionHeader: { fontSize: '12px', color: '#9D83A0', margin: '15px 0 5px 0', textTransform: 'uppercase' },
  channelItem: { padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' },
  chatHeader: { borderBottom: '1px solid #E2E2E2', padding: '0 20px', height: '50px', display: 'flex', alignItems: 'center' },
  messageList: { flex: 1, padding: '20px', overflowY: 'auto' },
  messageCard: { display: 'flex', gap: '12px', marginBottom: '16px' },
  avatar: { width: '36px', height: '36px', borderRadius: '4px', backgroundColor: '#611B66', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  messageText: { color: '#1D1C1D', lineHeight: '1.4' },
  inputContainer: { padding: '20px', display: 'flex', gap: '10px' },
  inputField: { flex: 1, padding: '12px', border: '1px solid #868686', borderRadius: '4px', fontSize: '14px' },
  sendButton: { backgroundColor: '#007A5A', color: '#FFF', border: 'none', padding: '0 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
};

export default App;