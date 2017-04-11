/**
 * ルーター
 *
 * @ignore
 */
import * as createDebug from 'debug';
import * as express from 'express';
import { OK } from 'http-status';

import * as webhookController from '../conrtollers/webhook';

const router = express.Router();
const debug = createDebug('sskts-linereport:*');

// tslint:disable-next-line:max-func-body-length
router.all('/', async (req, res) => {
    debug('body:', JSON.stringify(req.body));

    try {
        const event: any = (req.body.events !== undefined) ? req.body.events[0] : undefined;

        if (event !== undefined) {
            switch (event.type) {
                case 'message':
                    await webhookController.message(event);
                    break;

                case 'postback':
                    await webhookController.postback(event);
                    break;

                case 'follow':
                    await webhookController.follow(event);
                    break;

                case 'unfollow':
                    await webhookController.unfollow(event);
                    break;

                case 'join':
                    await webhookController.join(event);
                    break;

                case 'leave':
                    await webhookController.leave(event);
                    break;

                case 'beacon':
                    await webhookController.postback(event);
                    break;

                default:
                    break;
            }
        }
    } catch (error) {
        console.error(error);
    }

    res.status(OK).send('ok');
});

export default router;
