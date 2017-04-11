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
});
