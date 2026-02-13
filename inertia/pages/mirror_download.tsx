import { Head, Link } from '@inertiajs/react'
import { useState } from 'react'

interface FileData {
  id: string
  filename: string
}

interface MirrorData {
  id: string
  name: string
  logo: string | null
}

interface MirrorDownloadPageProps {
  file: FileData
  mirror: MirrorData
  mirrorUrl: string
}

const appName = import.meta.env.VITE_APP_NAME || 'MULTUP'

export default function MirrorDownload({ file, mirror, mirrorUrl }: MirrorDownloadPageProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(mirrorUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Silently fail if clipboard API is not available
    }
  }

  return (
    <>
      <Head title={`Download ${file.filename} from ${mirror.name}`} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {mirror.logo ? (
              <img
                src={mirror.logo}
                alt={mirror.name}
                className="h-8 object-contain"
              />
            ) : (
              `Download from ${mirror.name}`
            )}
          </h1>
          <p className="mt-2 text-gray-600">
            File: <span className="font-medium text-gray-900">{file.filename}</span>
          </p>
        </div>

        {/* Content Cards */}
        <div className="space-y-6">
          {/* Download Card */}
          <div className="overflow-hidden">
            <div className="space-y-6">
              {/* Mirror URL Display */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mirror URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mirrorUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-50 rounded-md text-gray-600 text-sm focus:outline-none border border-gray-300"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors whitespace-nowrap"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Download Button */}
              <a
                href={mirrorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
              >
                {`Download from ${mirror.name}`}
              </a>

              {/* Warning Text */}
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg
                    className="w-5 h-5 text-yellow-600 flex shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-sm text-yellow-800">
                    <span className="font-semibold">Please note:</span> Upon visiting the above link, you will be taken to a third party website which is not affiliated with { appName }. Please make sure that this file link is received from a trusted source and you are aware of the content(s) you are downloading. Always scan any files you obtain from the internet using an antivirus application before opening.
                  </p>
                </div>
              </div>

              {/* Back to Mirrors Link */}
              <div>
                <Link
                  href={`/download/${file.id}`}
                  className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to all mirrors
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
