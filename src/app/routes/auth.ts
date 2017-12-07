/**
 * 認証ルーター
 * @ignore
 */

import * as express from 'express';

import * as LINE from '../controllers/line';
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
            const userId = req.query.state;
            const user = new User({
                host: req.hostname,
                userId: userId
            });

            await user.signIn(req.query.code);
            await user.isAuthenticated();
            await LINE.pushMessage(userId, `Signed in. ${user.payload.username}`);

            res.send(`
<html>
<body>
<div style="text-align:center; font-size:400%">
<h1>Hello ${user.payload.username}.</h1>
<a href="line://">アプリに戻る</a>
</div>
</body>
</html>`
            );
        } catch (error) {
            next(error);
        }
    });

export default authRouter;
