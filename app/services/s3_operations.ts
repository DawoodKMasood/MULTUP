import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import s3Client, { BUCKET } from './s3_client.js'

export async function deleteS3Object(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
