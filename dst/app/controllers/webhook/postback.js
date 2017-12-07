"use strict";
/**
 * LINE webhook postbackコントローラー
 * @namespace app.controllers.webhook.postback
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
const sskts = require("@motionpicture/sskts-domain");
const createDebug = require("debug");
const moment = require("moment");
const request = require("request-promise-native");
const util = require("util");
const LINE = require("../../../line");
const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';
/**
 * 予約番号で取引を検索する
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param {string} userId LINEユーザーID
 * @param {string} reserveNum 予約番号
 * @param {string} theaterCode 劇場コード
 */
function searchTransactionByReserveNum(userId, reserveNum, theaterCode) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(userId, reserveNum);
        yield LINE.pushMessage(userId, '予約番号で検索しています...');
        // 取引検索
        const transactionAdapter = new sskts.repository.Transaction(sskts.mongoose.connection);
        yield transactionAdapter.transactionModel.findOne({
            // tslint:disable-next-line:no-magic-numbers
            'result.order.orderInquiryKey.confirmationNumber': parseInt(reserveNum, 10),
            'result.order.orderInquiryKey.theaterCode': theaterCode
        }, 'result').exec().then((doc) => __awaiter(this, void 0, void 0, function* () {
            if (doc === null) {
                yield LINE.pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
            }
            else {
                const transaction = doc.toObject();
                yield pushTransactionDetails(userId, transaction.result.order.orderNumber);
            }
        }));
    });
}
exports.searchTransactionByReserveNum = searchTransactionByReserveNum;
/**
 * 電話番号で取引を検索する
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param {string} userId LINEユーザーID
 * @param {string} tel 電話番号
 * @param {string} theaterCode 劇場コード
 */
