// Error handling utilities for API calls and user-friendly error messages

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Convert API errors to user-friendly messages
 */
export function getErrorMessage(error: any): string {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Cannot connect to server. Please check your internet connection and try again.';
  }

  if (error instanceof Error && error.message.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }

  // HTTP status errors
  if (error?.status || error?.response?.status) {
    const status = error.status || error.response?.status;
    switch (status) {
      case 400:
        return error.response?.data?.error || error.message || 'Invalid request. Please check your input.';
      case 401:
        return 'Authentication failed. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'Resource not found. Please check the URL and try again.';
      case 408:
        return 'Request timed out. Please try again.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later or contact support.';
      case 502:
        return 'Server is temporarily unavailable. Please try again later.';
      case 503:
        return 'Service is temporarily unavailable. Please try again later.';
      default:
        return error.response?.data?.error || error.message || `Error ${status}. Please try again.`;
    }
  }

  // Supabase errors
  if (error?.code) {
    switch (error.code) {
      case 'PGRST116':
        return 'No data found.';
      case '23505':
        return 'This record already exists.';
      case '23503':
        return 'Invalid reference. Please check your selection.';
      default:
        return error.message || 'Database error. Please try again.';
    }
  }

  // Wafeq API errors
  if (error?.response?.data?.errors) {
    const errors = error.response.data.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.map((e: any) => e.detail || e.message).join('. ');
    }
  }

  // Generic error messages
  if (typeof error === 'string') {
    return error;
  }

  if (error?.message) {
    // Don't expose technical errors to users
    const message = error.message.toLowerCase();
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error. Please check your connection.';
    }
    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    // Return user-friendly version if it's already friendly
    if (!message.includes('error:') && !message.includes('failed:')) {
      return error.message;
    }
  }

  return 'An unexpected error occurred. Please try again or contact support.';
}

/**
 * Handle API response with validation
 */
export function validateApiResponse(response: any, expectedStructure?: 'array' | 'object'): {
  isValid: boolean;
  error?: string;
  data?: any;
} {
  if (!response) {
    return { isValid: false, error: 'No response from server' };
  }

  if (expectedStructure === 'array') {
    if (!Array.isArray(response)) {
      return { isValid: false, error: 'Invalid response format. Expected an array.' };
    }
    if (response.length === 0) {
      return { isValid: false, error: 'No data found' };
    }
  }

  if (expectedStructure === 'object') {
    if (typeof response !== 'object' || Array.isArray(response)) {
      return { isValid: false, error: 'Invalid response format. Expected an object.' };
    }
  }

  return { isValid: true, data: response };
}

/**
 * Create a timeout promise for fetch requests
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 30000
): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ]) as Promise<Response>;
}

/**
 * Safe API call wrapper with error handling
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  options: {
    onError?: (error: string) => void;
    timeout?: number;
  } = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await apiCall();
    return { success: true, data };
  } catch (error: any) {
    const errorMessage = getErrorMessage(error);
    if (options.onError) {
      options.onError(errorMessage);
    }
    return { success: false, error: errorMessage };
  }
}
