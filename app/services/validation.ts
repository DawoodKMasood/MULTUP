import uploadConfig from '#config/upload'

export interface ValidationError {
  error: string
  details?: Record<string, unknown>
}

export type ValidationResult = { valid: true } | { valid: false; error: ValidationError }

export function success(): ValidationResult {
  return { valid: true }
}

export function failure(error: string, details?: Record<string, unknown>): ValidationResult {
  return { valid: false, error: { error, details } }
}

export function validateFileSize(size: number): ValidationResult {
  if (typeof size !== 'number' || size <= 0) {
    return failure('Size must be greater than 0')
  }
  if (size > uploadConfig.maxFileSize) {
    return failure('File size exceeds maximum allowed', { maxSize: uploadConfig.maxFileSize })
  }
  return success()
}

export function validateRequiredString(value: unknown, fieldName: string): ValidationResult {
  if (!value || typeof value !== 'string') {
    return failure(`${fieldName} is required`)
  }
  return success()
}
