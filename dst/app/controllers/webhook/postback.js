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
 * LINE webhook postbackコントローラー
 */
const ssktsapi = require("@motionpicture/sskts-api-nodejs-client");
const sskts = require("@motionpicture/sskts-domain");
const createDebug = require("debug");
const moment = require("moment");
const otplib = require("otplib");
const request = require("request-promise-native");
const util = require("util");
const LINE = require("../../../line");
const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';
const API_ENDPOINT = process.env.API_ENDPOINT;
if (API_ENDPOINT === undefined) {
    throw new Error('process.env.API_ENDPOINT undefined.');
}
/**
 * IDで取引検索
 */
function searchTransactionById(user, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(user.userId, transactionId);
        yield LINE.pushMessage(user.userId, '取引IDで検索しています...');
        // 取引検索
        const placeOrderService = new ssktsapi.service.txn.PlaceOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const searchResult = yield placeOrderService.search({
            typeOf: ssktsapi.factory.transactionType.PlaceOrder,
            ids: [transactionId]
        });
        const transaction = searchResult.data.shift();
        if (transaction === undefined) {
            yield LINE.pushMessage(user.userId, `存在しない取引IDです: ${transactionId}`);
            return;
        }
        switch (transaction.status) {
            case ssktsapi.factory.transactionStatusType.InProgress:
                yield LINE.pushMessage(user.userId, `注文取引[${transactionId}]は進行中です`);
                break;
            case ssktsapi.factory.transactionStatusType.Confirmed:
                yield pushTransactionDetails(user.userId, transaction.result.order.orderNumber);
                break;
            case ssktsapi.factory.transactionStatusType.Expired:
                yield pushExpiredTransactionDetails(user, transactionId);
                break;
            default:
        }
    });
}
exports.searchTransactionById = searchTransactionById;
/**
 * 予約番号で取引を検索する
 */
