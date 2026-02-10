import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const isProduction = env.get('NODE_ENV') === 'production'

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      connection: {
        connectionString: env.get('DATABASE_URL'),
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig
