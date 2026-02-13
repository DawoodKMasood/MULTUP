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
const DownloadsController = () => import('#controllers/downloads_controller')
const StatusController = () => import('#controllers/status_controller')

router.on('/').renderInertia('home')
router.on('/upload_complete').renderInertia('upload_complete')

router.get('/status', [StatusController, 'index'])

router.get('/download/:fileId', [DownloadsController, 'show']).where('fileId', router.matchers.uuid())
router.get('/download/:fileId/:mirrorId', [DownloadsController, 'redirectToMirror']).where('fileId', router.matchers.uuid()).where('mirrorId', router.matchers.uuid())

router.group(() => {
  router.group(() => {
    router.post('/uploads/presign', [UploadsController, 'generatePresignedUrl'])
    router.post('/uploads/complete', [UploadsController, 'completeUpload'])
    router.get('/files/:fileId/status', [DownloadsController, 'status']).where('fileId', router.matchers.uuid())
  }).prefix('v1')
}).prefix('api')