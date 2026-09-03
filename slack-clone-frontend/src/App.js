import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');
const MOCK_USER_ID = '11111111-1111-1111-1111-111111111111';

function App() {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
  }, []);

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

  const formatTime = (dateString) => {
    if (!dateString) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(dateString);
    return isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={styles.appContainer}>
      <div style={styles.sidebar}>
        <h3 style={styles.workspaceHeader}>Slack Workspace</h3>
        <div style={styles.sectionHeader}>Channels</div>
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
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' },
  sidebar: { width: '220px', backgroundColor: '#3F0E40', color: '#FFFFFF', padding: '15px' },
  workspaceHeader: { borderBottom: '1px solid #522653', paddingBottom: '10px', marginTop: 0 },
  sectionHeader: { fontSize: '12px', color: '#9D83A0', margin: '15px 0 5px 0', textTransform: 'uppercase' },
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
};

export default App;