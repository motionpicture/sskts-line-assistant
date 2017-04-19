"use strict";
/**
 * LINE webhookコントローラー
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
const createDebug = require("debug");
const querystring = require("querystring");
const request = require("request-promise-native");
const MessageController = require("./webhook/message");
const PostbackController = require("./webhook/postback");
const debug = createDebug('sskts-linereport:controller:webhook');
/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
// tslint:disable-next-line:max-func-body-length cyclomatic-complexity
function message(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const message = event.message.text;
        const userId = event.source.userId;
        try {
            switch (true) {
                case /^\d{1,12}$/.test(message):
                    yield MessageController.pushButtonsReserveNumOrTel(userId, message);
                    break;
                default:
                    // 何もしない
                    break;
            }
        }
        catch (error) {
            console.error(error);
            // エラーメッセージ表示
            yield pushMessage(userId, error.toString());
        }
    });
}
exports.message = message;
/**
 * イベントの送信元が、template messageに付加されたポストバックアクションを実行したことを示すevent objectです。
 */
// tslint:disable-next-line:max-func-body-length
function postback(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = querystring.parse(event.postback.data);
        debug('data:', data);
        const userId = event.source.userId;
        try {
            switch (data.action) {
                case 'searchTransactionByReserveNum':
                    yield PostbackController.searchTransactionByReserveNum(userId, data.reserveNum);
                    break;
                case 'searchTransactionByTel':
                    yield PostbackController.searchTransactionByTel(userId, data.reserveNum);
                    break;
                case 'pushNotification':
                    yield PostbackController.pushNotification(userId, data.transaction);
                    break;
                case 'transferCoaSeatReservationAuthorization':
                    yield PostbackController.transferCoaSeatReservationAuthorization(userId, data.transaction);
                    break;
                default:
                    break;
            }
        }
        catch (error) {
            console.error(error);
            // エラーメッセージ表示
            yield pushMessage(userId, error.toString());
        }
    });
}
exports.postback = postback;
/**
 * イベント送信元に友だち追加（またはブロック解除）されたことを示すEvent Objectです。
 */
function follow(event) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('event is', event);
        return;
    });
}
exports.follow = follow;
/**
 * イベント送信元にブロックされたことを示すevent objectです。
 */
function unfollow(event) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('event is', event);
        return;
    });
}
exports.unfollow = unfollow;
/**
 * イベントの送信元グループまたはトークルームに参加したことを示すevent objectです。
 */
function join(event) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('event is', event);
        return;
    });
}
exports.join = join;
/**
 * イベントの送信元グループから退出させられたことを示すevent objectです。
 */
function leave(event) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('event is', event);
        return;
    });
}
exports.leave = leave;
/**
 * イベント送信元のユーザがLINE Beaconデバイスの受信圏内に出入りしたことなどを表すイベントです。
 */
function beacon(event) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('event is', event);
        return;
    });
}
exports.beacon = beacon;
/**
 * メッセージ送信
 *
 * @param {string} userId
 * @param {string} text
 */
function pushMessage(userId, text) {
    return __awaiter(this, void 0, void 0, function* () {
        // push message
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    {
                        type: 'text',
                        text: text
                    }
                ]
            }
        }).promise();
    });
}
