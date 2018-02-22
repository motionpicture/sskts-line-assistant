/**
 * LINE webhook postbackコントローラー
 * @namespace app.controllers.webhook.postback
 */

import * as ssktsapi from '@motionpicture/sskts-api-nodejs-client';
import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as otplib from 'otplib';
import * as request from 'request-promise-native';
import * as util from 'util';

import * as LINE from '../../../line';
import User from '../../user';

const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';

/**
 * IDで取引検索
 */
export async function searchTransactionById(userId: string, transactionId: string) {
    debug(userId, transactionId);
    await LINE.pushMessage(userId, '取引IDで検索しています...');

    // 取引検索
    const transactionRepo = new sskts.repository.Transaction(sskts.mongoose.connection);
    const transaction = await transactionRepo.findPlaceOrderById(transactionId);

    switch (transaction.status) {
        case sskts.factory.transactionStatusType.InProgress:
            await LINE.pushMessage(userId, `注文取引[${transactionId}]は進行中です。`);
            break;

        case sskts.factory.transactionStatusType.Confirmed:
            await pushTransactionDetails(userId, (<sskts.factory.transaction.placeOrder.IResult>transaction.result).order.orderNumber);
            break;

        case sskts.factory.transactionStatusType.Expired:
            await pushExpiredTransactionDetails(userId, transactionId);
            break;

        default:
    }
}

/**
 * 予約番号で取引を検索する
 * @export
 * @param userId LINEユーザーID
 * @param reserveNum 予約番号
 * @param theaterCode 劇場コード
 */
export async function searchTransactionByReserveNum(userId: string, reserveNum: string, theaterCode: string) {
    debug(userId, reserveNum);
    await LINE.pushMessage(userId, '予約番号で検索しています...');

    // 取引検索
    const transactionRepo = new sskts.repository.Transaction(sskts.mongoose.connection);
    await transactionRepo.transactionModel.findOne(
        {
            // tslint:disable-next-line:no-magic-numbers
            'result.order.orderInquiryKey.confirmationNumber': parseInt(reserveNum, 10),
            'result.order.orderInquiryKey.theaterCode': theaterCode
        },
        'result'
    ).exec().then(async (doc) => {
        if (doc === null) {
            await LINE.pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
        } else {
            const transaction = <sskts.factory.transaction.placeOrder.ITransaction>doc.toObject();
            await pushTransactionDetails(userId, (<sskts.factory.transaction.placeOrder.IResult>transaction.result).order.orderNumber);
        }
    });
}

/**
 * 電話番号で取引を検索する
 * @export
 * @param userId LINEユーザーID
 * @param tel 電話番号
 * @param theaterCode 劇場コード
 */
export async function searchTransactionByTel(userId: string, tel: string, __: string) {
    debug('tel:', tel);
    await LINE.pushMessage(userId, 'implementing...');
}

