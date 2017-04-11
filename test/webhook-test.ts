// tslint:disable:no-backbone-get-set-outside-model
/**
 * webhookルーターテスト
 *
 * @ignore
 */
import * as assert from 'assert';
import * as HTTPStatus from 'http-status';
import * as supertest from 'supertest';

import * as app from '../app/app';

describe('POST /webhook', () => {
    it('found', (done) => {
        supertest(app)
            .post('/webhook')
            .expect(HTTPStatus.OK)
            .then((response) => {
                assert.equal(response.text, 'ok');
                done();
            }).catch((err) => {
                done(err);
            });
    });
});
