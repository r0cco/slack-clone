// slack-clone-frontend/src/api.js

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export async function fetchWithAuth(url, options = {}) {
  let accessToken = localStorage.getItem('accessToken') || localStorage.getItem('token');

  // Prevent sending 'undefined' or 'null' as a string token
  if (
    !accessToken ||
    accessToken === 'undefined' ||
    accessToken === 'null' ||
    accessToken.split('.').length !== 3
  ) {
    console.warn('No valid access token found in localStorage.');
    localStorage.clear();
    window.location.reload();
    return;
  }

  localStorage.setItem('accessToken', accessToken);

  options.headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  let response = await fetch(url, options);

  // If Access Token is expired (401), attempt to refresh it
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');

    if (!refreshToken) {
      localStorage.clear();
      window.location.reload();
      throw new Error('No refresh token available');
    }

    const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      // Retry the original failed request with the new access token
      options.headers.Authorization = `Bearer ${data.accessToken}`;
      response = await fetch(url, options);
    } else {
      // Refresh token is expired or revoked -> force logout
      localStorage.clear();
      window.location.reload();
      throw new Error('Session expired. Please log in again.');
    }
  }

  return response;
}