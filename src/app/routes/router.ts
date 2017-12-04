/**
 * defaultルーター
 * @ignore
 */

import * as express from 'express';

const router = express.Router();

// middleware that is specific to this router
// router.use((req, res, next) => {
//   debug('Time: ', Date.now())
//   next()
// })

export default router;