/**
 * 取引IDから取引情報詳細を送信する
 * @export
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function pushTransactionDetails(userId: string, orderNumber: string) {
    await LINE.pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);

    const actionRepo = new sskts.repository.Action(sskts.mongoose.connection);
    const orderRepo = new sskts.repository.Order(sskts.mongoose.connection);
    const taskRepo = new sskts.repository.Task(sskts.mongoose.connection);
    const transactionRepo = new sskts.repository.Transaction(sskts.mongoose.connection);
    const ownershipInfo = new sskts.repository.OwnershipInfo(sskts.mongoose.connection);

    // 取引検索
    const transaction = <sskts.factory.transaction.placeOrder.ITransaction>await transactionRepo.transactionModel.findOne({
        'result.order.orderNumber': orderNumber,
        typeOf: sskts.factory.transactionType.PlaceOrder
    }).then((doc: sskts.mongoose.Document) => doc.toObject());

    // 確定取引なので、結果はundefinedではない
    const transactionResult = <sskts.factory.transaction.placeOrder.IResult>transaction.result;

    // 注文検索
    let order = await orderRepo.orderModel.findOne({
        orderNumber: orderNumber
    }).exec().then((doc) => {
        return (doc === null) ? null : <sskts.factory.order.IOrder>doc.toObject();
    });
    debug('order:', order);
    if (order === null) {
        // 注文未作成であれば取引データから取得
        order = transactionResult.order;
    }

    // 所有権検索
    type IReservation = ssktsapi.factory.reservation.event.IEventReservation<ssktsapi.factory.event.individualScreeningEvent.IEvent>;
    const ownershipInfos = await ownershipInfo.ownershipInfoModel.find({
        identifier: { $in: transactionResult.ownershipInfos.map((o) => o.identifier) }
    }).exec().then((docs) => docs.map((doc) => <ssktsapi.factory.ownershipInfo.IOwnershipInfo<IReservation>>doc.toObject()));
    debug(ownershipInfos.length, 'ownershipInfos found.');

    const ownershipInfosStr = ownershipInfos.map(
        (i) => {
            return util.format(
                '💲%s\n%s %s\n@%s\n~%s',
                i.identifier,
                i.typeOfGood.reservedTicket.ticketedSeat.seatNumber,
                i.typeOfGood.reservedTicket.coaTicketInfo.ticketName,
                i.typeOfGood.reservationStatus,
                moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss')
            );
        }
    ).join('\n');

    const report = sskts.service.transaction.placeOrder.transaction2report(transaction);
    debug('report:', report);

    // 非同期タスク検索
    const tasks = await taskRepo.taskModel.find({
        'data.transactionId': transaction.id
    }).exec().then((docs) => docs.map((doc) => <sskts.factory.task.ITask>doc.toObject()));

    // タスクの実行日時を調べる
    const taskStrs = tasks.map((task) => {
        let taskNameStr = '???';
        switch (task.name) {
            case sskts.factory.taskName.PayPecorino:
                taskNameStr = 'Pecorino支払';
                break;
            case sskts.factory.taskName.PayCreditCard:
                taskNameStr = 'クレカ支払';
                break;
            case sskts.factory.taskName.UseMvtk:
                taskNameStr = 'ムビ使用';
                break;
            case sskts.factory.taskName.PlaceOrder:
                taskNameStr = '注文作成';
                break;
            case sskts.factory.taskName.SendEmailMessage:
                taskNameStr = 'メール送信';
                break;
            case sskts.factory.taskName.SendOrder:
                taskNameStr = '注文配送';
                break;
            default:
        }

        let statusStr = '→';
        switch (task.status) {
            case sskts.factory.taskStatus.Ready:
                statusStr = '-';
                break;
            case sskts.factory.taskStatus.Executed:
                statusStr = '↓';
                break;
            case sskts.factory.taskStatus.Aborted:
                statusStr = '×';
                break;

            default:
        }

        return util.format(
            '%s\n%s %s',
            (task.status === sskts.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--',
            statusStr,
            taskNameStr
        );
    }).join('\n');

    // 注文に対するアクション検索
    const actions = await actionRepo.actionModel.find(
        {
            $or: [
                { 'object.orderNumber': orderNumber },
                { 'purpose.orderNumber': orderNumber }
            ]
        }
    ).exec().then((docs) => docs.map((doc) => doc.toObject()));
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
                    } else if (action.object.typeOf === 'EmailMessage') {
                        actionName = 'Eメール送信';
                    } else {
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

            return util.format(
                '%s\n%s %s',
                moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'),
                statusStr,
                actionName
            );
        }).join('\n');

    // tslint:disable:max-line-length
    const transactionDetails = `----------------------------
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

----------------------------
注文取引
----------------------------
${transaction.id}
${report.status}
----------------------------
取引進行クライアント
----------------------------
${transaction.object.clientUser.client_id}
${transaction.object.clientUser.iss}
----------------------------
取引状況
----------------------------
${moment(report.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(report.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
----------------------------
取引処理履歴
----------------------------
${taskStrs}
----------------------------
販売者情報
----------------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.name}
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
${report.reservedTickets}
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
`
        ;

    await LINE.pushMessage(userId, transactionDetails);

    // キュー実行のボタン表示
    const postActions = [];
    if (order.orderStatus === sskts.factory.orderStatus.OrderDelivered) {
        postActions.push({
            type: 'postback',
            label: 'メール送信',
            data: `action=pushNotification&transaction=${transaction.id}`
        });
        postActions.push({
            type: 'postback',
            label: '返品する',
            data: `action=startReturnOrder&transaction=${transaction.id}`
        });
    }

    if (postActions.length > 0) {
        await request.post({
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
                            text: '以下アクションを実行できます。',
                            actions: postActions
                        }
                    }
                ]
            }
        }).promise();
    }
}

/**
 * 期限切れの取引詳細を報告する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function pushExpiredTransactionDetails(userId: string, transactionId: string) {
    await LINE.pushMessage(userId, `${transactionId}の取引詳細をまとめています...`);

    const actionRepo = new sskts.repository.Action(sskts.mongoose.connection);
    const taskRepo = new sskts.repository.Task(sskts.mongoose.connection);
    const transactionRepo = new sskts.repository.Transaction(sskts.mongoose.connection);

    // 取引検索
    const transaction = await transactionRepo.findPlaceOrderById(transactionId);
    const report = sskts.service.transaction.placeOrder.transaction2report(transaction);
    debug('report:', report);

    // 非同期タスク検索
    const tasks = await taskRepo.taskModel.find({
        'data.transactionId': transaction.id
    }).exec().then((docs) => docs.map((doc) => <sskts.factory.task.ITask>doc.toObject()));

    // タスクの実行日時を調べる
    const taskStrs = tasks.map((task) => {
        let taskNameStr = '???';
        switch (task.name) {
            case sskts.factory.taskName.CancelCreditCard:
                taskNameStr = 'クレカ取消';
                break;
            case sskts.factory.taskName.CancelMvtk:
                taskNameStr = 'ムビ取消';
                break;
            case sskts.factory.taskName.CancelSeatReservation:
                taskNameStr = '仮予約取消';
                break;
            default:
        }

        let statusStr = '→';
        switch (task.status) {
            case sskts.factory.taskStatus.Ready:
                statusStr = '-';
                break;
            case sskts.factory.taskStatus.Executed:
                statusStr = '↓';
                break;
            case sskts.factory.taskStatus.Aborted:
                statusStr = '×';
                break;

            default:
        }

        return util.format(
            '%s\n%s %s',
            (task.status === sskts.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--',
            statusStr,
            taskNameStr
        );
    }).join('\n');

    // 承認アクション検索
    const actions = await actionRepo.actionModel.find(
        {
            typeOf: sskts.factory.actionType.AuthorizeAction,
            'object.transactionId': transaction.id
        }
    ).exec().then((docs) => docs.map((doc) => doc.toObject()));
    debug('actions:', actions);

    // アクション履歴
    const actionStrs = actions
        .sort((a, b) => moment(a.endDate).unix() - moment(b.endDate).unix())
        .map((action) => {
            let actionName = action.purpose.typeOf;
            let description = '';
            switch (action.object.typeOf) {
                case sskts.factory.action.authorize.creditCard.ObjectType.CreditCard:
                    actionName = 'クレカオーソリ';
                    description = action.object.orderId;
                    break;
                case sskts.factory.action.authorize.seatReservation.ObjectType.SeatReservation:
                    actionName = '座席仮予約';
                    if (action.result !== undefined) {
                        description = action.result.updTmpReserveSeatResult.tmpReserveNum;
                    }
                    break;
                case sskts.factory.action.authorize.mvtk.ObjectType.Mvtk:
                    actionName = 'ムビチケ承認';
                    if (action.result !== undefined) {
                        description = (<sskts.factory.action.authorize.mvtk.IAction>action).object.seatInfoSyncIn.knyknrNoInfo.map((i) => i.knyknrNo).join(',');
                    }
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

            return util.format(
                '%s\n%s %s\n%s %s',
                moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'),
                statusStr,
                actionName,
                statusStr,
                description
            );
        }).join('\n');

    // tslint:disable:max-line-length
    const transactionDetails = `----------------------------
注文取引概要
----------------------------
${transaction.id}
${report.status}
----------------------------
取引進行クライアント
----------------------------
${transaction.object.clientUser.client_id}
${transaction.object.clientUser.iss}
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
----------------------------
販売者情報
----------------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.name}
${transaction.seller.url}
----------------------------
購入者情報
----------------------------
${report.customer.name}
${report.customer.telephone}
${report.customer.email}
${(report.customer.memberOf !== undefined) ? `${report.customer.memberOf.membershipNumber}` : '非会員'}
`
        ;

    await LINE.pushMessage(userId, transactionDetails);
}

/**
 * 返品取引開始
 */
