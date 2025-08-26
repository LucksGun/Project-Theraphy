// src/AdminPage.tsx
import React, { useState } from 'react';
import './admin.css';

export interface Feedback {
  id: number;
  userKey: string;
  rating: number;
  comments: string;
  created_at: string;
}

export interface ChatHistoryItem {
  id: number;
  userKey: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface AdminPageProps {
  WORKER_URL: string;
  authenticatedStaffKey: string | null;
}

interface ApiRequestBody {
  action: string;
  staffKey: string;
  [key: string]: any;
}

const AdminPage: React.FC<AdminPageProps> = ({ WORKER_URL, authenticatedStaffKey }) => {
  const [adminFeedback, setAdminFeedback] = useState<Feedback[]>([]);
  const [adminChatHistory, setAdminChatHistory] = useState<ChatHistoryItem[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

  // === Fetch Feedback ===
  const fetchFeedback = async () => {
    if (!authenticatedStaffKey) return;
    setIsAdminLoading(true);
    setAdminError(null);
    setAdminSuccess(null);

    const requestBody: ApiRequestBody = {
      action: 'adminListFeedback',
      staffKey: authenticatedStaffKey,
    };

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({ error: 'Invalid JSON' }));
      if (!res.ok || !data.success) throw new Error(data?.error || `Feedback fetch failed: ${res.status}`);
      setAdminFeedback(data.feedback || []);
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Failed to load feedback.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  // === Fetch Chat History ===
  const fetchChatHistory = async () => {
    if (!authenticatedStaffKey) return;
    setIsAdminLoading(true);
    setAdminError(null);
    setAdminSuccess(null);

    const requestBody: ApiRequestBody = {
      action: 'adminListChatHistory',
      staffKey: authenticatedStaffKey,
    };

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({ error: 'Invalid JSON' }));
      if (!res.ok || !data.success) throw new Error(data?.error || `History fetch failed: ${res.status}`);
      setAdminChatHistory(data.history || []);
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Failed to load chat history.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  // === Clear Chat History (per user) ===
  const handleClearChatHistory = async (userKey: string) => {
    if (!authenticatedStaffKey) return;
    if (!window.confirm(`Clear chat history for key ${userKey.substring(0, 8)}...?`)) return;

    setIsAdminLoading(true);
    setAdminError(null);
    setAdminSuccess(null);

    const requestBody: ApiRequestBody = {
      action: 'adminClearChatHistory',
      staffKey: authenticatedStaffKey,
      userKey: userKey,
    };

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({ error: 'Invalid JSON' }));
      if (!res.ok || !data.success) throw new Error(data?.error || `Clear failed: ${res.status}`);
      setAdminSuccess(data.message || `Chat history cleared for ${userKey.substring(0, 8)}...`);
      fetchChatHistory(); // refresh view
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Failed to clear chat history.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  // === Render ===
  return (
    <div className="admin-page">
      <h2>Admin Dashboard</h2>

      {adminError && <p className="admin-error">{adminError}</p>}
      {adminSuccess && <p className="admin-success">{adminSuccess}</p>}

      {/* Feedback Section */}
      <hr className="staff-separator" />
      <h4>Feedback Submissions</h4>
      <div className="admin-data-section">
        <button onClick={fetchFeedback} disabled={isAdminLoading || !authenticatedStaffKey} className="refresh-button">
          {isAdminLoading ? 'Loading...' : '🔄 Refresh Feedback'}
        </button>
        {isAdminLoading && <p className="admin-loading-text">Loading...</p>}
        {!isAdminLoading && !adminFeedback.length && <p>No feedback available.</p>}
        {adminFeedback.length > 0 && (
          <table className="feedback-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User Key</th>
                <th>Rating</th>
                <th>Comments</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {adminFeedback.map(fb => (
                <tr key={fb.id}>
                  <td>{fb.id}</td>
                  <td>{fb.userKey}</td>
                  <td>{fb.rating}</td>
                  <td>{fb.comments}</td>
                  <td>{new Date(fb.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Chat History Section */}
      <hr className="staff-separator" />
      <h4>Chat History</h4>
      <div className="admin-data-section">
        <button onClick={fetchChatHistory} disabled={isAdminLoading || !authenticatedStaffKey} className="refresh-button">
          {isAdminLoading ? 'Loading...' : '🔄 Refresh History'}
        </button>
        {isAdminLoading && <p className="admin-loading-text">Loading chat history...</p>}
        {!isAdminLoading && !adminChatHistory.length && <p>No chat history available.</p>}
        {adminChatHistory.length > 0 && (
          <div className="chat-history-list">
            {Object.entries(
              adminChatHistory.reduce((acc, item) => {
                if (!acc[item.userKey]) acc[item.userKey] = [];
                acc[item.userKey].push(item);
                return acc;
              }, {} as Record<string, ChatHistoryItem[]>)
            ).map(([userKey, messages]) => (
              <div key={userKey} className="chat-user-section">
                <div className="chat-user-header">
                  <strong>UserKey:</strong> <code>{userKey}</code>
                  <button
                    onClick={() => handleClearChatHistory(userKey)}
                    className="clear-history-button"
                    disabled={isAdminLoading}
                  >
                    🗑️ Clear History
                  </button>
                </div>
                {messages.map(item => (
                  <div key={item.id} className={`chat-entry role-${item.role}`}>
                    <div className="chat-meta">
                      <span className="chat-date">{new Date(item.created_at).toLocaleString()}</span>
                      <span className="chat-role">{item.role.toUpperCase()}</span>
                    </div>
                    <div className="chat-content">{item.content}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
