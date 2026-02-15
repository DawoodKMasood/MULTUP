import { Head } from '@inertiajs/react'
import FileUpload from '@/components/FileUpload';

export default function Home() {
  return (
    <>
      <Head title="File Mirroring Service" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Upload Files</h1>
          <p className="mt-2 text-gray-600">Select files to upload to multiple mirrors</p>
        </div>

        {/* Content */}
        <FileUpload />
      </div>
    </>
  )
}
