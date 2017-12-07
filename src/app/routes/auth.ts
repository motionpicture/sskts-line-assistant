/**
 * 認証ルーター
 * @ignore
 */

import * as express from 'express';

import * as LINE from '../../line';
import User from '../user';

const authRouter = express.Router();

/**
 * サインイン
 * Cognitoからリダイレクトしてくる
 */
authRouter.get(
    '/signIn',
    async (req, res, next) => {
        try {
            const event: LINE.IWebhookEvent = JSON.parse(req.query.state);
            const user = new User({
                host: req.hostname,
                userId: event.source.userId,
                state: req.query.state
            });

            await user.signIn(req.query.code);
            await user.isAuthenticated();
            await LINE.pushMessage(event.source.userId, `Signed in. ${user.payload.username}`);

            res.send(`
<html>
<body onload="location.href='line://'">
<div style="text-align:center; font-size:400%">
<h1>Hello ${user.payload.username}.</h1>
<a href="line://">アプリに戻る</a>
<p>state:${req.query.state}</p>
</div>
</body>
</html>`
            );
        } catch (error) {
            next(error);
        }
    });

export default authRouter;