function searchTransactionByReserveNum(user, reserveNum, theaterCode) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(user.userId, reserveNum);
        yield LINE.pushMessage(user.userId, '予約番号で検索しています...');
        // 注文検索
        const orderService = new ssktsapi.service.Order({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const searchOrdersResult = yield orderService.search({
            confirmationNumbers: [reserveNum.toString()],
            acceptedOffers: {
                itemOffered: {
                    reservationFor: {
                        superEvent: {
                            location: {
                                branchCodes: [theaterCode.toString()]
                            }
                        }
                    }
                }
            }
        });
        const order = searchOrdersResult.data.shift();
        if (order === undefined) {
            yield LINE.pushMessage(user.userId, MESSAGE_TRANSACTION_NOT_FOUND);
            return;
        }
        yield pushTransactionDetails(user.userId, order.orderNumber);
    });
}
exports.searchTransactionByReserveNum = searchTransactionByReserveNum;
/**
 * 電話番号で取引を検索する
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
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushTransactionDetails(userId, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);
        const actionRepo = new sskts.repository.Action(sskts.mongoose.connection);
        const orderRepo = new sskts.repository.Order(sskts.mongoose.connection);
        const taskRepo = new sskts.repository.Task(sskts.mongoose.connection);
        const transactionRepo = new sskts.repository.Transaction(sskts.mongoose.connection);
        const ownershipInfo = new sskts.repository.OwnershipInfo(sskts.mongoose.connection);
        // 取引検索
        const transaction = yield transactionRepo.transactionModel.findOne({
            'result.order.orderNumber': orderNumber,
            typeOf: ssktsapi.factory.transactionType.PlaceOrder
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
        // 所有権検索
        const ownershipInfos = yield ownershipInfo.ownershipInfoModel.find({
            identifier: { $in: transactionResult.ownershipInfos.map((o) => o.identifier) }
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        debug(ownershipInfos.length, 'ownershipInfos found.');
        const ownershipInfosStr = ownershipInfos.map((i) => {
            switch (i.typeOfGood.typeOf) {
                case ssktsapi.factory.reservationType.EventReservation:
                    return util.format('💲%s\n%s %s\n@%s\n~%s', i.identifier, (i.typeOfGood.reservedTicket.ticketedSeat !== undefined) ? i.typeOfGood.reservedTicket.ticketedSeat.seatNumber : '', i.typeOfGood.reservedTicket.coaTicketInfo.ticketName, i.typeOfGood.reservationStatus, moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss'));
                case 'ProgramMembership':
                    return util.format('💲%s\n%s\n~%s', i.identifier, i.typeOfGood.programName, moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss'));
                case ssktsapi.factory.pecorino.account.TypeOf.Account:
                    return util.format('💲%s\n%s\n~%s', i.identifier, i.typeOfGood.accountNumber, moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss'));
                default:
                    return i.identifier;
            }
        }).join('\n');
        const report = sskts.service.report.transaction.transaction2report({
            transaction: transaction,
            order: order
        });
        debug('report:', report);
        // 非同期タスク検索
        const tasks = yield taskRepo.taskModel.find({
            'data.transactionId': transaction.id
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        // タスクの実行日時を調べる
        const taskStrs = tasks.map((task) => {
            let taskNameStr = '???';
            switch (task.name) {
                case ssktsapi.factory.taskName.PayAccount:
                    taskNameStr = 'Account支払';
                    break;
                case ssktsapi.factory.taskName.PayCreditCard:
                    taskNameStr = 'クレカ支払';
                    break;
                case ssktsapi.factory.taskName.UseMvtk:
                    taskNameStr = 'ムビ使用';
                    break;
                case ssktsapi.factory.taskName.PlaceOrder:
                    taskNameStr = '注文作成';
                    break;
                case ssktsapi.factory.taskName.SendEmailMessage:
                    taskNameStr = 'メール送信';
                    break;
                case ssktsapi.factory.taskName.SendOrder:
                    taskNameStr = '注文配送';
                    break;
                default:
            }
            let statusStr = '→';
            switch (task.status) {
                case ssktsapi.factory.taskStatus.Ready:
                    statusStr = '-';
                    break;
                case ssktsapi.factory.taskStatus.Executed:
                    statusStr = '↓';
                    break;
                case ssktsapi.factory.taskStatus.Aborted:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s', (task.status === ssktsapi.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--', statusStr, taskNameStr);
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
                case ssktsapi.factory.actionType.ReturnAction:
                    actionName = '返品';
                    break;
                case ssktsapi.factory.actionType.RefundAction:
                    actionName = '返金';
                    break;
                case ssktsapi.factory.actionType.OrderAction:
                    actionName = '注文受付';
                    break;
                case ssktsapi.factory.actionType.SendAction:
                    if (action.object.typeOf === 'Order') {
                        actionName = '配送';
                    }
                    else if (action.object.typeOf === 'EmailMessage') {
                        actionName = 'Eメール送信';
                    }
                    else {
                        actionName = `${action.typeOf} ${action.object.typeOf}`;
                    }
                    break;
                case ssktsapi.factory.actionType.PayAction:
                    actionName = `支払(${action.object[0].paymentMethod.typeOf})`;
                    break;
                case ssktsapi.factory.actionType.UseAction:
                    actionName = `${action.object.typeOf}使用`;
                    break;
                default:
            }
            let statusStr = '→';
            switch (action.actionStatus) {
                case ssktsapi.factory.actionStatusType.CanceledActionStatus:
                    statusStr = '←';
                    break;
                case ssktsapi.factory.actionStatusType.CompletedActionStatus:
                    statusStr = '↓';
                    break;
                case ssktsapi.factory.actionStatusType.FailedActionStatus:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s', moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'), statusStr, actionName);
        }).join('\n');
        // tslint:disable:max-line-length
        const transactionDetails = [`----------------------------
注文状態
----------------------------
${order.orderNumber}
${order.orderStatus}
----------------------------
注文照会キー
----------------------------
${order.orderInquiryKey.confirmationNumber}
${order.orderInquiryKey.telephone}
${order.orderInquiryKey.theaterCode}
----------------------------
注文処理履歴
----------------------------
${actionStrs}
----------------------------
注文アイテム状態
----------------------------
${ownershipInfosStr}
`,
            `----------------------------
販売者情報-${order.orderNumber}
----------------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.identifier}
${transaction.seller.name.ja}
${transaction.seller.url}
----------------------------
購入者情報
----------------------------
${report.customer.name}
${report.customer.telephone}
${report.customer.email}
${(report.customer.memberOf !== undefined) ? `${report.customer.memberOf.membershipNumber}` : '非会員'}
----------------------------
座席予約
----------------------------
${report.eventName}
${moment(report.eventStartDate).format('YYYY-MM-DD HH:mm')}-${moment(report.eventEndDate).format('HH:mm')}
@${report.superEventLocation} ${report.eventLocation}
${report.items.map((i) => `${i.typeOf} ${i.name} x${i.numItems} ￥${i.totalPrice}`)}
----------------------------
決済方法
----------------------------
${report.paymentMethod[0]}
${report.paymentMethodId[0]}
${report.price}
----------------------------
割引
----------------------------
${(report.discounts[0] !== undefined) ? report.discounts[0] : ''}
${(report.discountCodes[0] !== undefined) ? report.discountCodes[0] : ''}
￥${(report.discountPrices[0] !== undefined) ? report.discountPrices[0] : ''}
`,
            `----------------------------
注文取引-${order.orderNumber}
----------------------------
${transaction.id}
${report.status}
----------------------------
取引進行クライアント
----------------------------
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.client_id : ''}
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.iss : ''}
----------------------------
取引状況
----------------------------
${moment(report.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(report.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
----------------------------
取引処理履歴
----------------------------
${taskStrs}
`];
        yield Promise.all(transactionDetails.map((text) => __awaiter(this, void 0, void 0, function* () {
            yield LINE.pushMessage(userId, text);
        })));
        // キュー実行のボタン表示
        const postActions = [
            {
                type: 'postback',
                label: '再照会する',
                data: `action=searchTransactionById&transaction=${transaction.id}`
            }
        ];
        if (order.orderStatus === ssktsapi.factory.orderStatus.OrderDelivered) {
            // postActions.push({
            //     type: 'postback',
            //     label: 'メール送信',
            //     data: `action=pushNotification&transaction=${transaction.id}`
            // });
            postActions.push({
                type: 'postback',
                label: '返品する',
                data: `action=startReturnOrder&orderNumber=${order.orderNumber}`
            });
        }
        if (postActions.length > 0) {
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
                                text: '本取引に対して何かアクションを実行しますか？',
                                actions: postActions
                            }
                        }
                    ]
                }
            }).promise();
        }
    });
}
/**
 * 期限切れの取引詳細を報告する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushExpiredTransactionDetails(user, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, `${transactionId}の取引詳細をまとめています...`);
        // 取引検索
        const placeOrderService = new ssktsapi.service.txn.PlaceOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const searchResult = yield placeOrderService.search({
            typeOf: ssktsapi.factory.transactionType.PlaceOrder,
            ids: [transactionId]
        });
        const transaction = searchResult.data.shift();
        if (transaction === undefined) {
            yield LINE.pushMessage(user.userId, `存在しない取引IDです: ${transactionId}`);
            return;
        }
        const actionRepo = new sskts.repository.Action(sskts.mongoose.connection);
        const taskRepo = new sskts.repository.Task(sskts.mongoose.connection);
        const report = sskts.service.report.transaction.transaction2report({ transaction: transaction });
        debug('report:', report);
        // 非同期タスク検索
        const tasks = yield taskRepo.taskModel.find({
            'data.transactionId': transaction.id
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        // タスクの実行日時を調べる
        const taskStrs = tasks.map((task) => {
            let taskNameStr = '???';
            switch (task.name) {
                case ssktsapi.factory.taskName.CancelCreditCard:
                    taskNameStr = 'クレカ取消';
                    break;
                case ssktsapi.factory.taskName.CancelMvtk:
                    taskNameStr = 'ムビ取消';
                    break;
                case ssktsapi.factory.taskName.CancelSeatReservation:
                    taskNameStr = '仮予約取消';
                    break;
                default:
            }
            let statusStr = '→';
            switch (task.status) {
                case ssktsapi.factory.taskStatus.Ready:
                    statusStr = '-';
                    break;
                case ssktsapi.factory.taskStatus.Executed:
                    statusStr = '↓';
                    break;
                case ssktsapi.factory.taskStatus.Aborted:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s', (task.status === ssktsapi.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--', statusStr, taskNameStr);
        }).join('\n');
        // 承認アクション検索
        const actions = yield actionRepo.actionModel.find({
            typeOf: ssktsapi.factory.actionType.AuthorizeAction,
            'purpose.typeOf': ssktsapi.factory.transactionType.PlaceOrder,
            'purpose.id': transaction.id
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        debug('actions:', actions);
        // アクション履歴
        const actionStrs = actions
            .sort((a, b) => moment(a.endDate).unix() - moment(b.endDate).unix())
            .map((action) => {
            let actionName = `${action.typeOf} of ${action.object.typeOf}`;
            if (action.purpose !== undefined) {
                actionName += ` for ${action.purpose.typeOf}`;
            }
            let description = '';
            switch (action.object.typeOf) {
                case ssktsapi.factory.paymentMethodType.CreditCard:
                    actionName = 'クレカオーソリ';
                    description = action.object.orderId;
                    break;
                case ssktsapi.factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation:
                    actionName = '座席仮予約';
                    if (action.result !== undefined) {
                        description = action.result.updTmpReserveSeatResult.tmpReserveNum;
                    }
                    break;
                case ssktsapi.factory.action.authorize.discount.mvtk.ObjectType.Mvtk:
                    actionName = 'ムビチケ承認';
                    if (action.result !== undefined) {
                        description = action.object.seatInfoSyncIn.knyknrNoInfo.map((i) => i.knyknrNo).join(',');
                    }
                    break;
                default:
            }
            let statusStr = '→';
            switch (action.actionStatus) {
                case ssktsapi.factory.actionStatusType.CanceledActionStatus:
                    statusStr = '←';
                    break;
                case ssktsapi.factory.actionStatusType.CompletedActionStatus:
                    statusStr = '↓';
                    break;
                case ssktsapi.factory.actionStatusType.FailedActionStatus:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s\n%s %s', moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'), statusStr, actionName, statusStr, description);
        }).join('\n');
        // tslint:disable:max-line-length
        const transactionDetails = [`----------------------------
注文取引概要
----------------------------
${transaction.id}
${report.status}
----------------------------
販売者情報
----------------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.identifier}
${transaction.seller.name.ja}
${transaction.seller.url}
----------------------------
購入者情報
----------------------------
${report.customer.name}
${report.customer.telephone}
${report.customer.email}
${(report.customer.memberOf !== undefined) ? `${report.customer.memberOf.membershipNumber}` : '非会員'}
`,
            `----------------------------
注文取引
${transaction.id}
----------------------------
取引進行クライアント
----------------------------
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.client_id : ''}
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.iss : ''}
----------------------------
取引状況
----------------------------
${moment(report.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(report.endDate).format('YYYY-MM-DD HH:mm:ss')} 期限切れ
----------------------------
承認アクション履歴
----------------------------
${actionStrs}
----------------------------
取引処理履歴
----------------------------
${taskStrs}
`];
        yield Promise.all(transactionDetails.map((text) => __awaiter(this, void 0, void 0, function* () {
            yield LINE.pushMessage(user.userId, text);
        })));
    });
}
/**
 * 返品取引開始
 */
