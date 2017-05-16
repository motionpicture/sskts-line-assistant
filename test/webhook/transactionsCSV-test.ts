/**
 * webhookルーター取引CSVテスト
 *
 * @ignore
 */

import * as assert from 'assert';
import * as HTTPStatus from 'http-status';
import * as supertest from 'supertest';

import * as app from '../../app/app';

describe('POST /webhook', () => {
    it('csv要求', (done) => {
        supertest(app)
            .post('/webhook')
            .send({
                events: [
                    {
                        message: {
                            id: '5647872913345',
                            text: 'csv',
                            type: 'text'
                        },
                        replyToken: '26d0dd0923a94583871ecd7e6efec8e2',
                        source: {
                            type: 'user',
                            userId: 'U28fba84b4008d60291fc861e2562b34f'
                        },
                        timestamp: 1487085535998,
                        type: 'message'
                    }
                ]
            })
            .expect(HTTPStatus.OK)
            .then((response) => {
                assert.equal(response.text, 'ok');
                done();
            }).catch((err) => {
                done(err);
            });
    });

    it('csv期間指定', (done) => {
        supertest(app)
            .post('/webhook')
            .send({
                events: [
                    {
                        message: {
                            id: '5647872913345',
                            text: '20170401-20171231',
                            type: 'text'
                        },
                        replyToken: '26d0dd0923a94583871ecd7e6efec8e2',
                        source: {
                            type: 'user',
                            userId: 'U28fba84b4008d60291fc861e2562b34f'
                        },
                        timestamp: 1487085535998,
                        type: 'message'
                    }
                ]
            })
            .expect(HTTPStatus.OK)
            .then((response) => {
                assert.equal(response.text, 'ok');
                done();
            }).catch((err) => {
                done(err);
            });
    });
});
