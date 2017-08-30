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
// import * as COA from '@motionpicture/coa-service';
const sskts = require("@motionpicture/sskts-domain");
const createDebug = require("debug");
const moment = require("moment");
const mongoose = require("mongoose");
const request = require("request-promise-native");
const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
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
        const doc = yield transactionAdapter.transactionModel.findOne({
            // tslint:disable-next-line:no-magic-numbers
            'result.order.orderInquiryKey.confirmationNumber': parseInt(reserveNum, 10),
            'result.order.orderInquiryKey.theaterCode': theaterCode
        }, 'result').exec();
        if (doc === null) {
            yield pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
            return;
        }
        yield pushTransactionDetails(userId, doc.get('result.order.orderNumber'));
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
function searchTransactionByTel(userId, tel, __) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('tel:', tel);
        yield pushMessage(userId, 'implementing...');
        // await pushMessage(userId, '電話番号で検索しています...');
        // 取引検索
        // const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        // const transactionDoc = await transactionAdapter.transactionModel.findOne(
        //     {
        //         status: sskts.factory.transactionStatus.CLOSED,
        //         'inquiry_key.tel': tel,
        //         'inquiry_key.theater_code': theaterCode
        //     }
        //     ,
        //     '_id'
        // ).exec();
        // if (transactionDoc === null) {
        //     await pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
        //     return;
        // }
        // await pushTransactionDetails(userId, transactionDoc.get('_id').toString());
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
function pushTransactionDetails(userId, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);
        const orderAdapter = sskts.adapter.order(mongoose.connection);
        const taskAdapter = sskts.adapter.task(mongoose.connection);
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        // 注文検索
        const orderDoc = yield orderAdapter.orderModel.findOne({
            orderNumber: orderNumber
        }).exec();
        if (orderDoc === null) {
            yield pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
            return;
        }
        const order = orderDoc.toObject();
        debug('order:', order);
        // 取引検索
        const placeOrderTransaction = yield transactionAdapter.transactionModel.findOne({
            'result.order.orderNumber': orderNumber,
            typeOf: sskts.factory.transactionType.PlaceOrder
        }).then((doc) => doc.toObject());
        debug('placeOrderTransaction:', placeOrderTransaction);
        const tasks = yield taskAdapter.taskModel.find({
            'data.transactionId': placeOrderTransaction.id
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        // タスクの実行日時を調べる
        const settleSeatReservationTask = tasks.find((task) => task.name === sskts.factory.taskName.SettleSeatReservation);
        const settleGMOTask = tasks.find((task) => task.name === sskts.factory.taskName.SettleGMO);
        const orderItems = order.acceptedOffers;
        const screeningEvent = orderItems[0].itemOffered.reservationFor;
        debug('screeningEvent:', screeningEvent);
        const ticketsStr = orderItems.map(
        // tslint:disable-next-line:max-line-length
        (orderItem) => `●${orderItem.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${orderItem.itemOffered.reservedTicket.coaTicketInfo.ticketName} ￥${orderItem.itemOffered.reservedTicket.coaTicketInfo.salePrice}`).join('\n');
        // tslint:disable:max-line-length
        const transactionDetails = `--------------------
取引概要
--------------------
取引ステータス: ${placeOrderTransaction.status}
注文ステータス: ${order.orderStatus}
予約番号: ${order.orderInquiryKey.confirmationNumber}
劇場: ${order.orderInquiryKey.theaterCode}
--------------------
注文取引状況
--------------------
${moment(placeOrderTransaction.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(placeOrderTransaction.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
${(settleSeatReservationTask.status === sskts.factory.taskStatus.Executed) ? `${moment(settleSeatReservationTask.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')} 本予約` : ''}
${(settleGMOTask.status === sskts.factory.taskStatus.Executed) ? `${moment(settleGMOTask.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')} 実売上` : ''}
--------------------
購入者情報
--------------------
${order.customer.name}
${order.customer.telephone}
${order.customer.email}
${(order.customer.memberOf !== undefined) ? `会員:${order.customer.memberOf.membershipNumber}` : ''}
--------------------
座席予約
--------------------
${screeningEvent.superEvent.name.ja}
${screeningEvent.superEvent.name.en}
${moment(screeningEvent.startDate).format('YYYY-MM-DD HH:mm')}-${moment(screeningEvent.endDate).format('HH:mm')}
@${screeningEvent.superEvent.location.name.ja} ${screeningEvent.location.name.ja}
${ticketsStr}
--------------------
決済方法
--------------------
${order.paymentMethods[0].name}
${order.paymentMethods[0].paymentMethodId}
${order.price} ${order.priceCurrency}
--------------------
ムビチケ
--------------------
${(order.discounts.length > 0) ? order.discounts.map((discount) => discount.discountCode).join('\n') : ''}
--------------------
QRコード
--------------------
${orderItems.map((orderItem) => `●${orderItem.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${orderItem.itemOffered.reservedTicket.ticketToken}`).join('\n')}
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
                            text: 'タスク実行',
                            actions: [
                                {
                                    type: 'postback',
                                    label: 'メール送信',
                                    data: `action=pushNotification&transaction=${placeOrderTransaction.id}`
                                },
                                {
                                    type: 'postback',
                                    label: '本予約',
                                    data: `action=transferCoaSeatReservationAuthorization&transaction=${placeOrderTransaction.id}`
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
        yield pushMessage(userId, 'sending...');
        const taskAdapter = sskts.adapter.task(mongoose.connection);
        // タスク検索
        const tasks = yield taskAdapter.taskModel.find({
            name: sskts.factory.taskName.SendEmailNotification,
            'data.transactionId': transactionId
        }).exec();
        if (tasks.length === 0) {
            yield pushMessage(userId, 'no tasks.');
            return;
        }
        let promises = [];
        promises = promises.concat(tasks.map((task) => __awaiter(this, void 0, void 0, function* () {
            yield sskts.service.task.execute(task.toObject())(taskAdapter, mongoose.connection);
        })));
        try {
            yield Promise.all(promises);
        }
        catch (error) {
            yield pushMessage(userId, `error:${error.message}`);
            return;
        }
        yield pushMessage(userId, 'sent.');
    });
}
exports.pushNotification = pushNotification;
function transferCoaSeatReservationAuthorization(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield pushMessage(userId, 'processing...');
        const taskAdapter = sskts.adapter.task(mongoose.connection);
        // タスク検索
        const tasks = yield taskAdapter.taskModel.find({
            name: sskts.factory.taskName.SettleSeatReservation,
            'data.transactionId': transactionId
        }).exec();
        if (tasks.length === 0) {
            yield pushMessage(userId, 'no tasks.');
            return;
        }
        let promises = [];
        promises = promises.concat(tasks.map((task) => __awaiter(this, void 0, void 0, function* () {
            yield sskts.service.task.execute(task.toObject())(taskAdapter, mongoose.connection);
        })));
        try {
            yield Promise.all(promises);
        }
        catch (error) {
            yield pushMessage(userId, `error:${error.message}`);
            return;
        }
        yield pushMessage(userId, 'processed.');
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
