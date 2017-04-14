"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * LINE webhookコントローラー
 */
const COA = require("@motionpicture/coa-service");
const sskts = require("@motionpicture/sskts-domain");
const createDebug = require("debug");
const moment = require("moment");
const mongoose = require("mongoose");
const querystring = require("querystring");
const request = require("request-promise-native");
const debug = createDebug('sskts-linereport:controller:webhook');
/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
// tslint:disable-next-line:max-func-body-length
function message(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const message = event.message.text;
        const MID = event.source.userId;
        switch (true) {
            case /^\d{1,8}$/.test(message):
                // 取引検索
                const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
                const performanceAdapter = sskts.adapter.performance(mongoose.connection);
                const queueAdapter = sskts.adapter.queue(mongoose.connection);
                const transactionDoc = yield transactionAdapter.transactionModel.findOne({ 'inquiry_key.reserve_num': message })
                    .populate('owners').exec();
                if (transactionDoc === null) {
                    yield pushMessage(MID, 'no transaction');
                    return;
                }
                const transaction = sskts.factory.transaction.create(transactionDoc.toObject());
                debug(transaction);
                const anonymousOwnerObject = transaction.owners.find((owner) => owner.group === sskts.factory.ownerGroup.ANONYMOUS);
                if (anonymousOwnerObject === undefined) {
                    throw new Error('owner not found');
                }
                const anonymousOwner = sskts.factory.owner.anonymous.create(anonymousOwnerObject);
                const authorizations = yield transactionAdapter.findAuthorizationsById(transaction.id);
                const notifications = yield transactionAdapter.findNotificationsById(transaction.id);
                const gmoAuthorizationObject = authorizations.find((authorization) => {
                    return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.GMO);
                });
                const gmoAuthorization = sskts.factory.authorization.gmo.create(gmoAuthorizationObject);
                const coaSeatReservationAuthorizationObject = authorizations.find((authorization) => {
                    return (authorization.owner_to === anonymousOwner.id &&
                        authorization.group === sskts.factory.authorizationGroup.COA_SEAT_RESERVATION);
                });
                const coaSeatReservationAuthorization = sskts.factory.authorization.coaSeatReservation.create(coaSeatReservationAuthorizationObject);
                const performanceOption = yield sskts.service.master.findPerformance(coaSeatReservationAuthorization.assets[0].performance)(performanceAdapter);
                if (performanceOption.isEmpty) {
                    throw new Error('performance not found');
                }
                const performance = performanceOption.get();
                debug(performance);
                const transactionDetails = `----------------
取引状況
----------------
ステータス:${transaction.status}
キュー:${transaction.queues_status}
開始:
${(transaction.started_at instanceof Date) ? moment(transaction.started_at).toISOString() : ''}
成立:
${(transaction.closed_at instanceof Date) ? moment(transaction.closed_at).toISOString() : ''}
期限切れ:
${(transaction.expired_at instanceof Date) ? moment(transaction.expired_at).toISOString() : ''}
キュー出力:
${(transaction.queues_exported_at instanceof Date) ? moment(transaction.queues_exported_at).toISOString() : ''}
----------------
購入者情報
----------------
${anonymousOwner.name_first} ${anonymousOwner.name_last}
${anonymousOwner.email}
${anonymousOwner.tel}
----------------
購入内容
----------------
${performance.film.name.ja}
${performance.day} ${performance.time_start}-
@${performance.theater.name.ja} ${performance.screen.name.ja}
￥${gmoAuthorization.price}
----------------
GMO
----------------
${gmoAuthorization.gmo_order_id}`;
                yield pushMessage(MID, transactionDetails);
                if (transaction.status !== sskts.factory.transactionStatus.CLOSED) {
                    return;
                }
                if (transaction.inquiry_key !== undefined) {
                    // COAからQRを取得
                    const stateReserveResult = yield COA.ReserveService.stateReserve({
                        theater_code: transaction.inquiry_key.theater_code,
                        reserve_num: transaction.inquiry_key.reserve_num,
                        tel_num: transaction.inquiry_key.tel
                    });
                    debug(stateReserveResult);
                    // 本予約済みであればQRコード送信
                    if (stateReserveResult !== null) {
                        stateReserveResult.list_ticket.forEach((ticket) => __awaiter(this, void 0, void 0, function* () {
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
                                            type: 'image',
                                            // tslint:disable-next-line:max-line-length
                                            originalContentUrl: `https://chart.apis.google.com/chart?chs=400x400&cht=qr&chl=${ticket.seat_qrcode}`,
                                            previewImageUrl: `https://chart.apis.google.com/chart?chs=150x150&cht=qr&chl=${ticket.seat_qrcode}`
                                        }
                                    ]
                                }
                            }).promise();
                        }));
                    }
                }
                let queueStatus4coaAuthorization = sskts.factory.queueStatus.UNEXECUTED;
                let queueStatus4gmoAuthorization = sskts.factory.queueStatus.UNEXECUTED;
                let queueStatus4emailNotification = sskts.factory.queueStatus.UNEXECUTED;
                let promises = [];
                promises = promises.concat(authorizations.map((authorization) => __awaiter(this, void 0, void 0, function* () {
                    const queueDoc = yield queueAdapter.model.findOne({
                        group: sskts.factory.queueGroup.SETTLE_AUTHORIZATION,
                        'authorization.id': authorization.id
                    }).exec();
                    switch (authorization.group) {
                        case sskts.factory.authorizationGroup.COA_SEAT_RESERVATION:
                            queueStatus4coaAuthorization = queueDoc.get('status');
                            break;
                        case sskts.factory.authorizationGroup.GMO:
                            queueStatus4gmoAuthorization = queueDoc.get('status');
                            break;
                        default:
                            break;
                    }
                })));
                promises = promises.concat(notifications.map((notification) => __awaiter(this, void 0, void 0, function* () {
                    const queueDoc = yield queueAdapter.model.findOne({
                        group: sskts.factory.queueGroup.PUSH_NOTIFICATION,
                        'notification.id': notification.id
                    }).exec();
                    switch (notification.group) {
                        case sskts.factory.notificationGroup.EMAIL:
                            queueStatus4emailNotification = queueDoc.get('status');
                            break;
                        default:
                            break;
                    }
                })));
                yield Promise.all(promises);
                yield pushMessage(MID, `メール送信:${queueStatus4emailNotification}
本予約:${queueStatus4coaAuthorization}
売上:${queueStatus4gmoAuthorization}`);
                // キュー実行のボタン表示
                yield request.post({
                    simple: false,
                    url: 'https://api.line.me/v2/bot/message/push',
                    auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
                    json: true,
                    body: {
                        to: MID,
                        messages: [
                            {
                                type: 'template',
                                altText: 'aaa',
                                template: {
                                    type: 'buttons',
                                    text: 'キュー実行',
                                    actions: [
                                        {
                                            type: 'postback',
                                            label: 'メール送信',
                                            data: `action=pushNotification&transaction=${transaction.id}`
                                        },
                                        {
                                            type: 'postback',
                                            label: '本予約',
                                            data: `action=transferCoaSeatReservationAuthorization&transaction=${transaction.id}`
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }).promise();
                break;
            default:
                // 何もしない
                // await pushMessage(MID, '???');
                break;
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
        debug('data is', data);
        const MID = event.source.userId;
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        let promises = [];
        switch (data.action) {
            case 'pushNotification':
                yield pushMessage(MID, 'メールを送信しています...');
                // 取引検索
                const transactionDoc4notification = yield transactionAdapter.transactionModel.findById(data.transaction).exec();
                if (transactionDoc4notification === null) {
                    yield pushMessage(MID, 'no transaction');
                    return;
                }
                if (transactionDoc4notification.get('status') !== sskts.factory.transactionStatus.CLOSED) {
                    return;
                }
                const notifications = yield transactionAdapter.findNotificationsById(transactionDoc4notification.get('_id'));
                debug(notifications);
                if (notifications.length === 0) {
                    yield pushMessage(MID, '通知がありません');
                    return;
                }
                promises = [];
                promises = promises.concat(notifications.map((notification) => __awaiter(this, void 0, void 0, function* () {
                    switch (notification.group) {
                        case sskts.factory.notificationGroup.EMAIL:
                            yield sskts.service.notification.sendEmail(notification)();
                            break;
                        default:
                            break;
                    }
                })));
                try {
                    yield Promise.all(promises);
                }
                catch (error) {
                    yield pushMessage(MID, `送信できませんでした ${error.message}`);
                    return;
                }
                yield pushMessage(MID, '送信しました');
                break;
            case 'transferCoaSeatReservationAuthorization':
                yield pushMessage(MID, '本予約処理をしています...');
                // 取引検索
                const transactionDoc4transfer = yield transactionAdapter.transactionModel.findById(data.transaction).exec();
                if (transactionDoc4transfer === null) {
                    yield pushMessage(MID, 'no transaction');
                    return;
                }
                if (transactionDoc4transfer.get('status') !== sskts.factory.transactionStatus.CLOSED) {
                    return;
                }
                const authorizations = yield transactionAdapter.findAuthorizationsById(transactionDoc4transfer.get('_id'));
                debug(authorizations);
                if (authorizations.length === 0) {
                    yield pushMessage(MID, '仮予約データがありません');
                    return;
                }
                promises = [];
                promises = promises.concat(authorizations.map((authorization) => __awaiter(this, void 0, void 0, function* () {
                    switch (authorization.group) {
                        case sskts.factory.authorizationGroup.COA_SEAT_RESERVATION:
                            yield sskts.service.stock.transferCOASeatReservation(authorization)(sskts.adapter.asset(mongoose.connection), sskts.adapter.owner(mongoose.connection));
                            break;
                        default:
                            break;
                    }
                })));
                try {
                    yield Promise.all(promises);
                }
                catch (error) {
                    yield pushMessage(MID, `本予約できませんした ${error.message}`);
                    return;
                }
                yield pushMessage(MID, '本予約完了');
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
