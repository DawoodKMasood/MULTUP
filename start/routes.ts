/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const UploadsController = () => import('#controllers/uploads_controller')

router.on('/').renderInertia('home')

router.group(() => {
  router.group(() => {
    router.post('/uploads/presign', [UploadsController, 'generatePresignedUrl'])
    router.post('/uploads/complete', [UploadsController, 'completeUpload'])
  }).prefix('v1')
}).prefix('api')