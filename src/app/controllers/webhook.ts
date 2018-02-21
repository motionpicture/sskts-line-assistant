/**
 * LINE webhookコントローラー
 * @namespace app.controllers.webhook
 */

import * as createDebug from 'debug';
import * as querystring from 'querystring';
import * as request from 'request-promise-native';

import * as LINE from '../../line';
import User from '../user';
import * as MessageController from './webhook/message';
import * as PostbackController from './webhook/postback';

const debug = createDebug('sskts-line-assistant:controller:webhook');

/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
export async function message(event: LINE.IWebhookEvent, user: User) {
    const messageText: string = event.message.text;
    const userId = event.source.userId;

    try {
        switch (true) {
            // [劇場コード]-[予約番号 or 電話番号] or 取引IDで検索
            case /^\d{3}-\d{1,12}|\w{24}$/.test(messageText):
                await MessageController.pushButtonsReserveNumOrTel(userId, messageText);
                break;

            // 取引csv要求
            case /^csv$/.test(messageText):
                await MessageController.askFromWhenAndToWhen(userId);
                break;

            // 取引csv期間指定
            case /^\d{8}-\d{8}$/.test(messageText):
                // tslint:disable-next-line:no-magic-numbers
                await MessageController.publishURI4transactionsCSV(userId, messageText.substr(0, 8), messageText.substr(9, 8));
                break;

            // ログアウト
            case /^logout$/.test(messageText):
                await MessageController.logout(user);
                break;

            default:
                // まず二段階認証フローかどうか確認
                const postEvent = await user.verifyMFAPass(messageText);
                debug('postEvent from pass:', postEvent);
                if (postEvent !== null) {
                    // postEventがあれば送信
                    await request.post(`https://${user.host}/webhook`, {
                        // tslint:disable-next-line:no-http-string
                        // await request.post('http://localhost:8080/webhook', {
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        form: postEvent
                    }).promise();

                    return;
                }

                // 予約照会方法をアドバイス
                await MessageController.pushHowToUse(userId);
        }
    } catch (error) {
        console.error(error);
        // エラーメッセージ表示
        await LINE.pushMessage(userId, error.toString());
    }
}

/**
 * イベントの送信元が、template messageに付加されたポストバックアクションを実行したことを示すevent objectです。
 */
export async function postback(event: LINE.IWebhookEvent, user: User) {
    const data = querystring.parse(event.postback.data);
    debug('data:', data);
    const userId = event.source.userId;

    try {
        switch (data.action) {
            case 'searchTransactionByReserveNum':
                await PostbackController.searchTransactionByReserveNum(userId, <string>data.reserveNum, <string>data.theater);
                break;

            case 'searchTransactionById':
                await PostbackController.searchTransactionById(userId, <string>data.transaction);
                break;

            case 'searchTransactionByTel':
                await PostbackController.searchTransactionByTel(userId, <string>data.tel, <string>data.theater);
                break;

            case 'pushNotification':
                await PostbackController.pushNotification(userId, <string>data.transaction);
                break;

            case 'settleSeatReservation':
                await PostbackController.settleSeatReservation(userId, <string>data.transaction);
                break;

            case 'createOwnershipInfos':
                await PostbackController.createOwnershipInfos(userId, <string>data.transaction);
                break;

            case 'searchTransactionsByDate':
                await PostbackController.searchTransactionsByDate(userId, <string>event.postback.params.date);
                break;

            case 'startReturnOrder':
                await PostbackController.startReturnOrder(user, <string>data.transaction);
                break;

            case 'confirmReturnOrder':
                await PostbackController.confirmReturnOrder(user, <string>data.transaction, <string>data.pass);
                break;

            default:
        }
    } catch (error) {
        console.error(error);
        // エラーメッセージ表示
        await LINE.pushMessage(userId, error.toString());
    }
}

/**
 * イベント送信元に友だち追加（またはブロック解除）されたことを示すEvent Objectです。
 */
export async function follow(event: LINE.IWebhookEvent) {
    debug('event is', event);
}

/**
 * イベント送信元にブロックされたことを示すevent objectです。
 */
export async function unfollow(event: LINE.IWebhookEvent) {
    debug('event is', event);
}

/**
 * イベントの送信元グループまたはトークルームに参加したことを示すevent objectです。
 */
export async function join(event: LINE.IWebhookEvent) {
    debug('event is', event);
}

/**
 * イベントの送信元グループから退出させられたことを示すevent objectです。
 */
export async function leave(event: LINE.IWebhookEvent) {
    debug('event is', event);
}

/**
 * イベント送信元のユーザがLINE Beaconデバイスの受信圏内に出入りしたことなどを表すイベントです。
 */
export async function beacon(event: LINE.IWebhookEvent) {
    debug('event is', event);
}
