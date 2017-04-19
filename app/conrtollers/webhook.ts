/**
 * LINE webhookコントローラー
 */

import * as createDebug from 'debug';
import * as querystring from 'querystring';
import * as request from 'request-promise-native';

import * as MessageController from './webhook/message';
import * as PostbackController from './webhook/postback';

const debug = createDebug('sskts-linereport:controller:webhook');

/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
// tslint:disable-next-line:max-func-body-length cyclomatic-complexity
export async function message(event: any) {
    const message: string = event.message.text;
    const userId = event.source.userId;

    try {
        switch (true) {
            case /^\d{1,12}$/.test(message):
                await MessageController.pushButtonsReserveNumOrTel(userId, message);
                break;

            default:
                // 何もしない
                break;
        }
    } catch (error) {
        console.error(error);
        // エラーメッセージ表示
        await pushMessage(userId, error.toString());
    }
}

/**
 * イベントの送信元が、template messageに付加されたポストバックアクションを実行したことを示すevent objectです。
 */
// tslint:disable-next-line:max-func-body-length
export async function postback(event: any) {
    const data = querystring.parse(event.postback.data);
    debug('data:', data);
    const userId = event.source.userId;

    try {
        switch (data.action) {
            case 'searchTransactionByReserveNum':
                await PostbackController.searchTransactionByReserveNum(userId, data.reserveNum);
                break;

            case 'searchTransactionByTel':
                await PostbackController.searchTransactionByTel(userId, data.reserveNum);
                break;

            case 'pushNotification':
                await PostbackController.pushNotification(userId, data.transaction);
                break;

            case 'transferCoaSeatReservationAuthorization':
                await PostbackController.transferCoaSeatReservationAuthorization(userId, data.transaction);
                break;

            default:
                break;
        }
    } catch (error) {
        console.error(error);
        // エラーメッセージ表示
        await pushMessage(userId, error.toString());
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
 * @param {string} userId
 * @param {string} text
 */
async function pushMessage(userId: string, text: string) {
    // push message
    await request.post({
        simple: false,
        url: 'https://api.line.me/v2/bot/message/push',
        auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
        json: true,
        body: {
            to: userId,
            messages: [
                {
                    type: 'text',
                    text: text
                }
            ]
        }
    }).promise();
}
