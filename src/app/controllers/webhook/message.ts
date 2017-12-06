/**
 * LINE webhook messageコントローラー
 * @namespace app.controllers.webhook.message
 */

import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as request from 'request-promise-native';

import * as LINE from '../line';

const debug = createDebug('sskts-line-assistant:controller:webhook:message');

/**
 * 使い方を送信する
 * @export
 * @function
 * @memberof app.controllers.webhook.message
 */
export async function pushHowToUse(userId: string) {
    // tslint:disable-next-line:no-multiline-string
    const text = `How to use
******** new! ********
csvの項目が充実しました！
所有権作成タスクを実行できるようになりました！
******** new! ********
--------------------
取引照会
--------------------
[劇場コード]-[予約番号 or 電話番号]と入力
例:118-2425

--------------------
取引CSVダウンロード
--------------------
「csv」と入力`;

    await LINE.pushMessage(userId, text);
}

/**
 * 予約番号or電話番号のボタンを送信する
 * @export
 * @function
 * @memberof app.controllers.webhook.message
 */
export async function pushButtonsReserveNumOrTel(userId: string, message: string) {
    debug(userId, message);
    const datas = message.split('-');
    const theater = datas[0];
    const reserveNumOrTel = datas[1];

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
                        text: 'どちらで検索する？',
                        actions: [
                            {
                                type: 'postback',
                                label: '予約番号',
                                data: `action=searchTransactionByReserveNum&theater=${theater}&reserveNum=${reserveNumOrTel}`
                            },
                            {
                                type: 'postback',
                                label: '電話番号',
                                data: `action=searchTransactionByTel&theater=${theater}&tel=${reserveNumOrTel}`
                            }
                        ]
                    }
                }
            ]
        }
    }).promise();
}

/**
 * 日付選択を求める
 * @export
 * @function
 * @memberof app.controllers.webhook.message
 */
export async function askFromWhenAndToWhen(userId: string) {
    // await LINE.pushMessage(userId, '期間をYYYYMMDD-YYYYMMDD形式で教えてください。');
    await request.post(
        'https://api.line.me/v2/bot/message/push',
        {
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId, // 送信相手のuserId
                messages: [
                    {
                        type: 'template',
                        altText: '日付選択',
                        template: {
                            type: 'buttons',
                            text: '日付を選択するか、期間をYYYYMMDD-YYYYMMDD形式で教えてください。',
                            actions: [
                                {
                                    type: 'datetimepicker',
                                    label: '日付選択',
                                    mode: 'date',
                                    data: 'action=searchTransactionsByDate',
                                    initial: moment().format('YYYY-MM-DD')
                                }
                            ]
                        }
                    }
                ]
            }
        }
    );

}

/**
 * 取引CSVダウンロードURIを発行する
 * @export
 * @function
 * @memberof app.controllers.webhook.message
 */
export async function publishURI4transactionsCSV(userId: string, dateFrom: string, dateThrough: string) {
    await LINE.pushMessage(userId, `${dateFrom}-${dateThrough}の取引を検索しています...`);

    const startFrom = moment(`${dateFrom}T00:00:00+09:00`, 'YYYYMMDDThh:mm:ssZ');
    const startThrough = moment(`${dateThrough}T00:00:00+09:00`, 'YYYYMMDDThh:mm:ssZ').add(1, 'day');

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
