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

router.get('/environmentVariables', (__, res) => {
    res.json({
        data: {
            type: 'envs',
            attributes: process.env
        }
    });
});

export default router;
