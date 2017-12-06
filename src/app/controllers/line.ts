/**
 * LINE APIコントローラー
 * @namespace app.controllers.line
 */

import * as createDebug from 'debug';
import * as request from 'request-promise-native';

const debug = createDebug('sskts-line-assistant:controller:line');

export const URL_PUSH_MESSAGE = 'https://api.line.me/v2/bot/message/push';

/**
 * メッセージ送信
 * @export
 * @function
 * @memberof app.controllers.line
 * @param {string} userId LINEユーザーID
 * @param {string} text メッセージ
 */
export async function pushMessage(userId: string, text: string) {
    debug('pushing a message...', text);
    // push message
    await request.post({
        simple: false,
        url: URL_PUSH_MESSAGE,
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
