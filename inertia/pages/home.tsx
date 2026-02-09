import { Head } from '@inertiajs/react'
import { useState, useRef, useCallback } from 'react'
import '~/css/upload.css'

interface PresignResponse {
  id: string
  url: string
  key: string
  filename: string
  mimeType: string
  size: number
  expiresIn: number
}

interface CompleteResponse {
  id: string
  filename: string
  status: string
  message: string
}

type UploadStatus = 'idle' | 'presigning' | 'uploading' | 'completing' | 'success' | 'error'

interface StatusConfig {
  text: string
  colorClass: string
}

const STATUS_CONFIG: Record<Exclude<UploadStatus, 'idle'>, StatusConfig> = {
  presigning: { text: 'Requesting upload URL...', colorClass: 'status-active' },
  uploading: { text: 'Uploading...', colorClass: 'status-active' },
  completing: { text: 'Finalizing upload...', colorClass: 'status-active' },
  success: { text: 'Upload complete!', colorClass: 'status-success' },
  error: { text: 'Upload failed', colorClass: 'status-error' },
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [uploadResult, setUploadResult] = useState<CompleteResponse | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const resetUpload = useCallback(() => {
    setSelectedFile(null)
    setUploadStatus('idle')
    setProgress(0)
    setErrorMessage('')
    setUploadResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadStatus('idle')
      setErrorMessage('')
      setUploadResult(null)
      setProgress(0)
    }
  }, [])

  const uploadToS3 = useCallback((presignData: PresignResponse, file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      abortControllerRef.current = new AbortController()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error during S3 upload. Check CORS configuration.')))
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

      xhr.open('PUT', presignData.url)
      xhr.setRequestHeader('Content-Type', presignData.mimeType)
      xhr.send(file)

      abortControllerRef.current.signal.addEventListener('abort', () => xhr.abort())
    })
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return

    setUploadStatus('presigning')
    setErrorMessage('')
    setProgress(0)

    try {
      const presignResponse = await fetch('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          size: selectedFile.size,
        }),
      })

      if (!presignResponse.ok) {
        const errorData = await presignResponse.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to get upload URL: ${presignResponse.status}`)
      }

      const presignData: PresignResponse = await presignResponse.json()

      setUploadStatus('uploading')
      await uploadToS3(presignData, selectedFile)

      setUploadStatus('completing')
      const completeResponse = await fetch('/api/v1/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: presignData.key,
        }),
      })

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to complete upload: ${completeResponse.status}`)
      }

      const completeData: CompleteResponse = await completeResponse.json()
      setUploadResult(completeData)
      setUploadStatus('success')
      setProgress(100)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed')
      setUploadStatus('error')
      setProgress(0)
    }
  }, [selectedFile, uploadToS3])

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
    resetUpload()
  }, [resetUpload])

  const getStatusDisplay = (): StatusConfig | null => {
    if (uploadStatus === 'idle') return null
    const config = STATUS_CONFIG[uploadStatus as Exclude<UploadStatus, 'idle'>]
    if (!config) return null
    return {
      text: uploadStatus === 'uploading' ? `${config.text} ${progress}%` : config.text,
      colorClass: config.colorClass,
    }
  }

  const statusDisplay = getStatusDisplay()
  const isProcessing = uploadStatus !== 'idle' && uploadStatus !== 'error'
  const canUpload = uploadStatus === 'idle' || uploadStatus === 'error'

  return (
    <>
      <Head title="MULTUP" />
      <div className="upload-container">
        <h1>File Upload</h1>

        <div className="upload-card">
          {uploadStatus === 'success' ? (
            <div className="success-view">
              <div className="success-icon">✓</div>
              <h2>Upload Successful!</h2>
              <p className="file-name">{uploadResult?.filename}</p>
              <p className="file-id">ID: {uploadResult?.id}</p>
              <p className="status-text">{uploadResult?.message}</p>
              <button onClick={resetUpload} className="btn-primary">
                Upload Another File
              </button>
            </div>
          ) : (
            <>
              <div className="file-input-section">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  disabled={isProcessing}
                  className="file-input"
                  id="file-input"
                />
                <label htmlFor="file-input" className="file-label">
                  {selectedFile ? selectedFile.name : 'Choose a file...'}
                </label>
                {selectedFile && (
                  <p className="file-size">Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                )}
              </div>

              {isProcessing && statusDisplay && (
                <div className="progress-section">
                  <div className={`status-text ${statusDisplay.colorClass}`}>{statusDisplay.text}</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="error-message">
                  <span className="error-icon">✕</span>
                  {errorMessage}
                </div>
              )}

              <div className="button-section">
                {canUpload ? (
                  <button onClick={handleUpload} disabled={!selectedFile} className="btn-primary">
                    {uploadStatus === 'error' ? 'Retry Upload' : 'Start Upload'}
                  </button>
                ) : (
                  <button onClick={handleCancel} className="btn-secondary">Cancel</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
