// tslint:disable:no-implicit-dependencies
/**
 * webhookルーターテスト
 */
import * as assert from 'assert';
import * as HTTPStatus from 'http-status';
import * as supertest from 'supertest';

import * as app from '../app';

describe('POST /webhook', () => {
    beforeEach(() => {
        process.env.USER_REFRESH_TOKEN = 'XXX';
    });
    afterEach(() => {
        delete process.env.USER_REFRESH_TOKEN;
    });
    it('found', async () => {
        await supertest(app)
            .post('/webhook')
            .send({
                events: [
                    {
                        source: {
                            type: 'user',
                            userId: 'U28fba84b4008d60291fc861e2562b34f'
                        }
                    }
                ]
            })
            .expect(HTTPStatus.OK)
            .then((response) => {
                assert.equal(response.text, 'ok');
            });
    });
});