export async function startReturnOrder(user: User, transactionId: string) {
    await LINE.pushMessage(user.userId, '返品取引を開始します...');
    const API_ENDPOINT = process.env.API_ENDPOINT;
    if (API_ENDPOINT === undefined) {
        throw new Error('process.env.API_ENDPOINT undefined.');
    }

    const returnOrderService = new ssktsapi.service.transaction.ReturnOrder({
        endpoint: API_ENDPOINT,
        auth: user.authClient
    });
    const returnOrderTransaction = await returnOrderService.start({
        // tslint:disable-next-line:no-magic-numbers
        expires: moment().add(15, 'minutes').toDate(),
        transactionId: transactionId
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
            type: <any>'user',
            userId: user.userId
        },
        timestamp: 1487085535998,
        type: <LINE.IEventType>'postback'
    };
    await user.saveMFAPass(pass, postEvent);

    await LINE.pushMessage(user.userId, '返品取引を開始しました。');
    await LINE.pushMessage(user.userId, '二段階認証を行います。送信されてくる文字列を入力してください。');
    await LINE.pushMessage(user.userId, pass);
}

/**
 * 返品取引確定
 */
export async function confirmReturnOrder(user: User, transactionId: string, pass: string) {
    await LINE.pushMessage(user.userId, '返品取引を受け付けようとしています...');

    const postEvent = await user.verifyMFAPass(pass);
    if (postEvent === null) {
        await LINE.pushMessage(user.userId, 'パスの有効期限が切れました。');

        return;
    }

    // パス削除
    await user.deleteMFAPass(pass);

    const API_ENDPOINT = process.env.API_ENDPOINT;
    if (API_ENDPOINT === undefined) {
        throw new Error('process.env.API_ENDPOINT undefined.');
    }
    const returnOrderService = new ssktsapi.service.transaction.ReturnOrder({
        endpoint: API_ENDPOINT,
        auth: user.authClient
    });
    const result = await returnOrderService.confirm({
        transactionId: transactionId
    });
    debug('return order transaction confirmed.', result);

    await LINE.pushMessage(user.userId, '返品取引を受け付けました。');
}

