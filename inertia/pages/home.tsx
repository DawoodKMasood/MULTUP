import { Head } from '@inertiajs/react'
import Uppy from '@uppy/core'
import XHRUpload from '@uppy/xhr-upload'
import { useMemo, useState } from 'react'

export default function Home() {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<{ name: string; status: string }[]>([])

  const uppy = useMemo(() => {
    return new Uppy({
      restrictions: {
        maxFileSize: 1024 * 1024 * 1024,
        maxNumberOfFiles: 10,
      },
    }).use(XHRUpload, {
      endpoint: '/upload',
      formData: true,
      fieldName: 'file',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
  }, [])

  uppy.on('file-added', (file) => {
    setFiles((prev) => [...prev, { name: file.name, status: 'uploading' }])
    uppy.upload()
  })

  uppy.on('upload-success', (file) => {
    setFiles((prev) =>
      prev.map((f) => (f.name === file?.name ? { ...f, status: 'done' } : f))
    )
  })

  uppy.on('upload-error', (file) => {
    setFiles((prev) =>
      prev.map((f) => (f.name === file?.name ? { ...f, status: 'error' } : f))
    )
  })

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    droppedFiles.forEach((file) => {
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
      })
    })
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    selectedFiles.forEach((file) => {
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
      })
    })
  }

  return (
    <>
      <Head title="Homepage" />
      <div className="w-full max-w-3xl mx-auto p-5 pt-10">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-all hover:border-gray-400 ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
          }`}
        >
          <p className="text-gray-500">Drag & drop files here or click to browse</p>
          <input
            type="file"
            multiple
            onChange={handleFileInput}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>

        {files.length > 0 && (
          <div className="mt-5 border border-gray-200 rounded-lg overflow-hidden">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex justify-between items-center px-4 py-3 bg-white border-b border-gray-100 last:border-b-0"
              >
                <span className="truncate">{file.name}</span>
                <span
                  className={`text-xs uppercase px-2 py-1 rounded font-medium ${
                    file.status === 'uploading'
                      ? 'text-blue-600 bg-blue-100'
                      : file.status === 'done'
                      ? 'text-green-600 bg-green-100'
                      : 'text-red-600 bg-red-100'
                  }`}
                >
                  {file.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
