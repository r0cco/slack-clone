import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');
const MOCK_USER_ID = '11111111-1111-1111-1111-111111111111';

function App() {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 1. Fetch channels on mount & listen for real-time created channels
  useEffect(() => {
    fetch('http://localhost:5000/api/channels')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setChannels(data);
          setActiveChannel(data[0]);
        }
      })
      .catch((err) => console.error('Error fetching channels:', err));

    const handleChannelCreated = (createdChannel) => {
      setChannels((prev) => {
        const exists = prev.some((ch) => ch.id === createdChannel.id);
        return exists ? prev : [...prev, createdChannel];
      });
    };

    socket.on('channel_created', handleChannelCreated);

    return () => {
      socket.off('channel_created', handleChannelCreated);
    };
  }, []);

  // 2. Fetch messages on channel switch
  useEffect(() => {
    if (!activeChannel) return;

    fetch(`http://localhost:5000/api/channels/${activeChannel.id}/messages`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Error loading channel messages:', err);
        setMessages([]);
      });

    socket.emit('join_channel', { newChannelId: activeChannel.id });

    const handleReceiveMessage = (newMessage) => {
      if (newMessage.channel_id === activeChannel.id) {
        setMessages((prev) => {
          const exists = prev.some((msg) => msg.id === newMessage.id);
          return exists ? prev : [...prev, newMessage];
        });
      }
    };

    socket.on('receive_message', handleReceiveMessage);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
    };
  }, [activeChannel]);

  const handleSelectChannel = (channel) => {
    if (activeChannel && activeChannel.id === channel.id) return;

    socket.emit('join_channel', {
      previousChannelId: activeChannel ? activeChannel.id : null,
      newChannelId: channel.id,
    });
    setActiveChannel(channel);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChannel) return;

    socket.emit('send_message', {
      channel_id: activeChannel.id,
      user_id: MOCK_USER_ID,
      content: inputMessage,
      parent_id: null,
    });

    setInputMessage('');
  };

  // Handle Channel Creation Submit
  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    fetch('http://localhost:5000/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newChannelName,
        description: newChannelDesc,
      }),
    })
      .then((res) => res.json())
      .then((createdChannel) => {
        if (createdChannel && createdChannel.id) {
          setActiveChannel(createdChannel);
          setNewChannelName('');
          setNewChannelDesc('');
          setIsModalOpen(false);
        }
      })
      .catch((err) => console.error('Error creating channel:', err));
  };

  const formatTime = (dateString) => {
    if (!dateString) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(dateString);
    return isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={styles.appContainer}>
      {/* Sidebar Channels */}
      <div style={styles.sidebar}>
        <h3 style={styles.workspaceHeader}>Slack Workspace</h3>
        
        <div style={styles.sectionHeaderRow}>
          <span style={styles.sectionHeader}>Channels</span>
          <button style={styles.addChannelBtn} onClick={() => setIsModalOpen(true)}>
            +
          </button>
        </div>

        {channels.map((ch) => (
          <div
            key={ch.id}
            style={{
              ...styles.channelItem,
              backgroundColor: activeChannel && activeChannel.id === ch.id ? '#1164A3' : 'transparent',
            }}
            onClick={() => handleSelectChannel(ch)}
          >
            # {ch.name}
          </div>
        ))}
      </div>

      {/* Main Chat Area */}
      <div style={styles.chatArea}>
        <div style={styles.chatHeader}>
          <h3>#{activeChannel ? activeChannel.name : 'Loading...'}</h3>
        </div>

        <div style={styles.messageList}>
          {messages.map((msg, index) => (
            <div key={msg.id || index} style={styles.messageCard}>
              <div style={styles.avatar}>
                {msg.display_name ? msg.display_name[0].toUpperCase() : 'U'}
              </div>
              <div>
                <div style={styles.messageMeta}>
                  <strong>{msg.display_name || 'User'}</strong>
                  <span style={styles.timestamp}>{formatTime(msg.created_at)}</span>
                </div>
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
            placeholder={`Message #${activeChannel ? activeChannel.name : ''}`}
            style={styles.inputField}
          />
          <button type="submit" style={styles.sendButton}>
            Send
          </button>
        </form>
      </div>

      {/* Create Channel Modal Overlay */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3>Create a Channel</h3>
            <p style={styles.modalSubtext}>
              Channels are where your team communicates. They’re best when organized around a topic.
            </p>

            <form onSubmit={handleCreateChannel}>
              <label style={styles.label}>Name</label>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="e.g. plan-launch"
                style={styles.modalInput}
                autoFocus
                required
              />

              <label style={styles.label}>Description (optional)</label>
              <input
                type="text"
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
                placeholder="What's this channel about?"
                style={styles.modalInput}
              />

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.cancelBtn}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.createBtn}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' },
  sidebar: { width: '220px', backgroundColor: '#3F0E40', color: '#FFFFFF', padding: '15px' },
  workspaceHeader: { borderBottom: '1px solid #522653', paddingBottom: '10px', marginTop: 0 },
  sectionHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '15px 0 5px 0' },
  sectionHeader: { fontSize: '12px', color: '#9D83A0', textTransform: 'uppercase' },
  addChannelBtn: { backgroundColor: 'transparent', color: '#9D83A0', border: 'none', fontSize: '18px', cursor: 'pointer', fontWeight: 'bold' },
  channelItem: { padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' },
  chatHeader: { borderBottom: '1px solid #E2E2E2', padding: '0 20px', height: '50px', display: 'flex', alignItems: 'center' },
  messageList: { flex: 1, padding: '20px', overflowY: 'auto' },
  messageCard: { display: 'flex', gap: '12px', marginBottom: '16px' },
  avatar: { width: '36px', height: '36px', borderRadius: '4px', backgroundColor: '#611B66', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  messageMeta: { display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '4px' },
  timestamp: { fontSize: '11px', color: '#616061' },
  messageText: { color: '#1D1C1D', lineHeight: '1.4' },
  inputContainer: { padding: '20px', display: 'flex', gap: '10px' },
  inputField: { flex: 1, padding: '12px', border: '1px solid #868686', borderRadius: '4px', fontSize: '14px' },
  sendButton: { backgroundColor: '#007A5A', color: '#FFF', border: 'none', padding: '0 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  // Modal styles
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#FFF', width: '400px', borderRadius: '8px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
  modalSubtext: { fontSize: '13px', color: '#616061', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' },
  modalInput: { width: '100%', padding: '10px', border: '1px solid #868686', borderRadius: '4px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' },
  cancelBtn: { padding: '8px 16px', border: '1px solid #DDDDDD', borderRadius: '4px', backgroundColor: '#FFF', cursor: 'pointer' },
  createBtn: { padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#007A5A', color: '#FFF', fontWeight: 'bold', cursor: 'pointer' },
};

export default App;