"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ssktsapi = require("@motionpicture/sskts-api-nodejs-client");
const createDebug = require("debug");
const redis = require("ioredis");
const jwt = require("jsonwebtoken");
const debug = createDebug('sskts-line-assistant:user');
const redisClient = new redis({
    host: process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_KEY,
    tls: { servername: process.env.REDIS_HOST }
});
const USER_EXPIRES_IN_SECONDS = process.env.USER_EXPIRES_IN_SECONDS;
if (USER_EXPIRES_IN_SECONDS === undefined) {
    throw new Error('Environment variable USER_EXPIRES_IN_SECONDS required.');
}
// tslint:disable-next-line:no-magic-numbers
const EXPIRES_IN_SECONDS = parseInt(USER_EXPIRES_IN_SECONDS, 10);
const POST_EVENT_TOKEN_EXPIRES_IN_SECONDS = 60;
const SECRET = 'secret';
/**
 * LINEユーザー
 * @see https://aws.amazon.com/blogs/mobile/integrating-amazon-cognito-user-pools-with-api-gateway/
 */
class User {
    constructor(configurations) {
        this.host = configurations.host;
        this.userId = configurations.userId;
        this.state = configurations.state;
        this.authClient = new ssktsapi.auth.OAuth2({
            domain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.API_CLIENT_ID,
            clientSecret: process.env.API_CLIENT_SECRET,
            redirectUri: `https://${configurations.host}/signIn`,
            logoutUri: `https://${configurations.host}/logout`
        });
    }
    generateAuthUrl() {
        return this.authClient.generateAuthUrl({
            scopes: [],
            state: this.state,
            codeVerifier: process.env.API_CODE_VERIFIER
        });
    }
    generateLogoutUrl() {
        return this.authClient.generateLogoutUrl();
    }
    getCredentials() {
        return __awaiter(this, void 0, void 0, function* () {
            return redisClient.get(`line-assistant.credentials.${this.userId}`)
                .then((value) => (value === null) ? null : JSON.parse(value));
        });
    }
    setCredentials(credentials) {
        const payload = jwt.decode(credentials.access_token);
        debug('payload:', payload);
        this.payload = payload;
        this.accessToken = credentials.access_token;
        this.authClient.setCredentials(credentials);
        return this;
    }
    signIn(code) {
        return __awaiter(this, void 0, void 0, function* () {
            // 認証情報を取得できればログイン成功
            const credentials = yield this.authClient.getToken(code, process.env.API_CODE_VERIFIER);
            debug('credentials published', credentials);
            if (credentials.access_token === undefined) {
                throw new Error('Access token is required for credentials.');
            }
            // ログイン状態を保持
            const results = yield redisClient.multi()
                .set(`line-assistant.credentials.${this.userId}`, JSON.stringify(credentials))
                .expire(`line-assistant.credentials.${this.userId}`, EXPIRES_IN_SECONDS, debug)
                .exec();
            debug('results:', results);
            this.setCredentials(Object.assign({}, credentials, { access_token: credentials.access_token }));
            return this;
        });
    }
    logout() {
        return __awaiter(this, void 0, void 0, function* () {
            yield redisClient.del(`token.${this.userId}`);
        });
    }
    saveMFAPass(pass, postEvent) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                // JWT作成
                const payload = { events: [postEvent] };
                jwt.sign(payload, SECRET, { expiresIn: POST_EVENT_TOKEN_EXPIRES_IN_SECONDS }, (jwtErr, token) => __awaiter(this, void 0, void 0, function* () {
                    if (jwtErr instanceof Error) {
                        reject(jwtErr);
                    }
                    else {
                        const key = `line-assistant.postEvent.${this.userId}.${pass}`;
                        const results = yield redisClient.multi()
                            .set(key, token)
                            .expire(key, POST_EVENT_TOKEN_EXPIRES_IN_SECONDS, debug)
                            .exec();
                        debug('results:', results);
                        resolve(pass);
                    }
                }));
            });
        });
    }
    verifyMFAPass(pass) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                const key = `line-assistant.postEvent.${this.userId}.${pass}`;
                const token = yield redisClient.get(key);
                if (token === null) {
                    resolve(null);
                    return;
                }
                jwt.verify(token, SECRET, (jwtErr, decoded) => {
                    if (jwtErr instanceof Error) {
                        reject(jwtErr);
                    }
                    else {
                        resolve(decoded);
                    }
                });
            }));
        });
    }
    deleteMFAPass(pass) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = `line-assistant.postEvent.${this.userId}.${pass}`;
            yield redisClient.del(key);
        });
    }
}
exports.default = User;
