"use strict";
/**
 * message test
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
const app = require("../../app/app");
describe('csvダウンロード', () => {
    it('csv要求', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
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
        });
    }));
    it('csv期間指定', () => __awaiter(this, void 0, void 0, function* () {
        yield supertest(app)
            .post('/webhook')
            .send({
            events: [
                {
                    message: {
                        id: '5647872913345',
                        text: '20170914-20170914',
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
});
