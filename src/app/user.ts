import * as ssktsapi from '@motionpicture/sskts-api-nodejs-client';
import * as createDebug from 'debug';
import * as redis from 'ioredis';
import * as jwt from 'jsonwebtoken';

const debug = createDebug('sskts-line-assistant:user');

import * as LINE from '../line';

const redisClient = new redis({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: <any>{ servername: <string>process.env.REDIS_HOST }
});

export interface ICredentials {
    /**
     * リフレッシュトークン
     */
    refresh_token?: string;
    /**
     * 期限UNIXタイムスタンプ
     */
    expiry_date?: number;
    /**
     * アクセストークン
     */
    access_token: string;
    /**
     * トークンタイプ
     */
    token_type?: string;
}

/**
 * トークンに含まれる情報インターフェース
 * @export
 */
export interface IPayload {
    sub: string;
    token_use: string;
    scope: string;
    iss: string;
    exp: number;
    iat: number;
    version: number;
    jti: string;
    client_id: string;
    username?: string;
}

/**
 * ユーザー設定インターフェース
 * @export
 */
export interface IConfigurations {
    host: string;
    userId: string;
    state: string;
}

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
export default class User {
    public host: string;
    public state: string;
    public userId: string;
    public payload: IPayload;
    public accessToken: string;
    public authClient: ssktsapi.auth.OAuth2;

    constructor(configurations: IConfigurations) {
        this.host = configurations.host;
        this.userId = configurations.userId;
        this.state = configurations.state;

        this.authClient = new ssktsapi.auth.OAuth2({
            domain: <string>process.env.API_AUTHORIZE_SERVER_DOMAIN,
            clientId: <string>process.env.API_CLIENT_ID,
            clientSecret: <string>process.env.API_CLIENT_SECRET,
            redirectUri: `https://${configurations.host}/signIn`,
            logoutUri: `https://${configurations.host}/logout`
        });
    }

    public generateAuthUrl() {
        return this.authClient.generateAuthUrl({
            scopes: [],
            state: this.state,
            codeVerifier: <string>process.env.API_CODE_VERIFIER
        });
    }

    public generateLogoutUrl() {
        return this.authClient.generateLogoutUrl();
    }

    public async getCredentials(): Promise<ICredentials | null> {
        return redisClient.get(`line-assistant.credentials.${this.userId}`)
            .then((value) => (value === null) ? null : JSON.parse(value));
    }

    public setCredentials(credentials: ICredentials) {
        const payload = <any>jwt.decode(credentials.access_token);
        debug('payload:', payload);

        this.payload = payload;
        this.accessToken = credentials.access_token;
        this.authClient.setCredentials(credentials);

        return this;
    }

    public async signIn(code: string) {
        // 認証情報を取得できればログイン成功
        const credentials = await this.authClient.getToken(code, <string>process.env.API_CODE_VERIFIER);
        debug('credentials published', credentials);

        if (credentials.access_token === undefined) {
            throw new Error('Access token is required for credentials.');
        }

        // ログイン状態を保持
        const results = await redisClient.multi()
            .set(`line-assistant.credentials.${this.userId}`, JSON.stringify(credentials))
            .expire(`line-assistant.credentials.${this.userId}`, EXPIRES_IN_SECONDS, debug)
            .exec();
        debug('results:', results);

        this.setCredentials({ ...credentials, access_token: credentials.access_token });

        return this;
    }

    public async logout() {
        await redisClient.del(`token.${this.userId}`);
    }

    public async saveMFAPass(pass: string, postEvent: LINE.IWebhookEvent) {
        return new Promise<string>((resolve, reject) => {
            // JWT作成
            const payload = { events: [postEvent] };
            jwt.sign(payload, SECRET, { expiresIn: POST_EVENT_TOKEN_EXPIRES_IN_SECONDS }, async (jwtErr, token) => {
                if (jwtErr instanceof Error) {
                    reject(jwtErr);
                } else {
                    const key = `line-assistant.postEvent.${this.userId}.${pass}`;

                    const results = await redisClient.multi()
                        .set(key, token)
                        .expire(key, POST_EVENT_TOKEN_EXPIRES_IN_SECONDS, debug)
                        .exec();
                    debug('results:', results);

                    resolve(pass);
                }
            });
        });
    }

    public async verifyMFAPass(pass: string) {
        return new Promise<LINE.IWebhookEvent | null>(async (resolve, reject) => {
            const key = `line-assistant.postEvent.${this.userId}.${pass}`;

            const token = await redisClient.get(key);
            if (token === null) {
                resolve(null);

                return;
            }

            jwt.verify(token, SECRET, (jwtErr, decoded: LINE.IWebhookEvent) => {
                if (jwtErr instanceof Error) {
                    reject(jwtErr);
                } else {
                    resolve(decoded);
                }
            });
        });
    }

    public async deleteMFAPass(pass: string) {
        const key = `line-assistant.postEvent.${this.userId}.${pass}`;
        await redisClient.del(key);
    }
}
