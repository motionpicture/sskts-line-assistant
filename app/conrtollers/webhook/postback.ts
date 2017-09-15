/**
 * LINE webhook postbackコントローラー
 */

// import * as COA from '@motionpicture/coa-service';
import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as request from 'request-promise-native';
import * as util from 'util';

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
    const transactionAdapter = new sskts.repository.Transaction(mongoose.connection);
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
    // const transactionAdapter = sskts.repository.transaction(mongoose.connection);
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

    const orderAdapter = new sskts.repository.Order(mongoose.connection);
    const taskAdapter = new sskts.repository.Task(mongoose.connection);
    const transactionAdapter = new sskts.repository.Transaction(mongoose.connection);

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
    const report = sskts.service.transaction.placeOrder.transaction2report(placeOrderTransaction);
    debug('report:', report);

    // 非同期タスク検索
    const tasks = <sskts.factory.task.ITask[]>await taskAdapter.taskModel.find({
        'data.transactionId': placeOrderTransaction.id
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

        return util.format(
            '%s %s',
            (task.status === sskts.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--',
            taskNameStr
        );
    }).join('\n');

    // tslint:disable:max-line-length
    const transactionDetails = `--------------------
注文取引概要
--------------------
取引ステータス: ${report.status}
注文ステータス: ${order.orderStatus}
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
${report.name}
${report.telephone}
${report.email}
${(order.customer.memberOf !== undefined) ? `${order.customer.memberOf.programName} ${order.customer.memberOf.membershipNumber}` : ''}
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
${report.discountPrices}
--------------------
QR
--------------------
${order.acceptedOffers.map((offer) => `●${offer.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${offer.itemOffered.reservedTicket.ticketToken}`).join('\n')}
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
                                data: `action=settleSeatReservation&transaction=${placeOrderTransaction.id}`
                            },
                            {
                                type: 'postback',
                                label: '所有権作成',
                                data: `action=createOwnershipInfos&transaction=${placeOrderTransaction.id}`
                            }
                        ]
                    }
                }
            ]
        }
    }).promise();
}

export async function pushNotification(userId: string, transactionId: string) {
    await pushMessage(userId, '送信中...');

    const taskAdapter = new sskts.repository.Task(mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.SendEmailNotification,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await pushMessage(userId, 'Task not found.');

        return;
    }

    let promises: Promise<void>[] = [];
    promises = promises.concat(tasks.map(async (task) => {
        await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, mongoose.connection);
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await pushMessage(userId, `送信失敗:${error.message}`);

        return;
    }

    await pushMessage(userId, '送信完了');
}

export async function settleSeatReservation(userId: string, transactionId: string) {
    await pushMessage(userId, '本予約中...');

    const taskAdapter = new sskts.repository.Task(mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.SettleSeatReservation,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await pushMessage(userId, 'Task not found.');

        return;
    }

    try {
        await Promise.all(tasks.map(async (task) => {
            await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, mongoose.connection);
        }));
    } catch (error) {
        await pushMessage(userId, `本予約失敗:${error.message}`);

        return;
    }

    await pushMessage(userId, '本予約完了');
}

export async function createOwnershipInfos(userId: string, transactionId: string) {
    await pushMessage(userId, '所有権作成中...');

    const taskAdapter = new sskts.repository.Task(mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.CreateOwnershipInfos,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await pushMessage(userId, 'Task not found.');

        return;
    }

    try {
        await Promise.all(tasks.map(async (task) => {
            await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, mongoose.connection);
        }));
    } catch (error) {
        await pushMessage(userId, `所有権作成失敗:${error.message}`);

        return;
    }

    await pushMessage(userId, '所有権作成完了');
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
