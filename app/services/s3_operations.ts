import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import s3Client, { BUCKET } from '#services/s3_client'

export async function deleteS3Object(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
