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
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';
/**
 * 予約番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} reserveNum 予約番号
 * @param {string} theaterCode 劇場コード
 */
function searchTransactionByReserveNum(userId, reserveNum, theaterCode) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(userId, reserveNum);
        yield pushMessage(userId, '予約番号で検索しています...');
        // 取引検索
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const transactionDoc = yield transactionAdapter.transactionModel.findOne({
            // tslint:disable-next-line:no-magic-numbers
            'inquiry_key.reserve_num': parseInt(reserveNum, 10),
            'inquiry_key.theater_code': theaterCode
        }, '_id').exec();
        if (transactionDoc === null) {
            yield pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
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
 * @param {string} theaterCode 劇場コード
 */
function searchTransactionByTel(userId, tel, theaterCode) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('tel:', tel);
        yield pushMessage(userId, '電話番号で検索しています...');
        yield pushMessage(userId, '実験実装中です...');
        // 取引検索
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const transactionDoc = yield transactionAdapter.transactionModel.findOne({
            status: sskts.factory.transactionStatus.CLOSED,
            'inquiry_key.tel': tel,
            'inquiry_key.theater_code': theaterCode
        }, '_id').exec();
        if (transactionDoc === null) {
            yield pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
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
        yield pushMessage(userId, '取引詳細をまとめています...');
        // 取引検索
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const performanceAdapter = sskts.adapter.performance(mongoose.connection);
        const transactionDoc = yield transactionAdapter.transactionModel.findById(transactionId).populate('owners').exec();
        if (transactionDoc === null) {
            yield pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
            return;
        }
        const transaction = transactionDoc.toObject();
        debug('transaction:', transaction);
        const anonymousOwner = transaction.owners.find((owner) => owner.group === sskts.factory.ownerGroup.ANONYMOUS);
        const memberOwner = transaction.owners.find((owner) => owner.group === sskts.factory.ownerGroup.MEMBER);
        const authorizations = yield transactionAdapter.findAuthorizationsById(transaction.id);
        // GMOオーソリを取り出す
        const gmoAuthorization = authorizations.find((authorization) => authorization.group === sskts.factory.authorizationGroup.GMO);
        // ムビチケオーソリを取り出す
        const mvtkAuthorization = authorizations.find((authorization) => authorization.group === sskts.factory.authorizationGroup.MVTK);
        // 座席予約オーソリを取り出す
        const seatReservationAuthorization = authorizations.find((authorization) => authorization.group === sskts.factory.authorizationGroup.COA_SEAT_RESERVATION);
        // タスクの実行日時を調べる
        const cancelSeatReservationAuthorizationTaskIdInTransaction = transaction.tasks.find((task) => task.name === sskts.factory.taskName.CancelSeatReservationAuthorization);
        const cancelGMOAuthorizationTaskInTransaction = transaction.tasks.find((task) => task.name === sskts.factory.taskName.CancelGMOAuthorization);
        const settleSeatReservationAuthorizationTaskIdInTransaction = transaction.tasks.find((task) => task.name === sskts.factory.taskName.SettleSeatReservationAuthorization);
        const settleGMOAuthorizationTaskInTransaction = transaction.tasks.find((task) => task.name === sskts.factory.taskName.SettleGMOAuthorization);
        const settleMvtkAuthorizationTaskInTransaction = transaction.tasks.find((task) => task.name === sskts.factory.taskName.SettleMvtkAuthorization);
        const sendEmailNotificationTaskInTransaction = transaction.tasks.find((task) => task.name === sskts.factory.taskName.SendEmailNotification);
        const cancelSeatReservationAuthorizationTask = (cancelSeatReservationAuthorizationTaskIdInTransaction !== undefined)
            ? yield sskts.adapter.task(mongoose.connection).taskModel.findById(cancelSeatReservationAuthorizationTaskIdInTransaction.id).exec()
            : null;
        const cancelGMOAuthorizationTask = (cancelGMOAuthorizationTaskInTransaction !== undefined)
            ? yield sskts.adapter.task(mongoose.connection).taskModel.findById(cancelGMOAuthorizationTaskInTransaction.id).exec()
            : null;
        const settleSeatReservationAuthorizationTask = (settleSeatReservationAuthorizationTaskIdInTransaction !== undefined)
            ? yield sskts.adapter.task(mongoose.connection).taskModel.findById(settleSeatReservationAuthorizationTaskIdInTransaction.id).exec()
            : null;
        const settleGMOAuthorizationTask = (settleGMOAuthorizationTaskInTransaction !== undefined)
            ? yield sskts.adapter.task(mongoose.connection).taskModel.findById(settleGMOAuthorizationTaskInTransaction.id).exec()
            : null;
        const settleMvtkAuthorizationTask = (settleMvtkAuthorizationTaskInTransaction !== undefined)
            ? yield sskts.adapter.task(mongoose.connection).taskModel.findById(settleMvtkAuthorizationTaskInTransaction.id).exec()
            : null;
        const sendEmailNotificationTask = (sendEmailNotificationTaskInTransaction !== undefined)
            ? yield sskts.adapter.task(mongoose.connection).taskModel.findById(sendEmailNotificationTaskInTransaction.id).exec()
            : null;
        let qrCodesBySeatCode = [];
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
                qrCodesBySeatCode = stateReserveResult.list_ticket.map((ticket) => {
                    return {
                        seat_code: ticket.seat_num,
                        qr: `https://chart.apis.google.com/chart?chs=400x400&cht=qr&chl=${ticket.seat_qrcode}`
                    };
                });
            }
        }
        let performance;
        let performanceDatetimeStr = '';
        let ticketsStr = '';
        if (seatReservationAuthorization !== undefined) {
            // パフォーマンス情報取得
            const performanceOption = yield sskts.service.master.findPerformance(seatReservationAuthorization.assets[0].performance)(performanceAdapter);
            if (performanceOption.isEmpty) {
                throw new Error('performance not found');
            }
            performance = performanceOption.get();
            // tslint:disable-next-line:max-line-length
            performanceDatetimeStr = `${moment(performance.day, 'YYYYMMDD').format('YYYY/MM/DD')} ${moment(performance.time_start, 'HHmm').format('HH:mm')}-${moment(performance.time_end, 'HHmm').format('HH:mm')}`;
            ticketsStr = seatReservationAuthorization.assets.map((asset) => `●${asset.seat_code} ${asset.ticket_name.ja} ￥${asset.sale_price}`).join('\n');
        }
        // tslint:disable:max-line-length
        const transactionDetails = `--------------------
取引概要
--------------------
${transaction.id}
${transaction.status}
${(transaction.inquiry_key !== undefined) ? `予約番号:${transaction.inquiry_key.reserve_num}` : ''}
${(transaction.inquiry_key !== undefined) ? `劇場:${transaction.inquiry_key.theater_code}` : ''}
--------------------
取引状況
--------------------
${(transaction.started_at instanceof Date) ? `${moment(transaction.started_at).format('YYYY-MM-DD HH:mm:ss')} 開始` : ''}
${(transaction.closed_at instanceof Date) ? `${moment(transaction.closed_at).format('YYYY-MM-DD HH:mm:ss')} 成立` : ''}
${(transaction.expired_at instanceof Date) ? `${moment(transaction.expired_at).format('YYYY-MM-DD HH:mm:ss')} 期限切れ` : ''}
${(transaction.queues_exported_at instanceof Date) ? `${moment(transaction.queues_exported_at).format('YYYY-MM-DD HH:mm:ss')} タスク出力` + '' : ''}
${(cancelSeatReservationAuthorizationTask !== null && cancelSeatReservationAuthorizationTask.get('status') === 'Executed') ? `${moment(cancelSeatReservationAuthorizationTask.get('last_tried_at')).format('YYYY-MM-DD HH:mm:ss')} 仮予約取消` : ''}
${(cancelGMOAuthorizationTask !== null && cancelGMOAuthorizationTask.get('status') === 'Executed') ? `${moment(cancelGMOAuthorizationTask.get('last_tried_at')).format('YYYY-MM-DD HH:mm:ss')} AUTH取消` : ''}
${(sendEmailNotificationTask !== null && sendEmailNotificationTask.get('status') === 'Executed') ? `${moment(sendEmailNotificationTask.get('last_tried_at')).format('YYYY-MM-DD HH:mm:ss')} メール送信` : ''}
${(settleSeatReservationAuthorizationTask !== null && settleSeatReservationAuthorizationTask.get('status') === 'Executed') ? `${moment(settleSeatReservationAuthorizationTask.get('last_tried_at')).format('YYYY-MM-DD HH:mm:ss')} 本予約` : ''}
${(settleGMOAuthorizationTask !== null && settleGMOAuthorizationTask.get('status') === 'Executed') ? `${moment(settleGMOAuthorizationTask.get('last_tried_at')).format('YYYY-MM-DD HH:mm:ss')} 実売上` : ''}
${(settleMvtkAuthorizationTask !== null && settleMvtkAuthorizationTask.get('status') === 'Executed') ? `${moment(settleMvtkAuthorizationTask.get('last_tried_at')).format('YYYY-MM-DD HH:mm:ss')} ムビチケ着券` : ''}
--------------------
購入者情報
--------------------
${(anonymousOwner !== undefined) ? `${anonymousOwner.name_first} ${anonymousOwner.name_last}` : ''}
${(anonymousOwner !== undefined) ? anonymousOwner.email : ''}
${(anonymousOwner !== undefined) ? anonymousOwner.tel : ''}
--------------------
会員情報
--------------------
${(memberOwner !== undefined) ? `${memberOwner.name_first} ${memberOwner.name_last}` : ''}
${(memberOwner !== undefined) ? memberOwner.email : ''}
${(memberOwner !== undefined) ? memberOwner.tel : ''}
--------------------
座席予約
--------------------
${(performance !== undefined) ? performance.film.name.ja : ''}
${performanceDatetimeStr}
${(performance !== undefined) ? `@${performance.theater.name.ja} ${performance.screen.name.ja}` : ''}
${ticketsStr}
--------------------
GMO
--------------------
${(gmoAuthorization !== undefined) ? `@${gmoAuthorization.gmo_shop_id}` : ''}
${(gmoAuthorization !== undefined) ? `#${gmoAuthorization.gmo_order_id}` : ''}
${(gmoAuthorization !== undefined) ? '￥' + gmoAuthorization.price.toString() : ''}
--------------------
ムビチケ
--------------------
${(mvtkAuthorization !== undefined) ? mvtkAuthorization.knyknr_no_info.map((knyknrNoInfo) => knyknrNoInfo.knyknr_no).join('\n') : ''}
--------------------
QRコード
--------------------
${qrCodesBySeatCode.map((qrCode) => '●' + qrCode.seat_code + ' ' + qrCode.qr).join('\n')}
`;
        yield pushMessage(userId, transactionDetails);
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
        yield pushMessage(userId, 'メールを送信しています...');
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        let promises = [];
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
        yield pushMessage(userId, '本予約処理をしています...');
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        let promises = [];
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
                    yield sskts.service.stock.transferCOASeatReservation(authorization)(sskts.adapter.asset(mongoose.connection), sskts.adapter.owner(mongoose.connection), sskts.adapter.performance(mongoose.connection));
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
