/**
 * 認証ルーター
 * @ignore
 */

import * as sasaki from '@motionpicture/sskts-api-nodejs-client';
import * as createDebug from 'debug';
import * as express from 'express';

import redisClient from '../../redis';
import * as LINE from '../controllers/line';

const authRouter = express.Router();
const debug = createDebug('sskts-line-assistant:router:auth');

const scopes = [
    'phone', 'openid', 'email', 'aws.cognito.signin.user.admin', 'profile'
    // process.env.TEST_RESOURCE_IDENTIFIER + '/transactions',
    // process.env.TEST_RESOURCE_IDENTIFIER + '/events.read-only',
    // process.env.TEST_RESOURCE_IDENTIFIER + '/organizations.read-only',
    // process.env.TEST_RESOURCE_IDENTIFIER + '/people.contacts',
    // process.env.TEST_RESOURCE_IDENTIFIER + '/people.creditCards',
    // process.env.TEST_RESOURCE_IDENTIFIER + '/people.ownershipInfos.read-only'
];

const codeVerifier = '12345';

const user = 'U28fba84b4008d60291fc861e2562b34f';

authRouter.get(
    '/signIn',
    async (req, res, next) => {
        try {
            const auth = new sasaki.auth.OAuth2({
                domain: <string>process.env.SSKTS_API_AUTHORIZE_SERVER_DOMAIN,
                clientId: <string>process.env.SSKTS_API_CLIENT_ID,
                clientSecret: <string>process.env.SSKTS_API_CLIENT_SECRE,
                // tslint:disable-next-line:no-http-string
                redirectUri: `https://${req.host}/signIn`,
                // tslint:disable-next-line:no-http-string
                logoutUri: `https://${req.host}/signOut`
            });

            if (req.query.code === undefined) {
                const authUrl = auth.generateAuthUrl({
                    scopes: scopes,
                    state: user,
                    codeVerifier: codeVerifier
                });

                res.send(authUrl);
            } else {
                const credentials = await auth.getToken(req.query.code, codeVerifier);
                debug('credentials published', credentials);

                // 認証情報を取得できればログイン成功
                auth.setCredentials(credentials);

                // tslint:disable-next-line:no-suspicious-comment
                // ログイン状態を保持
                const results = await redisClient.multi()
                    .set(`token.${user}`, credentials.access_token)
                    // ひとまず60秒保持
                    // tslint:disable-next-line:no-magic-numbers
                    .expire(`token.${user}`, 60, debug)
                    .exec();
                debug('results:', results);

                await LINE.pushMessage(user, `Signed in. ${credentials.access_token}`);

                res.send(`<html>
<body>Signed in. ${credentials.access_token}</body>
</html>
`);
            }
        } catch (error) {
            next(error);
        }
    });

export default authRouter;
