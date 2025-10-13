// Verhoeff Algorithm for Aadhaar Number Validation
// Used by UIDAI (Unique Identification Authority of India)

// Multiplication table
const d = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// Permutation table
const p = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

// Inverse table
const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates an Aadhaar number using Verhoeff algorithm
 * @param {string} aadhaarNumber - 12 digit Aadhaar number
 * @returns {boolean} - true if valid, false otherwise
 */
export function validateAadhaar(aadhaarNumber) {
  // Remove spaces and validate format
  const cleanNumber = aadhaarNumber.replace(/\s/g, '');
  
  // Must be exactly 12 digits
  if (!/^\d{12}$/.test(cleanNumber)) {
    return false;
  }

  let c = 0;
  const myArray = cleanNumber.split('').map(Number).reverse();

  for (let i = 0; i < myArray.length; i++) {
    c = d[c][p[(i % 8)][myArray[i]]];
  }

  return c === 0;
}

/**
 * Extracts Aadhaar number from text
 * @param {string} text - OCR extracted text
 * @returns {string|null} - Aadhaar number if found, null otherwise
 */
export function extractAadhaarNumber(text) {
  console.log('[Verhoeff] Starting Aadhaar number extraction...');
  
  // Clean text - remove extra whitespace and normalize
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  console.log('[Verhoeff] Cleaned text length:', cleanedText.length);
  
  // Try multiple patterns (order matters - most specific first)
  const patterns = [
    // Pattern 1: 4-4-4 format with spaces (most common on Aadhaar)
    /\b\d{4}\s+\d{4}\s+\d{4}\b/g,
    // Pattern 2: 12 consecutive digits
    /\b\d{12}\b/g,
    // Pattern 3: 4-4-4 format with any separator
    /\b\d{4}[\s\-\.]+\d{4}[\s\-\.]+\d{4}\b/g,
    // Pattern 4: More lenient - any 12 digits with possible spaces/separators
    /\d{4}[\s\-\.]?\d{4}[\s\-\.]?\d{4}/g,
    // Pattern 5: Very lenient - find any sequence of 12 digits
    /\d{12}/g
  ];

  let allMatches = [];
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      console.log(`[Verhoeff] Found ${matches.length} matches with pattern: ${pattern}`);
      allMatches = allMatches.concat(matches);
    }
  }

  if (allMatches.length === 0) {
    console.log('[Verhoeff] No potential Aadhaar numbers found in text');
    return null;
  }

  // Clean and validate each match
  for (const match of allMatches) {
    // Remove all non-digit characters
    const cleanNumber = match.replace(/\D/g, '');
    
    // Must be exactly 12 digits
    if (cleanNumber.length === 12) {
      console.log(`[Verhoeff] Testing number: ${cleanNumber.substring(0, 4)}********`);
      if (validateAadhaar(cleanNumber)) {
        console.log(`[Verhoeff] ✓ Valid Aadhaar found: ${cleanNumber.substring(0, 4)}********`);
        return cleanNumber;
      } else {
        console.log(`[Verhoeff] ✗ Invalid checksum for: ${cleanNumber.substring(0, 4)}********`);
      }
    }
  }

  console.log('[Verhoeff] No valid Aadhaar number found after validation');
  return null;
}

/**
 * Extracts name from Aadhaar card text
 * @param {string} text - OCR extracted text
 * @returns {string|null} - Extracted name or null
 */
export function extractNameFromAadhaar(text) {
  console.log('[Verhoeff] Starting name extraction...');
  
  // Common patterns on Aadhaar cards
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  console.log(`[Verhoeff] Processing ${lines.length} lines of text`);
  console.log('[Verhoeff] First 10 lines:', lines.slice(0, 10));
  
  // Collect all potential English names (lines with only English letters and spaces)
  const potentialNames = [];
  const skipWords = ['government', 'india', 'uidai', 'aadhaar', 'unique', 'identification', 'authority', 'dob', 'date', 'birth', 'male', 'female', 'issue', 'vid', 'enrolment'];
  
  for (const line of lines) {
    // Must be English letters only, reasonable length
    if (line.length >= 3 && line.length <= 50 && /^[a-zA-Z\s]+$/.test(line)) {
      // Skip common Aadhaar card words
      const lowerLine = line.toLowerCase();
      if (!skipWords.some(word => lowerLine.includes(word))) {
        potentialNames.push(line);
        console.log(`[Verhoeff] Potential name found: ${line}`);
      }
    }
  }
  
  if (potentialNames.length === 0) {
    console.log('[Verhoeff] ✗ No valid English names found in text');
    return null;
  }
  
  // Return the longest name (usually the full name, not just initials)
  const longestName = potentialNames.reduce((longest, current) => 
    current.length > longest.length ? current : longest
  );
  
  console.log(`[Verhoeff] ✓ Selected name: ${longestName}`);
  return longestName;
}

/**
 * Normalizes name for comparison
 * @param {string} name - Name to normalize
 * @returns {string} - Normalized name
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^a-z\s]/g, ''); // Remove non-alphabetic characters
}

/**
 * Compares two names for similarity
 * @param {string} name1 - First name
 * @param {string} name2 - Second name
 * @returns {boolean} - true if names match
 */
export function compareNames(name1, name2) {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  // Exact match
  if (normalized1 === normalized2) {
    return true;
  }
  
  // Check if one name is contained in the other (for middle names, etc.)
  const words1 = normalized1.split(' ');
  const words2 = normalized2.split(' ');
  
  // Check if all words from shorter name exist in longer name
  const shorter = words1.length < words2.length ? words1 : words2;
  const longer = words1.length < words2.length ? words2 : words1;
  
  return shorter.every(word => longer.includes(word));
}
