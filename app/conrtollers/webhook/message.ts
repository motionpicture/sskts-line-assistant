/**
 * LINE webhook messageコントローラー
 */

import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as request from 'request-promise-native';

const debug = createDebug('sskts-line-assistant:controller:webhook:message');

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

/**
 * 予約番号or電話番号のボタンを送信する
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
 */
export async function askFromWhenAndToWhen(userId: string) {
    await request.post({
        simple: false,
        url: 'https://api.line.me/v2/bot/message/push',
        auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
        json: true,
        body: {
            to: userId,
            messages: [
                { type: 'text', text: 'いつからいつまでほしい？YYYYMMDD-YYYYMMDDで教えてね。' }
            ]
        }
    }).promise();
}

/**
 * 取引CSVダウンロードURIを発行する
 */
export async function publishURI4transactionsCSV(userId: string, dateFrom: string, dateThrough: string) {
    const csv = await sskts.service.transaction.placeOrder.download(
        {
            startFrom: moment(dateFrom, 'YYYYMMDD').toDate(),
            startThrough: moment(dateThrough, 'YYYYMMDD').add(1, 'day').toDate()
        },
        'csv'
    )(new sskts.repository.Transaction(sskts.mongoose.connection));

    const sasUrl = await sskts.service.util.uploadFile(`sskts-line-assistant-transactions-${moment().format('YYYYMMDDHHmmss')}.csv`, csv)();

    await request.post({
        simple: false,
        url: 'https://api.line.me/v2/bot/message/push',
        auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
        json: true,
        body: {
            to: userId,
            messages: [
                { type: 'text', text: `download -> ${sasUrl} ` }
            ]
        }
    }).promise();
}
