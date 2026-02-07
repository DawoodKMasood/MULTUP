import File from '#models/file'
import FileMirror from '#models/file_mirror'
import type { FileStatus } from '#models/file'
import type { MirrorStatus } from '#models/file_mirror'

export interface CreateFileData {
  id: string
  filename: string
  path: string
  size: number
  status?: FileStatus
}

export interface CreateMirrorData {
  fileId: string
  mirror: string
  status?: MirrorStatus
  url?: string | null
}

export class FileService {
  /**
   * Create a new file record
   */
  async create(data: CreateFileData): Promise<File> {
    return File.create({
      id: data.id,
      filename: data.filename,
      path: data.path,
      size: data.size,
      status: data.status || 'pending',
    })
  }

  /**
   * Find file by ID with mirrors
   */
  async findById(id: string): Promise<File | null> {
    return File.query().where('id', id).preload('mirrors').first()
  }

  /**
   * Update file status
   */
  async updateStatus(id: string, status: FileStatus): Promise<void> {
    const file = await File.find(id)
    if (file) {
      file.status = status
      await file.save()
    }
  }

  /**
   * Create a mirror record for a file
   */
  async createMirror(data: CreateMirrorData): Promise<FileMirror> {
    return FileMirror.create({
      fileId: data.fileId,
      mirror: data.mirror,
      status: data.status || 'queued',
      url: data.url || null,
      attempts: 0,
    })
  }

  /**
   * Update mirror status
   */
  async updateMirrorStatus(mirrorId: string, status: MirrorStatus, url?: string): Promise<void> {
    const mirror = await FileMirror.find(mirrorId)
    if (mirror) {
      mirror.status = status
      if (url !== undefined) {
        mirror.url = url
      }
      mirror.attempts += 1
      await mirror.save()
    }
  }

  /**
   * Get pending files for mirroring
   */
  async getPendingFiles(): Promise<File[]> {
    return File.query()
      .where('status', 'pending')
      .orWhere('status', 'processing')
      .preload('mirrors')
  }

  /**
   * Get mirrors by status
   */
  async getMirrorsByStatus(status: MirrorStatus): Promise<FileMirror[]> {
    return FileMirror.query().where('status', status).preload('file')
  }

  /**
   * Delete file and its mirrors
   */
  async delete(id: string): Promise<void> {
    const file = await File.find(id)
    if (file) {
      await file.delete()
    }
  }
}

export default new FileService()
