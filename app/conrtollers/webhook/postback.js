"use strict";
/**
 * LINE webhook postbackコントローラー
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
const COA = require("@motionpicture/coa-service");
const sskts = require("@motionpicture/sskts-domain");
const createDebug = require("debug");
const moment = require("moment");
const mongoose = require("mongoose");
const request = require("request-promise-native");
const debug = createDebug('sskts-linereport:controller:webhook:postback');
/**
 * 予約番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} reserveNum 予約番号
 */
function searchTransactionByReserveNum(userId, reserveNum) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(userId, reserveNum);
        // 取引検索
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const transactionDoc = yield transactionAdapter.transactionModel.findOne({
            // tslint:disable-next-line:no-magic-numbers
            'inquiry_key.reserve_num': parseInt(reserveNum, 10)
        }, '_id').exec();
        if (transactionDoc === null) {
            yield pushMessage(userId, 'no transaction');
            return;
        }
        yield pushTransactionDetails(userId, transactionDoc.get('_id').toString());
    });
}
exports.searchTransactionByReserveNum = searchTransactionByReserveNum;
/**
 * 電話番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} tel 電話番号
 */
function searchTransactionByTel(userId, tel) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('tel:', tel);
        yield pushMessage(userId, '実験実装中です...');
        // 取引検索
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const transactionDoc = yield transactionAdapter.transactionModel.findOne({
            status: sskts.factory.transactionStatus.CLOSED,
            'inquiry_key.tel': tel
        }, '_id').exec();
        if (transactionDoc === null) {
            yield pushMessage(userId, 'no transaction');
            return;
        }
        yield pushTransactionDetails(userId, transactionDoc.get('_id').toString());
    });
}
exports.searchTransactionByTel = searchTransactionByTel;
/**
 * 取引IDから取引情報詳細を送信する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushTransactionDetails(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        // 取引検索
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const performanceAdapter = sskts.adapter.performance(mongoose.connection);
        const queueAdapter = sskts.adapter.queue(mongoose.connection);
        const transactionDoc = yield transactionAdapter.transactionModel.findById(transactionId).populate('owners').exec();
        if (transactionDoc === null) {
            yield pushMessage(userId, 'no transaction');
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
        debug('authorizations:', authorizations);
        // GMOオーソリを取り出す
        const gmoAuthorizationObject = authorizations.find((authorization) => {
            return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.GMO);
        });
        const gmoAuthorization = 
        // tslint:disable-next-line:max-line-length
        (gmoAuthorizationObject !== undefined) ? sskts.factory.authorization.gmo.create(gmoAuthorizationObject) : undefined;
        // ムビチケオーソリを取り出す
        const mvtkAuthorizationObject = authorizations.find((authorization) => {
            // tslint:disable-next-line:max-line-length
            return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.MVTK);
        });
        const mvtkAuthorization = 
        // tslint:disable-next-line:max-line-length
        (mvtkAuthorizationObject !== undefined) ? sskts.factory.authorization.mvtk.create(mvtkAuthorizationObject) : undefined;
        // 座席予約オーソリを取り出す
        const coaSeatReservationAuthorizationObject = authorizations.find((authorization) => {
            return (authorization.owner_to === anonymousOwner.id &&
                authorization.group === sskts.factory.authorizationGroup.COA_SEAT_RESERVATION);
        });
        const coaSeatReservationAuthorization = 
        // tslint:disable-next-line:max-line-length
        (coaSeatReservationAuthorizationObject !== undefined) ? sskts.factory.authorization.coaSeatReservation.create(coaSeatReservationAuthorizationObject) : undefined;
        if (coaSeatReservationAuthorization === undefined) {
            throw new Error('seat reservation not found');
        }
        // パフォーマンス情報取得
        const performanceOption = yield sskts.service.master.findPerformance(coaSeatReservationAuthorization.assets[0].performance)(performanceAdapter);
        if (performanceOption.isEmpty) {
            throw new Error('performance not found');
        }
        const performance = performanceOption.get();
        debug(performance);
        // キューの実行日時を調べる
        let coaAuthorizationSettledAt = null;
        let gmoAuthorizationSettledAt = null;
        let emailNotificationPushedAt = null;
        if (transaction.status === sskts.factory.transactionStatus.CLOSED) {
            let promises = [];
            promises = promises.concat(authorizations.map((authorization) => __awaiter(this, void 0, void 0, function* () {
                const queueDoc = yield queueAdapter.model.findOne({
                    group: sskts.factory.queueGroup.SETTLE_AUTHORIZATION,
                    'authorization.id': authorization.id
                }).exec();
                switch (authorization.group) {
                    case sskts.factory.authorizationGroup.COA_SEAT_RESERVATION:
                        if (queueDoc.get('status') === sskts.factory.queueStatus.EXECUTED) {
                            coaAuthorizationSettledAt = queueDoc.get('last_tried_at');
                        }
                        break;
                    case sskts.factory.authorizationGroup.GMO:
                        if (queueDoc.get('status') === sskts.factory.queueStatus.EXECUTED) {
                            gmoAuthorizationSettledAt = queueDoc.get('last_tried_at');
                        }
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
                        if (queueDoc.get('status') === sskts.factory.queueStatus.EXECUTED) {
                            emailNotificationPushedAt = queueDoc.get('last_tried_at');
                        }
                        break;
                    default:
                        break;
                }
            })));
            yield Promise.all(promises);
        }
        // .jaを取り出している部分は多言語スキーマを取り入れる以前との互換性維持のため、undefinedチェックをしている
        const transactionDetails = `--------------------
取引状況
--------------------
${(transaction.started_at instanceof Date) ? moment(transaction.started_at).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 開始
${(transaction.closed_at instanceof Date) ? moment(transaction.closed_at).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 成立
${(transaction.expired_at instanceof Date) ? moment(transaction.expired_at).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 期限切れ
${(transaction.queues_exported_at instanceof Date) ? moment(transaction.queues_exported_at).format('YYYY-MM-DD HH:mm:ss') + '' : ''} キュー
${(emailNotificationPushedAt !== null) ? moment(emailNotificationPushedAt).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} メール送信
${(coaAuthorizationSettledAt !== null) ? moment(coaAuthorizationSettledAt).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 本予約
${(gmoAuthorizationSettledAt !== null) ? moment(gmoAuthorizationSettledAt).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 実売上
--------------------
購入者情報
--------------------
${anonymousOwner.name_first} ${anonymousOwner.name_last}
${anonymousOwner.email}
${anonymousOwner.tel}
--------------------
座席予約
--------------------
${(performance.film.name !== undefined) ? performance.film.name.ja : ''}
${performance.day} ${performance.time_start}-${performance.time_end}
@${(performance.theater.name !== undefined) ? performance.theater.name.ja : ''}
${(performance.screen.name !== undefined) ? performance.screen.name.ja : ''}
${coaSeatReservationAuthorization.assets.map((asset) => `●${asset.seat_code} ${(asset.ticket_name !== undefined) ? asset.ticket_name.ja : ''} ￥${asset.sale_price}`).join('\n')}
--------------------
GMO
--------------------
${(gmoAuthorization !== undefined) ? gmoAuthorization.gmo_order_id : ''}
${(gmoAuthorization !== undefined) ? '￥' + gmoAuthorization.price.toString() : ''}
--------------------
ムビチケ
--------------------
${(mvtkAuthorization !== undefined) ? mvtkAuthorization.knyknr_no_info.map((knyknrNoInfo) => knyknrNoInfo.knyknr_no).join('、') : ''}
`;
        yield pushMessage(userId, transactionDetails);
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
                const qrCodesBySeatCode = stateReserveResult.list_ticket.map((ticket) => {
                    return {
                        seat_code: ticket.seat_num,
                        qr: `https://chart.apis.google.com/chart?chs=400x400&cht=qr&chl=${ticket.seat_qrcode}`
                    };
                    // push message
                    // await request.post({
                    //     simple: false,
                    //     url: 'https://api.line.me/v2/bot/message/push',
                    //     auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
                    //     json: true,
                    //     body: {
                    //         to: userId,
                    //         messages: [
                    //             {
                    //                 type: 'image',
                    //                 // tslint:disable-next-line:max-line-length
                    //                 originalContentUrl: `https://chart.apis.google.com/chart?chs=400x400&cht=qr&chl=${ticket.seat_qrcode}`,
                    //                 previewImageUrl: `https://chart.apis.google.com/chart?chs=150x150&cht=qr&chl=${ticket.seat_qrcode}`
                    //             }
                    //         ]
                    //     }
                    // }).promise();
                });
                yield pushMessage(userId, `--------------------
QRコード
--------------------
${qrCodesBySeatCode.map((qrCode) => '●' + qrCode.seat_code + ' ' + qrCode.qr).join('\n')}
`);
            }
        }
        // キュー実行のボタン表示
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
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
    });
}
function pushNotification(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        let promises = [];
        yield pushMessage(userId, 'メールを送信しています...');
        // 取引検索
        const transactionDoc4notification = yield transactionAdapter.transactionModel.findById(transactionId).exec();
        if (transactionDoc4notification === null) {
            yield pushMessage(userId, 'no transaction');
            return;
        }
        if (transactionDoc4notification.get('status') !== sskts.factory.transactionStatus.CLOSED) {
            return;
        }
        const notifications = yield transactionAdapter.findNotificationsById(transactionDoc4notification.get('_id'));
        debug(notifications);
        if (notifications.length === 0) {
            yield pushMessage(userId, '通知がありません');
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
            yield pushMessage(userId, `送信できませんでした ${error.message}`);
            return;
        }
        yield pushMessage(userId, '送信しました');
    });
}
exports.pushNotification = pushNotification;
function transferCoaSeatReservationAuthorization(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        let promises = [];
        yield pushMessage(userId, '本予約処理をしています...');
        // 取引検索
        const transactionDoc4transfer = yield transactionAdapter.transactionModel.findById(transactionId).exec();
        if (transactionDoc4transfer === null) {
            yield pushMessage(userId, 'no transaction');
            return;
        }
        if (transactionDoc4transfer.get('status') !== sskts.factory.transactionStatus.CLOSED) {
            return;
        }
        const authorizations = yield transactionAdapter.findAuthorizationsById(transactionDoc4transfer.get('_id'));
        debug(authorizations);
        if (authorizations.length === 0) {
            yield pushMessage(userId, '仮予約データがありません');
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
            yield pushMessage(userId, `本予約できませんした ${error.message}`);
            return;
        }
        yield pushMessage(userId, '本予約完了');
    });
}
exports.transferCoaSeatReservationAuthorization = transferCoaSeatReservationAuthorization;
/**
 * メッセージ送信
 *
 * @param {string} userId
 * @param {string} text
 */
function pushMessage(userId, text) {
    return __awaiter(this, void 0, void 0, function* () {
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    { type: 'text', text: text }
                ]
            }
        }).promise();
    });
}
