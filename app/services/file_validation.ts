import uploadConfig from '#config/upload'

export const EXT_TO_MIME_TYPE: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  mp4: ['video/mp4'],
  webm: ['video/webm'],
  mov: ['video/quicktime'],
  pdf: ['application/pdf'],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/x-zip'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  csv: ['text/csv', 'text/plain'],
  json: ['application/json', 'text/plain'],
  bin: ['application/octet-stream'],
}

export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([a-z0-9]+)$/i)
  return match?.[1]?.toLowerCase() || 'bin'
}

export function isMimeTypeAllowed(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase()
  return uploadConfig.allowedMimeTypes.some(allowed =>
    normalized.startsWith(allowed.toLowerCase())
  )
}

export function validateExtensionMimeTypeMatch(ext: string, mimeType: string): boolean {
  const allowedTypes = EXT_TO_MIME_TYPE[ext.toLowerCase()]
  if (!allowedTypes) {
    return mimeType.toLowerCase() === 'application/octet-stream'
  }
  const normalized = mimeType.toLowerCase()
  return allowedTypes.some(type =>
    normalized === type || normalized.startsWith(`${type};`)
  )
}

export function sanitizeMetadata(value: string): string {
  return value.replace(/[\r\n\x00-\x1F\x7F]/g, '')
}

export function isValidExtensionFormat(ext: string): boolean {
  return /^[a-z0-9]+$/.test(ext)
}
