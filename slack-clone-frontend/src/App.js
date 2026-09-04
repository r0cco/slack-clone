import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');
const MOCK_USER_ID = '11111111-1111-1111-1111-111111111111';

function App() {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  // Channel Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  // Thread Drawer State
  const [activeThreadParent, setActiveThreadParent] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadInput, setThreadInput] = useState('');

  const messagesEndRef = useRef(null);
  const threadEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  // Fetch channels & socket listeners
  useEffect(() => {
    fetch('http://localhost:5000/api/channels')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setChannels(data);
          setActiveChannel(data[0]);
        }
      });

    socket.on('channel_created', (createdChannel) => {
      setChannels((prev) => [...prev, createdChannel]);
    });

    return () => socket.off('channel_created');
  }, []);

  // Fetch channel messages & listen for new messages / replies
  useEffect(() => {
    if (!activeChannel) return;

    fetch(`http://localhost:5000/api/channels/${activeChannel.id}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));

    socket.emit('join_channel', { newChannelId: activeChannel.id });

    const handleReceiveMessage = (newMessage) => {
      if (newMessage.channel_id === activeChannel.id && !newMessage.parent_id) {
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    const handleReceiveReply = (newReply) => {
      // Update thread messages if drawer is open for this parent
      setActiveThreadParent((currentParent) => {
        if (currentParent && currentParent.id === newReply.parent_id) {
          setThreadMessages((prev) => [...prev, newReply]);
        }
        return currentParent;
      });

      // Increment parent's reply count in message stream
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newReply.parent_id
            ? { ...msg, reply_count: (parseInt(msg.reply_count) || 0) + 1 }
            : msg
        )
      );
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('receive_thread_reply', handleReceiveReply);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('receive_thread_reply', handleReceiveReply);
    };
  }, [activeChannel]);

  // Open Thread Drawer
  const handleOpenThread = (parentMessage) => {
    setActiveThreadParent(parentMessage);
    fetch(`http://localhost:5000/api/messages/${parentMessage.id}/replies`)
      .then((res) => res.json())
      .then((data) => setThreadMessages(Array.isArray(data) ? data : []));
  };

  // Send Thread Reply
  const handleSendThreadReply = (e) => {
    e.preventDefault();
    if (!threadInput.trim() || !activeThreadParent) return;

    socket.emit('send_message', {
      channel_id: activeChannel.id,
      user_id: MOCK_USER_ID,
      content: threadInput,
      parent_id: activeThreadParent.id,
    });

    setThreadInput('');
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

  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    fetch('http://localhost:5000/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChannelName, description: newChannelDesc }),
    })
      .then((res) => res.json())
      .then((createdChannel) => {
        if (createdChannel?.id) {
          setActiveChannel(createdChannel);
          setIsModalOpen(false);
          setNewChannelName('');
          setNewChannelDesc('');
        }
      });
  };

  return (
    <div style={styles.appContainer}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <h3 style={styles.workspaceHeader}>Slack Workspace</h3>
        <div style={styles.sectionHeaderRow}>
          <span style={styles.sectionHeader}>Channels</span>
          <button style={styles.addChannelBtn} onClick={() => setIsModalOpen(true)}>+</button>
        </div>
        {channels.map((ch) => (
          <div
            key={ch.id}
            style={{
              ...styles.channelItem,
              backgroundColor: activeChannel?.id === ch.id ? '#1164A3' : 'transparent',
            }}
            onClick={() => {
              setActiveChannel(ch);
              setActiveThreadParent(null);
            }}
          >
            # {ch.name}
          </div>
        ))}
      </div>

      {/* Main Chat Stream */}
      <div style={styles.chatArea}>
        <div style={styles.chatHeader}>
          <h3>#{activeChannel ? activeChannel.name : ''}</h3>
        </div>

        <div style={styles.messageList}>
          {messages.map((msg) => (
            <div key={msg.id} style={styles.messageCard}>
              <div style={styles.avatar}>{msg.display_name?.[0]?.toUpperCase() || 'U'}</div>
              <div style={{ flex: 1 }}>
                <div style={styles.messageMeta}>
                  <strong>{msg.display_name || 'User'}</strong>
                </div>
                <div style={styles.messageText}>{msg.content}</div>

                {/* Reply / Thread Trigger */}
                <div style={styles.threadFooter}>
                  <button style={styles.replyButton} onClick={() => handleOpenThread(msg)}>
                    💬 {msg.reply_count > 0 ? `${msg.reply_count} replies` : 'Reply in thread'}
                  </button>
                </div>
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

      {/* Thread Slide-out Drawer */}
      {activeThreadParent && (
        <div style={styles.threadDrawer}>
          <div style={styles.drawerHeader}>
            <div>
              <h3 style={{ margin: 0 }}>Thread</h3>
              <small style={{ color: '#616061' }}>#{activeChannel?.name}</small>
            </div>
            <button style={styles.closeDrawerBtn} onClick={() => setActiveThreadParent(null)}>
              ✕
            </button>
          </div>

          <div style={styles.drawerBody}>
            {/* Parent Message Header */}
            <div style={styles.parentMessageCard}>
              <div style={styles.avatar}>
                {activeThreadParent.display_name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <strong>{activeThreadParent.display_name || 'User'}</strong>
                <div style={styles.messageText}>{activeThreadParent.content}</div>
              </div>
            </div>

            <div style={styles.threadDivider}>
              <span>{threadMessages.length} replies</span>
            </div>

            {/* Thread Replies Stream */}
            {threadMessages.map((reply) => (
              <div key={reply.id} style={styles.messageCard}>
                <div style={styles.avatar}>{reply.display_name?.[0]?.toUpperCase() || 'U'}</div>
                <div>
                  <strong>{reply.display_name || 'User'}</strong>
                  <div style={styles.messageText}>{reply.content}</div>
                </div>
              </div>
            ))}
            <div ref={threadEndRef} />
          </div>

          <form onSubmit={handleSendThreadReply} style={styles.inputContainer}>
            <input
              type="text"
              value={threadInput}
              onChange={(e) => setThreadInput(e.target.value)}
              placeholder="Reply..."
              style={styles.inputField}
            />
            <button type="submit" style={styles.sendButton}>Reply</button>
          </form>
        </div>
      )}

      {/* Create Channel Modal */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3>Create a Channel</h3>
            <form onSubmit={handleCreateChannel}>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="Channel Name"
                style={styles.modalInput}
                required
              />
              <input
                type="text"
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
                placeholder="Description"
                style={styles.modalInput}
              />
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.createBtn}>Create</button>
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
  messageText: { color: '#1D1C1D', lineHeight: '1.4' },
  threadFooter: { marginTop: '6px' },
  replyButton: { backgroundColor: 'transparent', border: 'none', color: '#1264A3', cursor: 'pointer', fontSize: '12px', padding: 0, fontWeight: 'bold' },
  inputContainer: { padding: '15px 20px', display: 'flex', gap: '10px', borderTop: '1px solid #E2E2E2' },
  inputField: { flex: 1, padding: '10px', border: '1px solid #868686', borderRadius: '4px', fontSize: '14px' },
  sendButton: { backgroundColor: '#007A5A', color: '#FFF', border: 'none', padding: '0 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  // Drawer Styles
  threadDrawer: { width: '360px', borderLeft: '1px solid #E2E2E2', display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' },
  drawerHeader: { height: '50px', borderBottom: '1px solid #E2E2E2', padding: '0 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  closeDrawerBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#616061' },
  drawerBody: { flex: 1, padding: '15px', overflowY: 'auto' },
  parentMessageCard: { display: 'flex', gap: '12px', paddingBottom: '12px' },
  threadDivider: { borderBottom: '1px solid #E2E2E2', color: '#616061', fontSize: '12px', margin: '15px 0', textAlign: 'center', lineHeight: '0.1em' },
  // Modal styles
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#FFF', width: '380px', borderRadius: '8px', padding: '24px' },
  modalInput: { width: '100%', padding: '10px', border: '1px solid #868686', borderRadius: '4px', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: { padding: '8px 16px', border: '1px solid #DDDDDD', borderRadius: '4px', backgroundColor: '#FFF', cursor: 'pointer' },
  createBtn: { padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#007A5A', color: '#FFF', cursor: 'pointer' },
};

export default App;