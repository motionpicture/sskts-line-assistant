"use strict";
/**
 * 認証ルーター
 * @ignore
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const sasaki = require("@motionpicture/sskts-api-nodejs-client");
const createDebug = require("debug");
const express = require("express");
const redis_1 = require("../../redis");
const LINE = require("../controllers/line");
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
authRouter.get('/signIn', (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const auth = new sasaki.auth.OAuth2({
            domain: process.env.SSKTS_API_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.SSKTS_API_CLIENT_ID,
            clientSecret: process.env.SSKTS_API_CLIENT_SECRE,
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
        }
        else {
            const credentials = yield auth.getToken(req.query.code, codeVerifier);
            debug('credentials published', credentials);
            // 認証情報を取得できればログイン成功
            auth.setCredentials(credentials);
            // tslint:disable-next-line:no-suspicious-comment
            // ログイン状態を保持
            const results = yield redis_1.default.multi()
                .set(`token.${user}`, credentials.access_token)
                .expire(`token.${user}`, 60, debug)
                .exec();
            debug('results:', results);
            yield LINE.pushMessage(user, `Signed in. ${credentials.access_token}`);
            res.send(`<html>
<body>Signed in. ${credentials.access_token}</body>
</html>
`);
        }
    }
    catch (error) {
        next(error);
    }
}));
exports.default = authRouter;
