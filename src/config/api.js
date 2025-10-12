// API Configuration - Works on both localhost and LAN
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

export const API_ENDPOINTS = {
  // Auth endpoints
  REGISTER: `${API_BASE_URL}/api/auth/register`,
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  AADHAAR_REGISTER: `${API_BASE_URL}/api/aadhaar/verify`,
  SECURE_CREATE_SESSION: `${API_BASE_URL}/api/auth/secure/create-session`,
  SECURE_VALIDATE_SESSION: `${API_BASE_URL}/api/auth/secure/validate-session`,
  
  // Upload endpoint
  UPLOAD: `${API_BASE_URL}/api/upload`,
  
  // AI endpoint
  AI_CHAT: `${API_BASE_URL}/api/ai/chat`
};

export default API_BASE_URL;