function startReturnOrder(user, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, '返品取引を開始します...');
        const returnOrderService = new ssktsapi.service.transaction.ReturnOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const returnOrderTransaction = yield returnOrderService.start({
            // tslint:disable-next-line:no-magic-numbers
            expires: moment().add(15, 'minutes').toDate(),
            object: {
                order: { orderNumber: orderNumber }
            }
        });
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
        yield LINE.pushMessage(user.userId, '返品取引を開始しました');
        yield LINE.pushMessage(user.userId, '二段階認証を行います。送信されてくる文字列を入力してください');
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
            yield LINE.pushMessage(user.userId, 'パスの有効期限が切れました');
            return;
        }
        // パス削除
        yield user.deleteMFAPass(pass);
        const returnOrderService = new ssktsapi.service.transaction.ReturnOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        yield returnOrderService.confirm({
            id: transactionId
        });
        debug('return order transaction confirmed.');
        yield LINE.pushMessage(user.userId, '返品取引を受け付けました');
    });
}
exports.confirmReturnOrder = confirmReturnOrder;
/**
 * 取引検索(csvダウンロード)
 * @param date YYYY-MM-DD形式
 */
function searchTransactionsByDate(userId, date) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, `${date}の取引を検索しています...`);
        const startFrom = moment(`${date}T00:00:00+09:00`);
        const startThrough = moment(`${date}T00:00:00+09:00`).add(1, 'day');
        const csv = yield sskts.service.report.transaction.download({
            startFrom: startFrom.toDate(),
            startThrough: startThrough.toDate()
        }, 'csv')({
            transaction: new sskts.repository.Transaction(sskts.mongoose.connection)
        });
        yield LINE.pushMessage(userId, 'csvを作成しています...');
        const sasUrl = yield sskts.service.util.uploadFile({
            fileName: `sskts-line-assistant-transactions-${moment().format('YYYYMMDDHHmmss')}.csv`,
            text: csv
        })();
        yield LINE.pushMessage(userId, `download -> ${sasUrl} `);
    });
}
exports.searchTransactionsByDate = searchTransactionsByDate;
