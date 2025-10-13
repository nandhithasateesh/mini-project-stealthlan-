import express from 'express';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { 
  validateAadhaar, 
  extractAadhaarNumber, 
  extractNameFromAadhaar, 
  compareNames 
} from '../utils/verhoeff.js';
import { config } from '../config/config.js';
import { readUsers, writeUsers } from '../utils/fileHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `aadhaar-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  }
});

/**
 * Aadhaar Verification Endpoint
 * POST /api/aadhaar/verify
 */
router.post('/verify', upload.single('aadhaarImage'), async (req, res) => {
  let filePath = null;
  
  try {
    const { username, password, name } = req.body;
    
    // Validate required fields
    if (!username || !password || !name) {
      return res.status(400).json({ 
        success: false,
        error: 'Username, password, and name are required' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'Aadhaar card image is required' 
      });
    }

    filePath = req.file.path;
    console.log('[Aadhaar] Starting verification for:', username);
    console.log('[Aadhaar] Image path:', filePath);

    // Step 1: OCR - Extract text from image
    console.log('[Aadhaar] Step 1: Reading Aadhaar card with OCR...');
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
      logger: info => {
        if (info.status === 'recognizing text') {
          console.log(`[Aadhaar] OCR Progress: ${Math.round(info.progress * 100)}%`);
        }
      },
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /:.-',
    });

    console.log('[Aadhaar] OCR completed. Extracted text length:', text.length);
    console.log('[Aadhaar] ========== FULL OCR TEXT ==========');
    console.log(text);
    console.log('[Aadhaar] ====================================');

    // Step 2: Extract Aadhaar number
    console.log('[Aadhaar] Step 2: Extracting Aadhaar number...');
    const aadhaarNumber = extractAadhaarNumber(text);
    
    if (!aadhaarNumber) {
      // TEST MODE: Check if username is "testuser" for development
      if (username.toLowerCase() === 'testuser' || username.toLowerCase() === 'test') {
        console.log('[Aadhaar] TEST MODE: Bypassing Aadhaar validation for test user');
        // Delete file and continue with test mode
        fs.unlinkSync(filePath);
        filePath = null;
        
        // Skip to user creation with test mode
        const users = readUsers();
        const existingUser = users.find(u => u.username === username || u.email === username);
        
        if (existingUser) {
          return res.status(400).json({ 
            success: false,
            error: 'User already exists with this username or email' 
          });
        }

        const hashedPassword = await bcrypt.hash(password, config.SALT_ROUNDS);
        const userId = uuidv4();
        const newUser = {
          id: userId,
          email: username,
          username: username,
          password: hashedPassword,
          name: name,
          aadhaarVerified: true,
          verifiedAt: new Date().toISOString(),
          twoFactorEnabled: false,
          twoFactorSecret: null,
          createdAt: new Date().toISOString()
        };

        users.push(newUser);
        writeUsers(users);
        console.log('[Aadhaar] TEST MODE: User created successfully');

        const token = jwt.sign(
          { 
            userId: newUser.id,
            email: newUser.email,
            mode: 'normal'
          },
          config.JWT_SECRET,
          { expiresIn: config.TOKEN_EXPIRY }
        );

        return res.json({
          success: true,
          message: '✅ Test User Registered Successfully',
          token: token,
          user: {
            id: newUser.id,
            email: newUser.email,
            username: newUser.username,
            name: newUser.name,
            aadhaarVerified: true,
            twoFactorEnabled: false
          }
        });
      }
      
      // Delete file immediately
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        success: false,
        error: 'Could not find a valid Aadhaar number in the image. Please ensure the image is clear and contains the full Aadhaar card. TIP: For testing, use username "testuser" to bypass verification.' 
      });
    }

    console.log('[Aadhaar] Aadhaar number found:', aadhaarNumber.substring(0, 4) + '********');

    // Step 3: Validate Aadhaar number using Verhoeff algorithm
    console.log('[Aadhaar] Step 3: Validating Aadhaar number with Verhoeff checksum...');
    const isValidAadhaar = validateAadhaar(aadhaarNumber);
    
    if (!isValidAadhaar) {
      // Delete file immediately
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid Aadhaar number. The checksum validation failed.' 
      });
    }

    console.log('[Aadhaar] Aadhaar number is valid ✓');

    // Step 4: Extract name from Aadhaar
    console.log('[Aadhaar] Step 4: Extracting name from Aadhaar card...');
    const extractedName = extractNameFromAadhaar(text);
    
    if (!extractedName) {
      // Delete file immediately
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        success: false,
        error: 'Could not extract name from Aadhaar card. Please ensure the image is clear.' 
      });
    }

    console.log('[Aadhaar] Extracted name:', extractedName);

    // Step 5: Compare names
    console.log('[Aadhaar] Step 5: Comparing names...');
    const namesMatch = compareNames(name, extractedName);
    
    if (!namesMatch) {
      // Delete file immediately
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        success: false,
        error: `Name mismatch. Aadhaar shows "${extractedName}" but you entered "${name}". Please ensure they match.` 
      });
    }

    console.log('[Aadhaar] Names match ✓');

    // Step 6: Delete Aadhaar image immediately (privacy)
    console.log('[Aadhaar] Step 6: Deleting Aadhaar image for privacy...');
    fs.unlinkSync(filePath);
    filePath = null;
    console.log('[Aadhaar] Image deleted ✓');

    // Step 7: Check if user already exists
    const users = readUsers();
    const existingUser = users.find(u => u.username === username || u.email === username);
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User already exists with this username or email' 
      });
    }

    // Step 8: Hash password
    const hashedPassword = await bcrypt.hash(password, config.SALT_ROUNDS);

    // Step 9: Create new user and save to database
    const userId = uuidv4();
    const newUser = {
      id: userId,
      email: username, // Using username as email for Aadhaar users
      username: username,
      password: hashedPassword,
      name: name,
      aadhaarVerified: true,
      verifiedAt: new Date().toISOString(),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users);
    console.log('[Aadhaar] User saved to database ✓');

    // Step 10: Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.id,
        email: newUser.email,
        mode: 'normal'
      },
      config.JWT_SECRET,
      { expiresIn: config.TOKEN_EXPIRY }
    );

    console.log('[Aadhaar] ✅ Verification successful for:', username);

    // Return success with token
    res.json({
      success: true,
      message: '✅ Authorized and Registered Successfully',
      token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        name: newUser.name,
        aadhaarVerified: true,
        twoFactorEnabled: false
      }
    });

  } catch (error) {
    console.error('[Aadhaar] Verification error:', error.message || error);
    
    // Clean up file if it exists
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('[Aadhaar] Cleaned up file after error');
      } catch (cleanupError) {
        console.error('[Aadhaar] Error cleaning up file:', cleanupError);
      }
    }

    // Don't expose internal errors to client
    const clientError = error.message && !error.message.includes('ENOENT') 
      ? error.message 
      : 'Aadhaar verification failed. Please try again.';
    
    res.status(500).json({ 
      success: false,
      error: clientError
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Aadhaar verification service is running',
    tesseract: 'ready'
  });
});

export default router;
