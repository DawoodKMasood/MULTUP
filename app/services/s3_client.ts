import env from '#start/env'
import { S3Client } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: env.get('S3_REGION'),
  credentials: {
    accessKeyId: env.get('S3_ACCESS_KEY_ID'),
    secretAccessKey: env.get('S3_SECRET_ACCESS_KEY'),
  },
  endpoint: env.get('S3_ENDPOINT') || undefined,
  forcePathStyle: env.get('S3_FORCE_PATH_STYLE') ?? false,
})

export default s3Client
