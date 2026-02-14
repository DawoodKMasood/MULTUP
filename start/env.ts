/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DATABASE_URL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the drive package
  |----------------------------------------------------------
  */
  AWS_ACCESS_KEY_ID: Env.schema.string(),
  AWS_SECRET_ACCESS_KEY: Env.schema.string(),
  AWS_REGION: Env.schema.string(),
  AWS_ENDPOINT: Env.schema.string(),
  S3_BUCKET: Env.schema.string(),
  S3_SSL_ENABLED: Env.schema.boolean.optional(),

  /*
  |----------------------------------------------------------
  | Variables for @rlanz/bull-queue
  |----------------------------------------------------------
  */
  REDIS_URL: Env.schema.string(),
  QUEUE_CONCURRENCY: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Variables for mirror worker
  |----------------------------------------------------------
  */
  APP_URL: Env.schema.string(),
  MIRROR_WORKER_URL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for 1fichier mirror
  |----------------------------------------------------------
  */
  ONEFICHIER_API_KEY: Env.schema.string.optional()
})
