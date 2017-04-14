/**
 * LINE webhookコントローラー
 */
import * as COA from '@motionpicture/coa-service';
import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as querystring from 'querystring';
import * as request from 'request-promise-native';

const debug = createDebug('sskts-linereport:controller:webhook');

/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
// tslint:disable-next-line:max-func-body-length
export async function message(event: any) {
    const message: string = event.message.text;
    const MID = event.source.userId;

    switch (true) {
        case /^\d{1,8}$/.test(message):
            // 取引検索
            const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
            const performanceAdapter = sskts.adapter.performance(mongoose.connection);
            const queueAdapter = sskts.adapter.queue(mongoose.connection);
            const transactionDoc = await transactionAdapter.transactionModel.findOne({ 'inquiry_key.reserve_num': message })
                .populate('owners').exec();

            if (transactionDoc === null) {
                await pushMessage(MID, 'no transaction');
                return;
            }

            const transaction = sskts.factory.transaction.create(<any>transactionDoc.toObject());
            debug(transaction);
            const anonymousOwnerObject = transaction.owners.find((owner) => owner.group === sskts.factory.ownerGroup.ANONYMOUS);
            if (anonymousOwnerObject === undefined) {
                throw new Error('owner not found');
            }
            const anonymousOwner = sskts.factory.owner.anonymous.create(anonymousOwnerObject);

            const authorizations = await transactionAdapter.findAuthorizationsById(transaction.id);
            const notifications = await transactionAdapter.findNotificationsById(transaction.id);

            const gmoAuthorizationObject = authorizations.find((authorization) => {
                return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.GMO);
            });
            const gmoAuthorization = sskts.factory.authorization.gmo.create(<any>gmoAuthorizationObject);

            const coaSeatReservationAuthorizationObject = authorizations.find((authorization) => {
                return (
                    authorization.owner_to === anonymousOwner.id &&
                    authorization.group === sskts.factory.authorizationGroup.COA_SEAT_RESERVATION
                );
            });
            const coaSeatReservationAuthorization =
                sskts.factory.authorization.coaSeatReservation.create(<any>coaSeatReservationAuthorizationObject);

            const performanceOption =
                await sskts.service.master.findPerformance(coaSeatReservationAuthorization.assets[0].performance)(performanceAdapter);
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
${gmoAuthorization.gmo_order_id}`
                ;
            await pushMessage(MID, transactionDetails);

            if (transaction.status !== sskts.factory.transactionStatus.CLOSED) {
                return;
            }

            if (transaction.inquiry_key !== undefined) {
                // COAからQRを取得
                const stateReserveResult = await COA.ReserveService.stateReserve(
                    {
                        theater_code: transaction.inquiry_key.theater_code,
                        reserve_num: transaction.inquiry_key.reserve_num,
                        tel_num: transaction.inquiry_key.tel
                    }
                );
                debug(stateReserveResult);

                // 本予約済みであればQRコード送信
                if (stateReserveResult !== null) {
                    stateReserveResult.list_ticket.forEach(async (ticket) => {
                        // push message
                        await request.post({
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
                    });
                }
            }

            let queueStatus4coaAuthorization = sskts.factory.queueStatus.UNEXECUTED;
            let queueStatus4gmoAuthorization = sskts.factory.queueStatus.UNEXECUTED;
            let queueStatus4emailNotification = sskts.factory.queueStatus.UNEXECUTED;

            let promises: Promise<void>[] = [];
            promises = promises.concat(authorizations.map(async (authorization) => {
                const queueDoc = await queueAdapter.model.findOne({
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
            }));

            promises = promises.concat(notifications.map(async (notification) => {
                const queueDoc = await queueAdapter.model.findOne({
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
            }));

            await Promise.all(promises);

            await pushMessage(MID, `メール送信:${queueStatus4emailNotification}
本予約:${queueStatus4coaAuthorization}
売上:${queueStatus4gmoAuthorization}`
            );

            // キュー実行のボタン表示
            await request.post({
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
}

/**
 * イベントの送信元が、template messageに付加されたポストバックアクションを実行したことを示すevent objectです。
 */
// tslint:disable-next-line:max-func-body-length
export async function postback(event: any) {
    const data = querystring.parse(event.postback.data);
    debug('data is', data);
    const MID = event.source.userId;

    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    let promises: Promise<void>[] = [];

    switch (data.action) {
        case 'pushNotification':
            await pushMessage(MID, 'メールを送信しています...');

            // 取引検索
            const transactionDoc4notification = await transactionAdapter.transactionModel.findById(data.transaction).exec();

            if (transactionDoc4notification === null) {
                await pushMessage(MID, 'no transaction');
                return;
            }

            if (transactionDoc4notification.get('status') !== sskts.factory.transactionStatus.CLOSED) {
                return;
            }

            const notifications = await transactionAdapter.findNotificationsById(transactionDoc4notification.get('_id'));
            debug(notifications);
            if (notifications.length === 0) {
                await pushMessage(MID, '通知がありません');
                return;
            }

            promises = [];
            promises = promises.concat(notifications.map(async (notification) => {
                switch (notification.group) {
                    case sskts.factory.notificationGroup.EMAIL:
                        await sskts.service.notification.sendEmail(<any>notification)();
                        break;
                    default:
                        break;
                }
            }));

            try {
                await Promise.all(promises);
            } catch (error) {
                await pushMessage(MID, `送信できませんでした ${error.message}`);
                return;
            }

            await pushMessage(MID, '送信しました');
            break;

        case 'transferCoaSeatReservationAuthorization':
            await pushMessage(MID, '本予約処理をしています...');

            // 取引検索
            const transactionDoc4transfer = await transactionAdapter.transactionModel.findById(data.transaction).exec();

            if (transactionDoc4transfer === null) {
                await pushMessage(MID, 'no transaction');
                return;
            }

            if (transactionDoc4transfer.get('status') !== sskts.factory.transactionStatus.CLOSED) {
                return;
            }

            const authorizations = await transactionAdapter.findAuthorizationsById(transactionDoc4transfer.get('_id'));
            debug(authorizations);
            if (authorizations.length === 0) {
                await pushMessage(MID, '仮予約データがありません');
                return;
            }

            promises = [];
            promises = promises.concat(authorizations.map(async (authorization) => {
                switch (authorization.group) {
                    case sskts.factory.authorizationGroup.COA_SEAT_RESERVATION:
                        await sskts.service.stock.transferCOASeatReservation(<any>authorization)(
                            sskts.adapter.asset(mongoose.connection),
                            sskts.adapter.owner(mongoose.connection)
                        );
                        break;
                    default:
                        break;
                }
            }));

            try {
                await Promise.all(promises);
            } catch (error) {
                await pushMessage(MID, `本予約できませんした ${error.message}`);
                return;
            }

            await pushMessage(MID, '本予約完了');
            break;

        default:
            break;
    }
}

/**
 * イベント送信元に友だち追加（またはブロック解除）されたことを示すEvent Objectです。
 */
export async function follow(event: any) {
    debug('event is', event);
    return;
}

/**
 * イベント送信元にブロックされたことを示すevent objectです。
 */
export async function unfollow(event: any) {
    debug('event is', event);
    return;
}

/**
 * イベントの送信元グループまたはトークルームに参加したことを示すevent objectです。
 */
export async function join(event: any) {
    debug('event is', event);
    return;
}

/**
 * イベントの送信元グループから退出させられたことを示すevent objectです。
 */
export async function leave(event: any) {
    debug('event is', event);
    return;
}

/**
 * イベント送信元のユーザがLINE Beaconデバイスの受信圏内に出入りしたことなどを表すイベントです。
 */
export async function beacon(event: any) {
    debug('event is', event);
    return;
}

/**
 * メッセージ送信
 *
 * @param {string} MID
 * @param {string} text
 */
async function pushMessage(MID: string, text: string) {
    // push message
    await request.post({
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
