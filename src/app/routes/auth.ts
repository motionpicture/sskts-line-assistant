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

            // tslint:disable-next-line:no-multiline-string
            res.send(`
<html>
<body onload="window.open(\'about:blank\', \'_self\').close();">
<a onclick="window.close();">閉じる</a>
<a href="line://">戻る</a>
</body>
</html>`
            );
        } catch (error) {
            next(error);
        }
    });

export default authRouter;
