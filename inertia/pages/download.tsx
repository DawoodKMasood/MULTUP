import { Head, Link } from '@inertiajs/react'
import { useState, useRef, useEffect } from 'react'

interface Mirror {
  id: string
  name: string
  status: string
  expiresAt: string | null
  logo: string | null
}

interface FileData {
  id: string
  filename: string
  size: number
  mimeType: string | null
  createdAt: string
  status: string
}

interface DownloadPageProps {
  file: FileData
  mirrors: Mirror[]
}

interface FileStatusResponse {
  file: FileData
  mirrors: Mirror[]
}

const POLL_INTERVAL_MS = 5000

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(isoString: string): string {
  if (!isoString) return 'N/A'
  const date = new Date(isoString)
  const year = date.getUTCFullYear()
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${month} ${day}, ${year}, ${hours}:${minutes} UTC`
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    case 'uploading':
      return 'bg-yellow-100 text-yellow-800'
    case 'queued':
      return 'bg-gray-100 text-gray-800'
    case 'expired':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'Active'
    case 'failed':
      return 'Failed'
    case 'uploading':
      return 'Uploading'
    case 'queued':
      return 'Queued'
    case 'expired':
      return 'Expired'
    default:
      return status
  }
}

function shouldPoll(fileStatus: string, mirrors: Mirror[]): boolean {
  const pendingFileStatuses = ['pending', 'processing']
  const pendingMirrorStatuses = ['queued', 'uploading']

  if (pendingFileStatuses.includes(fileStatus)) {
    return true
  }

  return mirrors.some((m) => pendingMirrorStatuses.includes(m.status))
}

export default function Download({ file: initialFile, mirrors: initialMirrors }: DownloadPageProps) {
  const [file, setFile] = useState<FileData>(initialFile)
  const [mirrors, setMirrors] = useState<Mirror[]>(initialMirrors)
  const requestRef = useRef<number>(0)
  const mirrorsRef = useRef<Mirror[]>(initialMirrors)

  // Keep mirrorsRef in sync with mirrors state
  mirrorsRef.current = mirrors

  const hasAvailableMirrors = mirrors.some((m) => m.status === 'done')

  useEffect(() => {
    if (!shouldPoll(file.status, mirrorsRef.current)) {
      return
    }

    const poll = async () => {
      const currentRequest = ++requestRef.current

      try {
        const response = await fetch(`/api/v1/files/${file.id}/status`)

        if (response.status === 404) {
          return
        }

        if (!response.ok) {
          return
        }

        const data: FileStatusResponse = await response.json()

        if (currentRequest !== requestRef.current) {
          return
        }

        setFile(data.file)
        setMirrors(data.mirrors)
      } catch {
        // Silently ignore network errors during polling
      }
    }

    poll()

    const intervalId = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
      ++requestRef.current
    }
  }, [file.id, file.status])

  return (
    <>
      <Head title={`Download ${file.filename}`} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{file.filename}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
            <div>
              <span className="text-gray-500">Size:</span>
              <span className="ml-2 font-medium text-gray-900">{formatFileSize(file.size)}</span>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>
              <span className="ml-2 font-medium text-gray-900">{file.mimeType || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-gray-500">Uploaded:</span>
              <span className="ml-2 font-medium text-gray-900">{formatDate(file.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Content Cards */}
        <div className="space-y-6">
          {/* Mirrors Card */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Download Mirrors</h2>
              <p className="mt-1 text-sm text-gray-500">
                {hasAvailableMirrors
                  ? 'Select a mirror below to download your file'
                  : 'No download mirrors available at this time'}
              </p>
            </div>

            {mirrors.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No mirrors found for this file</div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mirror Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Expires
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Download
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {mirrors.map((mirror) => (
                        <tr key={mirror.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {mirror.logo ? (
                              <img
                                src={mirror.logo}
                                alt={mirror.name}
                                className="h-6 object-contain"
                              />
                            ) : (
                              mirror.name
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(
                                mirror.status
                              )}`}
                            >
                              {getStatusLabel(mirror.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {mirror.expiresAt ? formatDate(mirror.expiresAt) : 'Never'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {mirror.status === 'done' ? (
                              <Link
                                href={`/download/${file.id}/${mirror.id}`}
                                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                              >
                                Download
                              </Link>
                            ) : (
                              <span className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-400 text-sm font-medium rounded-md cursor-not-allowed transition-colors">
                                Unavailable
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-gray-100">
                  {mirrors.map((mirror) => (
                    <div key={mirror.id} className="p-4 hover:bg-gray-50">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-sm text-gray-500">Mirror Name:</div>
                        <div className="text-sm font-medium text-gray-900 text-right">
                          {mirror.logo ? (
                            <img
                              src={mirror.logo}
                              alt={mirror.name}
                              className="h-6 object-contain ml-auto"
                            />
                          ) : (
                            mirror.name
                          )}
                        </div>

                        <div className="text-sm text-gray-500">Status:</div>
                        <div className="text-right">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(
                              mirror.status
                            )}`}
                          >
                            {getStatusLabel(mirror.status)}
                          </span>
                        </div>

                        <div className="text-sm text-gray-500">Expires:</div>
                        <div className="text-sm text-gray-900 text-right">
                          {mirror.expiresAt ? formatDate(mirror.expiresAt) : 'Never'}
                        </div>

                        <div className="text-sm text-gray-500">Download:</div>
                        <div className="text-right">
                          {mirror.status === 'done' ? (
                            <Link
                              href={`/download/${file.id}/${mirror.id}`}
                              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                            >
                              Download
                            </Link>
                          ) : (
                            <span className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-400 text-sm font-medium rounded-md cursor-not-allowed transition-colors">
                              Unavailable
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
