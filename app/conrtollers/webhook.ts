/**
 * LINE webhookコントローラ
 */

import * as createDebug from 'debug';
import * as querystring from 'querystring';
import * as request from 'request-promise-native';

const debug = createDebug('sskts-linereport:controller:webhook');

/**
 * メッセージが送信されたことを示すEvent Objectです。
 */
export async function message(event: any) {
    const message: string = event.message.text;
    const MID = event.source.userId;

    switch (true) {
        case /^\d{1,8}$/.test(message):
            await pushMessage(MID, `購入番号:${message}`);
            break;
        default:
            await pushMessage(MID, '???');
            break;
    }
}

/**
 * イベントの送信元が、template messageに付加されたポストバックアクションを実行したことを示すevent objectです。
 */
export async function postback(event: any) {
    const data = querystring.parse(event.postback.data);
    debug('data is', data);
    const MID = event.source.userId;

    switch (data.action) {
        case 'sendEmail':
            await pushMessage(MID, 'sendEmail');

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
