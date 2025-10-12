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

// Screenshot detection
export const detectScreenshot = (callback) => {
  // Detect common screenshot shortcuts ONLY
  const handleKeyPress = (e) => {
    // Windows: Win+Shift+S, PrtScn
    // Mac: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
    if (
      (e.key === 'PrintScreen') ||
      (e.shiftKey && e.metaKey && (e.key === '3' || e.key === '4' || e.key === '5')) ||
      (e.shiftKey && e.key === 'S' && e.metaKey) // Windows Snipping Tool (Win+Shift+S)
    ) {
      console.log('[Screenshot] Screenshot key detected:', e.key);
      callback();
    }
  };

  document.addEventListener('keydown', handleKeyPress);

  // Cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyPress);
  };
};
