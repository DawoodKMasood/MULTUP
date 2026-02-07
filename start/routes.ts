/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
router.on('/').renderInertia('home')

const UploadsController = () => import('#controllers/uploads_controller')

router.group(() => {
    router.group(() => {

    router.group(() => {
        router.post('/', [UploadsController, 'store'])
    }).prefix('upload');
    
    }).prefix('v1');
}).prefix('api');