function searchTransactionByTel(userId, tel, __) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('tel:', tel);
        yield LINE.pushMessage(userId, 'implementing...');
    });
}
exports.searchTransactionByTel = searchTransactionByTel;
/**
 * 取引IDから取引情報詳細を送信する
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param {string} userId LINEユーザーID
 * @param {string} transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushTransactionDetails(userId, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);
        const orderRepo = new sskts.repository.Order(sskts.mongoose.connection);
        const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);
        const transactionAdapter = new sskts.repository.Transaction(sskts.mongoose.connection);
        // 注文検索
        const order = yield orderRepo.orderModel.findOne({
            orderNumber: orderNumber
        }).exec().then((doc) => {
            return (doc === null) ? null : doc.toObject();
        });
        debug('order:', order);
        // 取引検索
        const transaction = yield transactionAdapter.transactionModel.findOne({
            'result.order.orderNumber': orderNumber,
            typeOf: sskts.factory.transactionType.PlaceOrder
        }).then((doc) => doc.toObject());
        const report = sskts.service.transaction.placeOrder.transaction2report(transaction);
        debug('report:', report);
        // 確定取引なので、結果はundefinedではない
        const transactionResult = transaction.result;
        // 非同期タスク検索
        const tasks = yield taskAdapter.taskModel.find({
            'data.transactionId': transaction.id
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        // タスクの実行日時を調べる
        const taskStrs = tasks.map((task) => {
            let taskNameStr = '???';
            switch (task.name) {
                case sskts.factory.taskName.SettleSeatReservation:
                    taskNameStr = '本予約';
                    break;
                case sskts.factory.taskName.SettleCreditCard:
                    taskNameStr = '売上';
                    break;
                case sskts.factory.taskName.SettleMvtk:
                    taskNameStr = 'ムビ処理';
                    break;
                case sskts.factory.taskName.CreateOrder:
                    taskNameStr = '注文作成';
                    break;
                case sskts.factory.taskName.CreateOwnershipInfos:
                    taskNameStr = '所有権作成';
                    break;
                case sskts.factory.taskName.SendEmailNotification:
                    taskNameStr = 'メール送信';
                    break;
                default:
                    break;
            }
            return util.format('%s %s', (task.status === sskts.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--', taskNameStr);
        }).join('\n');
        // tslint:disable:max-line-length
        const transactionDetails = `--------------------
注文取引概要
--------------------
取引ステータス: ${report.status}
注文ステータス: ${(order !== null) ? order.orderStatus : ''}
予約番号: ${report.confirmationNumber}
劇場: ${report.superEventLocation}
--------------------
注文取引状況
--------------------
${moment(report.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(report.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
${taskStrs}
--------------------
購入者情報
--------------------
${report.customer.name}
${report.customer.telephone}
${report.customer.email}
${(report.customer.memberOf !== undefined) ? `${report.customer.memberOf.membershipNumber}` : ''}
--------------------
座席予約
--------------------
${report.eventName}
${moment(report.eventStartDate).format('YYYY-MM-DD HH:mm')}-${moment(report.eventEndDate).format('HH:mm')}
@${report.superEventLocation} ${report.eventLocation}
${report.reservedTickets}
--------------------
決済方法
--------------------
${report.paymentMethod}
${report.paymentMethodId}
${report.price}
--------------------
割引
--------------------
${report.discounts}
${report.discountCodes}
￥${report.discountPrices}
--------------------
QR
--------------------
${transactionResult.order.acceptedOffers.map((offer) => `●${offer.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${offer.itemOffered.reservedTicket.ticketToken}`).join('\n')}
`;
        yield LINE.pushMessage(userId, transactionDetails);
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
                                    data: `action=pushNotification&transaction=${transaction.id}`
                                },
                                {
                                    type: 'postback',
                                    label: '本予約',
                                    data: `action=settleSeatReservation&transaction=${transaction.id}`
                                },
                                {
                                    type: 'postback',
                                    label: '所有権作成',
                                    data: `action=createOwnershipInfos&transaction=${transaction.id}`
                                }
                            ]
                        }
                    }
                ]
            }
        }).promise();
    });
}
/**
 * 取引を通知する
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
function pushNotification(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, '送信中...');
        const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);
        // タスク検索
        const tasks = yield taskAdapter.taskModel.find({
            name: sskts.factory.taskName.SendEmailNotification,
            'data.transactionId': transactionId
        }).exec();
        if (tasks.length === 0) {
            yield LINE.pushMessage(userId, 'Task not found.');
            return;
        }
        let promises = [];
        promises = promises.concat(tasks.map((task) => __awaiter(this, void 0, void 0, function* () {
            yield sskts.service.task.execute(task.toObject())(taskAdapter, sskts.mongoose.connection);
        })));
        try {
            yield Promise.all(promises);
        }
        catch (error) {
            yield LINE.pushMessage(userId, `送信失敗:${error.message}`);
            return;
        }
        yield LINE.pushMessage(userId, '送信完了');
    });
}
exports.pushNotification = pushNotification;
/**
 * 座席の本予約を実行する
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
function settleSeatReservation(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, '本予約中...');
        const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);
        // タスク検索
        const tasks = yield taskAdapter.taskModel.find({
            name: sskts.factory.taskName.SettleSeatReservation,
            'data.transactionId': transactionId
        }).exec();
        if (tasks.length === 0) {
            yield LINE.pushMessage(userId, 'Task not found.');
            return;
        }
        try {
            yield Promise.all(tasks.map((task) => __awaiter(this, void 0, void 0, function* () {
                yield sskts.service.task.execute(task.toObject())(taskAdapter, sskts.mongoose.connection);
            })));
        }
        catch (error) {
            yield LINE.pushMessage(userId, `本予約失敗:${error.message}`);
            return;
        }
        yield LINE.pushMessage(userId, '本予約完了');
    });
}
exports.settleSeatReservation = settleSeatReservation;
/**
 * 所有権作成を実行する
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
function createOwnershipInfos(userId, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, '所有権作成中...');
        const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);
        // タスク検索
        const tasks = yield taskAdapter.taskModel.find({
            name: sskts.factory.taskName.CreateOwnershipInfos,
            'data.transactionId': transactionId
        }).exec();
        if (tasks.length === 0) {
            yield LINE.pushMessage(userId, 'Task not found.');
            return;
        }
        try {
            yield Promise.all(tasks.map((task) => __awaiter(this, void 0, void 0, function* () {
                yield sskts.service.task.execute(task.toObject())(taskAdapter, sskts.mongoose.connection);
            })));
        }
        catch (error) {
            yield LINE.pushMessage(userId, `所有権作成失敗:${error.message}`);
            return;
        }
        yield LINE.pushMessage(userId, '所有権作成完了');
    });
}
exports.createOwnershipInfos = createOwnershipInfos;
/**
 * 取引検索(csvダウンロード)
 * @export
 * @function
 * @memberof app.controllers.webhook.postback
 * @param {string} userId
 * @param {string} date YYYY-MM-DD形式
 */
function searchTransactionsByDate(userId, date) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, `${date}の取引を検索しています...`);
        const startFrom = moment(`${date}T00:00:00+09:00`);
        const startThrough = moment(`${date}T00:00:00+09:00`).add(1, 'day');
        const csv = yield sskts.service.transaction.placeOrder.download({
            startFrom: startFrom.toDate(),
            startThrough: startThrough.toDate()
        }, 'csv')(new sskts.repository.Transaction(sskts.mongoose.connection));
        yield LINE.pushMessage(userId, 'csvを作成しています...');
        const sasUrl = yield sskts.service.util.uploadFile({
            fileName: `sskts-line-assistant-transactions-${moment().format('YYYYMMDDHHmmss')}.csv`,
            text: csv
        })();
        yield LINE.pushMessage(userId, `download -> ${sasUrl} `);
    });
}
exports.searchTransactionsByDate = searchTransactionsByDate;
