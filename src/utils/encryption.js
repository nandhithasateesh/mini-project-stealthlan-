// AES-256 Encryption utilities for client-side encryption
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = 'stealthlan-secret-key-change-in-production-256bit';

export const encryptMessage = (message, customKey = null) => {
  try {
    const key = customKey || ENCRYPTION_KEY;
    const encrypted = CryptoJS.AES.encrypt(message, key).toString();
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return message;
  }
};

export const decryptMessage = (encryptedMessage, customKey = null) => {
  try {
    const key = customKey || ENCRYPTION_KEY;
    const decrypted = CryptoJS.AES.decrypt(encryptedMessage, key);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedMessage;
  }
};

export const generateEncryptionKey = () => {
  return CryptoJS.lib.WordArray.random(256/8).toString();
};

export const hashPassword = (password) => {
  return CryptoJS.SHA256(password).toString();
};

// Generate room encryption key from room credentials
export const generateRoomKey = (roomId, password, twoFactorPin) => {
  const combined = `${roomId}-${password}-${twoFactorPin}`;
  return CryptoJS.SHA256(combined).toString();
};

// Encrypt message for secure room
export const encryptSecureMessage = (message, roomId, password, twoFactorPin) => {
  try {
    const roomKey = generateRoomKey(roomId, password, twoFactorPin);
    const encrypted = CryptoJS.AES.encrypt(message, roomKey).toString();
    return encrypted;
  } catch (error) {
    console.error('Secure encryption error:', error);
    return message;
  }
};

// Decrypt message from secure room
export const decryptSecureMessage = (encryptedMessage, roomId, password, twoFactorPin) => {
  try {
    const roomKey = generateRoomKey(roomId, password, twoFactorPin);
    const decrypted = CryptoJS.AES.decrypt(encryptedMessage, roomKey);
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    return decryptedText || encryptedMessage;
  } catch (error) {
    console.error('Secure decryption error:', error);
    return encryptedMessage;
  }
};

// Screenshot detection - Desktop only (accurate) + Optional Mobile
export const detectScreenshot = (callback) => {
  let isInitialLoad = true;
  
  // Skip initial detection on page load
  setTimeout(() => {
    isInitialLoad = false;
  }, 3000); // Increased to 3 seconds

  // DESKTOP: Detect keyboard shortcuts (100% accurate - no false positives)
  const handleKeyPress = (e) => {
    if (isInitialLoad) return;
    
    // Windows: Win+Shift+S, PrtScn, Alt+PrtScn
    // Mac: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
    if (
      (e.key === 'PrintScreen') ||
      (e.shiftKey && e.metaKey && (e.key === '3' || e.key === '4' || e.key === '5')) ||
      (e.shiftKey && e.key === 'S' && e.metaKey) // Windows Snipping Tool
    ) {
      console.log('[Screenshot] Desktop screenshot key detected:', e.key);
      callback();
    }
  };

  // Add only keyboard listener (reliable, no false positives)
  document.addEventListener('keydown', handleKeyPress);

  // Cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyPress);
  };
};
