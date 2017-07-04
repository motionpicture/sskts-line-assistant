"use strict";
/**
 * webhookルーターテスト
 *
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
const assert = require("assert");
const HTTPStatus = require("http-status");
const supertest = require("supertest");
const app = require("../app/app");
describe('POST /webhook', () => {
    it('found', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .expect(HTTPStatus.OK)
            .then((response) => {
            assert.equal(response.text, 'ok');
        });
    }));
    it('使い方送信', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    message: {
                        id: '5647872913345',
                        text: '???',
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
        });
    }));
    it('予約番号メッセージ受信', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    message: {
                        id: '5647872913345',
                        text: '112-469',
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
        });
    }));
    it('予約番号で検索(成立取引)', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    postback: {
                        data: 'action=searchTransactionByReserveNum&theater=112&reserveNum=469'
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
        });
    }));
    it('予約番号で検索', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    postback: {
                        data: 'action=searchTransactionByReserveNum&theater=118&reserveNum=2698'
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
        });
    }));
    it('電話番号で検索', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    postback: {
                        data: 'action=searchTransactionByTel&theater=118&tel=09012345678'
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
        });
    }));
});
