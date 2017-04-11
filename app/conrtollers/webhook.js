"use strict";
/**
 * LINE webhookコントローラ
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
const debug = createDebug('sskts-linereport:controller:webhook');
/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
function message(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const message = event.message.text;
        const MID = event.source.userId;
        switch (true) {
            case /^\d{1,8}$/.test(message):
                yield pushMessage(MID, `購入番号:${message}`);
                break;
            default:
                yield pushMessage(MID, '???');
                break;
        }
    });
}
exports.message = message;
/**
 * イベントの送信元が、template messageに付加されたポストバックアクションを実行したことを示すevent objectです。
 */
function postback(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = querystring.parse(event.postback.data);
        debug('data is', data);
        const MID = event.source.userId;
        switch (data.action) {
            case 'sendEmail':
                yield pushMessage(MID, 'sendEmail');
                break;
            default:
                break;
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
 * @param {string} MID
 * @param {string} text
 */
function pushMessage(MID, text) {
    return __awaiter(this, void 0, void 0, function* () {
        // push message
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: MID,
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
/**
 * 枚数選択送信
 *
 * @param {string} MID
 */
// async function pushNumber(MID: string) {
//     // push message
//     await request.post({
//         simple: false,
//         url: 'https://api.line.me/v2/bot/message/push',
//         auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
//         json: true,
//         body: {
//             to: MID,
//             messages: [
//                 {
//                     type: 'template',
//                     altText: 'aaa',
//                     template: {
//                         type: 'buttons',
//                         thumbnailImageUrl: 'https://devssktslinebotdemo.blob.core.windows.net/image/tokyo.PNG',
//                         text: '4枚まで買えるよ～',
//                         actions: [
//                             {
//                                 type: 'postback',
//                                 label: '1枚',
//                                 data: 'action=selectNumber&number=1'
//                             },
//                             {
//                                 type: 'postback',
//                                 label: '2枚',
//                                 data: 'action=selectNumber&number=2'
//                             },
//                             {
//                                 type: 'postback',
//                                 label: '3枚',
//                                 data: 'action=selectNumber&number=3'
//                             },
//                             {
//                                 type: 'postback',
//                                 label: '4枚',
//                                 data: 'action=selectNumber&number=4'
//                             }
//                         ]
//                     }
//                 }
//             ]
//         }
//     }).promise();
// }
