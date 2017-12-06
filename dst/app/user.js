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
const sasaki = require("@motionpicture/sskts-api-nodejs-client");
const createDebug = require("debug");
const jwt = require("jsonwebtoken");
// tslint:disable-next-line:no-require-imports no-var-requires
const jwkToPem = require('jwk-to-pem');
const request = require("request-promise-native");
const redis_1 = require("../redis");
const debug = createDebug('sskts-line-assistant:user');
const ISSUER = process.env.SSKTS_API_TOKEN_ISSUER;
let pems;
/**
 * LINEユーザー
 * @class
 * @see https://aws.amazon.com/blogs/mobile/integrating-amazon-cognito-user-pools-with-api-gateway/
 */
class User {
    constructor(configurations) {
        this.userId = configurations.userId;
        this.authClient = new sasaki.auth.OAuth2({
            domain: process.env.SSKTS_API_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.SSKTS_API_CLIENT_ID,
            clientSecret: process.env.SSKTS_API_CLIENT_SECRET,
            redirectUri: `https://${configurations.host}/signIn`,
            logoutUri: `https://${configurations.host}/signOut`
        });
    }
    generateAuthUrl() {
        const scopes = [
            'phone', 'openid', 'email', 'aws.cognito.signin.user.admin', 'profile'
        ];
        return this.authClient.generateAuthUrl({
            scopes: scopes,
            state: this.userId,
            codeVerifier: process.env.SSKTS_API_CODE_VERIFIER
        });
    }
    isAuthenticated() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield redis_1.default.get(`token.${this.userId}`);
            if (token === null) {
                return false;
            }
            const payload = yield validateToken(token, {
                issuer: ISSUER,
                tokenUse: 'access' // access tokenのみ受け付ける
            });
            debug('verified! payload:', payload);
            this.payload = payload;
            this.scopes = (typeof payload.scope === 'string') ? payload.scope.split((' ')) : [];
            this.accessToken = token;
            return true;
        });
    }
    signIn(code) {
        return __awaiter(this, void 0, void 0, function* () {
            // 認証情報を取得できればログイン成功
            const credentials = yield this.authClient.getToken(code, process.env.SSKTS_API_CODE_VERIFIER);
            debug('credentials published', credentials);
            // auth.setCredentials(credentials);
            // tslint:disable-next-line:no-suspicious-comment
            // ログイン状態を保持
            const results = yield redis_1.default.multi()
                .set(`token.${this.userId}`, credentials.access_token)
                .expire(`token.${this.userId}`, 60, debug)
                .exec();
            debug('results:', results);
            return credentials;
        });
    }
}
exports.default = User;
exports.URI_OPENID_CONFIGURATION = '/.well-known/openid-configuration';
function createPems(issuer) {
    return __awaiter(this, void 0, void 0, function* () {
        const openidConfiguration = yield request({
            url: `${issuer}${exports.URI_OPENID_CONFIGURATION}`,
            json: true
        }).then((body) => body);
        return request({
            url: openidConfiguration.jwks_uri,
            json: true
        }).then((body) => {
            debug('got jwks_uri', body);
            const pemsByKid = {};
            body.keys.forEach((key) => {
                pemsByKid[key.kid] = jwkToPem(key);
            });
            return pemsByKid;
        });
    });
}
/**
 * トークンを検証する
 */
function validateToken(token, verifyOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('validating token...', token);
        const decodedJwt = jwt.decode(token, { complete: true });
        if (!decodedJwt) {
            throw new Error('Not a valid JWT token.');
        }
        debug('decodedJwt:', decodedJwt);
        // audienceをチェック
        // if (decodedJwt.payload.aud !== AUDIENCE) {
        //     throw new Error('invalid audience');
        // }
        // tokenUseが期待通りでなければ拒否
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (verifyOptions.tokenUse !== undefined) {
            if (decodedJwt.payload.token_use !== verifyOptions.tokenUse) {
                throw new Error(`Not a ${verifyOptions.tokenUse}.`);
            }
        }
        // 公開鍵未取得であればcognitoから取得
        if (pems === undefined) {
            pems = yield createPems(verifyOptions.issuer);
        }
        // トークンからkidを取り出して、対応するPEMを検索
        const pem = pems[decodedJwt.header.kid];
        if (pem === undefined) {
            throw new Error('Invalid access token.');
        }
        // 対応PEMがあればトークンを検証
        return new Promise((resolve, reject) => {
            jwt.verify(token, pem, {
                issuer: ISSUER // 期待しているユーザープールで発行されたJWTトークンかどうか確認
                // audience: pemittedAudiences
            }, (err, payload) => {
                if (err !== null) {
                    reject(err);
                }
                else {
                    // Always generate the policy on value of 'sub' claim and not for 'username' because username is reassignable
                    // sub is UUID for a user which is never reassigned to another user
                    resolve(payload);
                }
            });
        });
    });
}