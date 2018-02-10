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
const otplib = require("otplib");
const request = require("request-promise-native");
const util = require("util");
const LINE = require("../../../line");
const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';
/**
 * 予約番号で取引を検索する
 * @export
 * @param userId LINEユーザーID
 * @param reserveNum 予約番号
 * @param theaterCode 劇場コード
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
 * @param userId LINEユーザーID
 * @param tel 電話番号
 * @param theaterCode 劇場コード
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
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushTransactionDetails(userId, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);
        const actionRepo = new sskts.repository.Action(sskts.mongoose.connection);
        const orderRepo = new sskts.repository.Order(sskts.mongoose.connection);
        const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);
        const transactionAdapter = new sskts.repository.Transaction(sskts.mongoose.connection);
        // 取引検索
        const transaction = yield transactionAdapter.transactionModel.findOne({
            'result.order.orderNumber': orderNumber,
            typeOf: sskts.factory.transactionType.PlaceOrder
        }).then((doc) => doc.toObject());
        // 確定取引なので、結果はundefinedではない
        const transactionResult = transaction.result;
        // 注文検索
        let order = yield orderRepo.orderModel.findOne({
            orderNumber: orderNumber
        }).exec().then((doc) => {
            return (doc === null) ? null : doc.toObject();
        });
        debug('order:', order);
        if (order === null) {
            // 注文未作成であれば取引データから取得
            order = transactionResult.order;
        }
        const report = sskts.service.transaction.placeOrder.transaction2report(transaction);
        debug('report:', report);
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
                    taskNameStr = 'クレカ支払';
                    break;
                case sskts.factory.taskName.SettleMvtk:
                    taskNameStr = 'ムビ使用';
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
                case sskts.factory.taskName.SendOrder:
                    taskNameStr = '注文配送';
                    break;
                default:
            }
            return util.format('%s %s', (task.status === sskts.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--', taskNameStr);
        }).join('\n');
        // 注文に対するアクション検索
        const actions = yield actionRepo.actionModel.find({
            $or: [
                { 'object.orderNumber': orderNumber },
                { 'purpose.orderNumber': orderNumber }
            ]
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        debug('actions on order found.', actions);
        // アクション履歴
        const actionStrs = actions
            .sort((a, b) => moment(a.endDate).unix() - moment(b.endDate).unix())
            .map((action) => {
            let actionName = action.typeOf;
            switch (action.typeOf) {
                case sskts.factory.actionType.ReturnAction:
                    actionName = '返品';
                    break;
                case sskts.factory.actionType.RefundAction:
                    actionName = '返金';
                    break;
                case sskts.factory.actionType.OrderAction:
                    actionName = '注文受付';
                    break;
                case sskts.factory.actionType.SendAction:
                    if (action.object.typeOf === 'Order') {
                        actionName = '配送';
                    }
                    else {
                        actionName = `${action.typeOf} ${action.object.typeOf}`;
                    }
                    break;
                case sskts.factory.actionType.PayAction:
                    actionName = `支払(${action.object.paymentMethod.paymentMethod})`;
                    break;
                case sskts.factory.actionType.UseAction:
                    actionName = `${action.object.typeOf}使用`;
                    break;
                default:
            }
            let statusStr = '→';
            switch (action.actionStatus) {
                case sskts.factory.actionStatusType.CanceledActionStatus:
                    statusStr = '←';
                    break;
                case sskts.factory.actionStatusType.CompletedActionStatus:
                    statusStr = '↓';
                    break;
                case sskts.factory.actionStatusType.FailedActionStatus:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s', moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'), statusStr, actionName);
        }).join('\n');
        // tslint:disable:max-line-length
        const transactionDetails = `--------------------
注文取引概要
--------------------
status: ${report.status}
確認番号: ${report.confirmationNumber}
--------------------
取引進行クライアント
--------------------
${transaction.object.clientUser.client_id}
${transaction.object.clientUser.iss}
--------------------
取引状況
--------------------
${moment(report.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(report.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
--------------------
取引タスク
--------------------
${taskStrs}
--------------------
販売者情報
--------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.name}
${transaction.seller.url}
--------------------
購入者情報
--------------------
${report.customer.name}
${report.customer.telephone}
${report.customer.email}
${(report.customer.memberOf !== undefined) ? `${report.customer.memberOf.membershipNumber}` : '非会員'}
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
チケットトークン
--------------------
${transactionResult.order.acceptedOffers.map((offer) => `●${offer.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${offer.itemOffered.reservedTicket.ticketToken}`).join('\n')}
--------------------
注文状態
--------------------
${(order !== null) ? order.orderNumber : ''}
${(order !== null) ? order.orderStatus : ''}
--------------------
注文状況
--------------------
${actionStrs}
`;
        yield LINE.pushMessage(userId, transactionDetails);
        // キュー実行のボタン表示
        const postActions = [
            {
                type: 'postback',
                label: 'メール送信',
                data: `action=pushNotification&transaction=${transaction.id}`
            }
        ];
        if (order.orderStatus === sskts.factory.orderStatus.OrderDelivered) {
            postActions.push({
                type: 'postback',
                label: '返品する',
                data: `action=startReturnOrder&transaction=${transaction.id}`
            });
        }
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
                            actions: postActions
                        }
                    }
                ]
            }
        }).promise();
    });
}
/**
 * 返品取引開始
 */
