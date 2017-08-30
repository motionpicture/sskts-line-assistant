/**
 * LINE webhook postbackコントローラー
 */

// import * as COA from '@motionpicture/coa-service';
import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as request from 'request-promise-native';

const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';

/**
 * 予約番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} reserveNum 予約番号
 * @param {string} theaterCode 劇場コード
 */
export async function searchTransactionByReserveNum(userId: string, reserveNum: string, theaterCode: string) {
    debug(userId, reserveNum);
    await pushMessage(userId, '予約番号で検索しています...');

    // 取引検索
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    const doc = await transactionAdapter.transactionModel.findOne(
        {
            // tslint:disable-next-line:no-magic-numbers
            'result.order.orderInquiryKey.confirmationNumber': parseInt(reserveNum, 10),
            'result.order.orderInquiryKey.theaterCode': theaterCode
        },
        'result'
    ).exec();

    if (doc === null) {
        await pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);

        return;
    }

    await pushTransactionDetails(userId, doc.get('result.order.orderNumber'));
}

/**
 * 電話番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} tel 電話番号
 * @param {string} theaterCode 劇場コード
 */
export async function searchTransactionByTel(userId: string, tel: string, __: string) {
    debug('tel:', tel);
    await pushMessage(userId, 'implementing...');
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
}

/**
 * 取引IDから取引情報詳細を送信する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function pushTransactionDetails(userId: string, orderNumber: string) {
    await pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);

    const orderAdapter = sskts.adapter.order(mongoose.connection);
    const taskAdapter = sskts.adapter.task(mongoose.connection);
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);

    // 注文検索
    const orderDoc = await orderAdapter.orderModel.findOne({
        orderNumber: orderNumber
    }).exec();
    if (orderDoc === null) {
        await pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);

        return;
    }

    const order = <sskts.factory.order.IOrder>orderDoc.toObject();
    debug('order:', order);

    // 取引検索
    const placeOrderTransaction = <sskts.factory.transaction.placeOrder.ITransaction>await transactionAdapter.transactionModel.findOne({
        'result.order.orderNumber': orderNumber,
        typeOf: sskts.factory.transactionType.PlaceOrder
    }).then((doc: mongoose.Document) => doc.toObject());
    debug('placeOrderTransaction:', placeOrderTransaction);

    const tasks = <sskts.factory.task.ITask[]>await taskAdapter.taskModel.find({
        'data.transactionId': placeOrderTransaction.id
    }).exec().then((docs) => docs.map((doc) => doc.toObject()));

    // タスクの実行日時を調べる
    const settleSeatReservationTask = <sskts.factory.task.settleSeatReservation.ITask>tasks.find(
        (task) => task.name === sskts.factory.taskName.SettleSeatReservation
    );
    const settleGMOTask = <sskts.factory.task.settleGMO.ITask>tasks.find(
        (task) => task.name === sskts.factory.taskName.SettleGMO
    );

    const orderItems = order.acceptedOffers;
    const screeningEvent = orderItems[0].itemOffered.reservationFor;
    debug('screeningEvent:', screeningEvent);
    const ticketsStr = orderItems.map(
        // tslint:disable-next-line:max-line-length
        (orderItem) => `●${orderItem.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${orderItem.itemOffered.reservedTicket.coaTicketInfo.ticketName} ￥${orderItem.itemOffered.reservedTicket.coaTicketInfo.salePrice}`
    ).join('\n');

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
${(settleSeatReservationTask.status === sskts.factory.taskStatus.Executed) ? `${moment(<Date>settleSeatReservationTask.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')} 本予約` : ''}
${(settleGMOTask.status === sskts.factory.taskStatus.Executed) ? `${moment(<Date>settleGMOTask.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')} 実売上` : ''}
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
`
        ;

    await pushMessage(userId, transactionDetails);

    // キュー実行のボタン表示
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
}

export async function pushNotification(userId: string, transactionId: string) {
    await pushMessage(userId, 'sending...');

    const taskAdapter = sskts.adapter.task(mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.SendEmailNotification,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await pushMessage(userId, 'no tasks.');

        return;
    }

    let promises: Promise<void>[] = [];
    promises = promises.concat(tasks.map(async (task) => {
        await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, mongoose.connection);
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await pushMessage(userId, `error:${error.message}`);

        return;
    }

    await pushMessage(userId, 'sent.');
}

export async function transferCoaSeatReservationAuthorization(userId: string, transactionId: string) {
    await pushMessage(userId, 'processing...');

    const taskAdapter = sskts.adapter.task(mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.SettleSeatReservation,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await pushMessage(userId, 'no tasks.');

        return;
    }

    let promises: Promise<void>[] = [];
    promises = promises.concat(tasks.map(async (task) => {
        await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, mongoose.connection);
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await pushMessage(userId, `error:${error.message}`);

        return;
    }

    await pushMessage(userId, 'processed.');
}

/**
 * メッセージ送信
 *
 * @param {string} userId
 * @param {string} text
 */
async function pushMessage(userId: string, text: string) {
    await request.post({
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
}
