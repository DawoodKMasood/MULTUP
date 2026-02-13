import { Head } from '@inertiajs/react'
import UploadResults from '@/components/UploadResults'

export default function UploadComplete() {
  return (
    <>
      <Head title="Upload Complete" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Upload Complete</h1>
          <p className="mt-2 text-gray-600">Your files have been successfully uploaded</p>
        </div>

        {/* Content */}
        <UploadResults />
      </div>
    </>
  )
}
