import env from '#start/env'

const uploadConfig = {
  /**
   * Maximum file size allowed for uploads (in bytes)
   * Default: 100MB
   */
  maxFileSize: 100 * 1024 * 1024,

  /**
   * Allowed MIME type prefixes for uploads
   */
  allowedMimeTypes: ['image/', 'video/', 'application/pdf', 'application/zip'],

  /**
   * Upload timeout in milliseconds
   * Default: 5 minutes
   */
  uploadTimeoutMs: 5 * 60 * 1000,

  /**
   * S3 bucket configuration
   */
  s3Bucket: env.get('S3_BUCKET'),

  /**
   * Base path for uploads in S3
   */
  uploadBasePath: 'uploads',
}

export default uploadConfig