/**
 * 取引を通知する
 * @export
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
export async function pushNotification(userId: string, transactionId: string) {
    await LINE.pushMessage(userId, '送信中...');

    const taskRepo = new sskts.repository.Task(sskts.mongoose.connection);

    // タスク検索
    const tasks = await taskRepo.taskModel.find({
        name: sskts.factory.taskName.SendEmailMessage,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await LINE.pushMessage(userId, 'Task not found.');

        return;
    }

    let promises: Promise<void>[] = [];
    promises = promises.concat(tasks.map(async (task) => {
        await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskRepo, sskts.mongoose.connection);
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await LINE.pushMessage(userId, `送信失敗:${error.message}`);

        return;
    }

    await LINE.pushMessage(userId, '送信完了');
}

/**
 * 取引検索(csvダウンロード)
 * @export
 * @param userId ユーザーID
 * @param date YYYY-MM-DD形式
 */
export async function searchTransactionsByDate(userId: string, date: string) {
    await LINE.pushMessage(userId, `${date}の取引を検索しています...`);

    const startFrom = moment(`${date}T00:00:00+09:00`);
    const startThrough = moment(`${date}T00:00:00+09:00`).add(1, 'day');

    const csv = await sskts.service.transaction.placeOrder.download(
        {
            startFrom: startFrom.toDate(),
            startThrough: startThrough.toDate()
        },
        'csv'
    )(new sskts.repository.Transaction(sskts.mongoose.connection));

    await LINE.pushMessage(userId, 'csvを作成しています...');

    const sasUrl = await sskts.service.util.uploadFile({
        fileName: `sskts-line-assistant-transactions-${moment().format('YYYYMMDDHHmmss')}.csv`,
        text: csv
    })();

    await LINE.pushMessage(userId, `download -> ${sasUrl} `);
}
