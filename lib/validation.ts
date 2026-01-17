// Validation utilities for forms and file uploads

export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate uploaded file
 */
export function validateFile(file: File | null | undefined): ValidationResult {
  if (!file) {
    return { isValid: false, error: 'Please select a file' };
  }

  // Check file type (MIME type)
  const mimeTypeValid = ALLOWED_FILE_TYPES.includes(file.type);
  
  // Fallback: check file extension if MIME type is missing or invalid
  const fileName = file.name.toLowerCase();
  const hasValidExtension = fileName.endsWith('.pdf') || 
                           fileName.endsWith('.jpg') || 
                           fileName.endsWith('.jpeg') || 
                           fileName.endsWith('.png');

  if (!mimeTypeValid && !hasValidExtension) {
    return {
      isValid: false,
      error: 'Invalid file type. Please upload a PDF or image file (JPG, PNG)',
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File too large. Maximum size is 10MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    };
  }

  // Check if file is empty
  if (file.size === 0) {
    return { isValid: false, error: 'File is empty. Please select a valid file' };
  }

  return { isValid: true };
}

/**
 * Validate required field
 */
export function validateRequired(value: any, fieldName: string): ValidationResult {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }
  return { isValid: true };
}

/**
 * Validate positive number
 */
export function validatePositiveNumber(value: number | string, fieldName: string): ValidationResult {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num <= 0) {
    return { isValid: false, error: `${fieldName} must be a positive number` };
  }
  return { isValid: true };
}

/**
 * Validate date is not in the past (optional)
 */
export function validateDateNotPast(date: string, fieldName: string): ValidationResult {
  if (!date) {
    return { isValid: false, error: `${fieldName} is required` };
  }
  const dateObj = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) {
    return { isValid: false, error: `${fieldName} cannot be in the past` };
  }
  return { isValid: true };
}

/**
 * Validate due date is after invoice date
 */
export function validateDueDateAfterInvoiceDate(
  invoiceDate: string,
  dueDate: string
): ValidationResult {
  if (!invoiceDate || !dueDate) {
    return { isValid: true }; // Let required validation handle empty dates
  }
  const invoice = new Date(invoiceDate);
  const due = new Date(dueDate);
  if (due < invoice) {
    return { isValid: false, error: 'Due date must be on or after invoice date' };
  }
  return { isValid: true };
}

/**
 * Validate line items
 */
export function validateLineItems(items: Array<{ quantity: number; unit_price: number }>): ValidationResult {
  if (!items || items.length === 0) {
    return { isValid: false, error: 'At least one line item is required' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qtyResult = validatePositiveNumber(item.quantity, `Line item ${i + 1} quantity`);
    if (!qtyResult.isValid) return qtyResult;

    const priceResult = validatePositiveNumber(item.unit_price, `Line item ${i + 1} price`);
    if (!priceResult.isValid) return priceResult;
  }

  return { isValid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  return { isValid: true };
}
