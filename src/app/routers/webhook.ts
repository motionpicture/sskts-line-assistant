/**
 * webhookルーター
 * @ignore
 */

import * as createDebug from 'debug';
import * as express from 'express';
import { OK } from 'http-status';

import * as WebhookController from '../conrtollers/webhook';

const webhookRouter = express.Router();
const debug = createDebug('sskts-line-assistant:router:webhook');

webhookRouter.all('/', async (req, res) => {
    debug('body:', JSON.stringify(req.body));

    try {
        const event: any = (req.body.events !== undefined) ? req.body.events[0] : undefined;

        if (event !== undefined) {
            switch (event.type) {
                case 'message':
                    await WebhookController.message(event);
                    break;

                case 'postback':
                    await WebhookController.postback(event);
                    break;

                case 'follow':
                    await WebhookController.follow(event);
                    break;

                case 'unfollow':
                    await WebhookController.unfollow(event);
                    break;

                case 'join':
                    await WebhookController.join(event);
                    break;

                case 'leave':
                    await WebhookController.leave(event);
                    break;

                case 'beacon':
                    await WebhookController.postback(event);
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

export default webhookRouter;