function startReturnOrder(user, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, '返品取引を開始します...');
        const authClient = user.authClient;
        const returnOrderTransaction = yield authClient.fetch(`${process.env.API_ENDPOINT}/transactions/returnOrder/start`, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${user.accessToken}`
            },
            method: 'POST',
            body: JSON.stringify({
                // tslint:disable-next-line:no-magic-numbers
                expires: moment().add(15, 'minutes').toDate(),
                transactionId: transactionId
            })
        }, 
        // tslint:disable-next-line:no-magic-numbers
        [200]);
        debug('return order transaction started.', returnOrderTransaction.id);
        // 二段階認証のためのワンタイムトークンを保管
        const secret = otplib.authenticator.generateSecret();
        const pass = otplib.authenticator.generate(secret);
        const postEvent = {
            postback: {
                data: `action=confirmReturnOrder&transaction=${returnOrderTransaction.id}&pass=${pass}`
            },
            // replyToken: '26d0dd0923a94583871ecd7e6efec8e2',
            source: {
                type: 'user',
                userId: user.userId
            },
            timestamp: 1487085535998,
            type: 'postback'
        };
        yield user.saveMFAPass(pass, postEvent);
        yield LINE.pushMessage(user.userId, '返品取引を開始しました。');
        yield LINE.pushMessage(user.userId, '二段階認証を行います。送信されてくる文字列を入力してください。');
        yield LINE.pushMessage(user.userId, pass);
    });
}
exports.startReturnOrder = startReturnOrder;
/**
 * 返品取引確定
 */
function confirmReturnOrder(user, transactionId, pass) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, '返品取引を受け付けようとしています...');
        const postEvent = yield user.verifyMFAPass(pass);
        if (postEvent === null) {
            yield LINE.pushMessage(user.userId, 'パスの有効期限が切れました。');
            return;
        }
        // パス削除
        yield user.deleteMFAPass(pass);
        const authClient = user.authClient;
        const result = yield authClient.fetch(`${process.env.API_ENDPOINT}/transactions/returnOrder/${transactionId}/confirm`, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${user.accessToken}`
            },
            method: 'POST'
        }, 
        // tslint:disable-next-line:no-magic-numbers
        [201]);
        debug('return order transaction confirmed.', result);
        yield LINE.pushMessage(user.userId, '返品取引を受け付けました。');
    });
}
exports.confirmReturnOrder = confirmReturnOrder;
/**
 * 取引を通知する
 * @export
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
 * @param userId ユーザーID
 * @param date YYYY-MM-DD形式
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
