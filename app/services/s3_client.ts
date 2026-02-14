import env from '#start/env'
import { S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import https from 'node:https'

const s3Client = new S3Client({
  region: env.get('AWS_REGION'),
  endpoint: env.get('AWS_ENDPOINT'),
  credentials: {
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
  }),
})

export const BUCKET = env.get('S3_BUCKET')

export default s3Client
