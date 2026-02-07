import vine from '@vinejs/vine'
import uploadConfig from '#config/upload'

export const uploadValidator = vine.compile(
  vine.object({
    file: vine.file({
      size: uploadConfig.maxFileSize,
      extnames: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'avi', 'pdf', 'zip'],
    }),
  })
)
