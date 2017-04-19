"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable:no-backbone-get-set-outside-model
/**
 * webhookルーターテスト
 *
 * @ignore
 */
const assert = require("assert");
const HTTPStatus = require("http-status");
const supertest = require("supertest");
const app = require("../app/app");
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
    it('予約番号メッセージ受信', (done) => {
        supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    message: {
                        id: '5647872913345',
                        text: '1616',
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
    it('予約番号で検索', (done) => {
        supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    postback: {
                        data: 'action=searchTransactionByReserveNum&reserveNum=1616'
                    },
                    replyToken: '26d0dd0923a94583871ecd7e6efec8e2',
                    source: {
                        type: 'user',
                        userId: 'U28fba84b4008d60291fc861e2562b34f'
                    },
                    timestamp: 1487085535998,
                    type: 'postback'
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
