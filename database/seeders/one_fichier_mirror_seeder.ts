import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Mirror from '#models/mirror'

export default class OneFichierMirrorSeeder extends BaseSeeder {
  async run() {
    await Mirror.firstOrCreate(
      { name: '1fichier.com' },
      {
        name: '1fichier.com',
        config: {
          apiKey: process.env.ONEFICHIER_API_KEY || null,
          retentionDays: 15,
          maxFileSize: 100000000,
        },
        enabled: true,
        priority: 0,
      }
    )
  }
}
