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
            await LINE.pushMessage(userId, `Signed in. ${user.payload.username}`);

            res.send(`<html>
<body>Signed in. ${user.payload.username}</body>
</html>
`);
        } catch (error) {
            next(error);
        }
    });

export default authRouter;
