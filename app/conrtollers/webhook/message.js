"use strict";
/**
 * LINE webhook messageコントローラー
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const sskts = require("@motionpicture/sskts-domain");
const azureStorage = require("azure-storage");
const csvStringify = require("csv-stringify");
const createDebug = require("debug");
const moment = require("moment");
const mongoose = require("mongoose");
const request = require("request-promise-native");
const debug = createDebug('sskts-line-assistant:controller:webhook:message');
function pushHowToUse(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-multiline-string
        const text = `How to use
--------------------
予約照会
--------------------
******** new! ********
******** new! ********

[劇場コード]-[予約番号 or 電話番号]と入力
例:118-2425

--------------------
CSVダウンロード
--------------------
「csv」と入力`;
        yield request.post({
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
    });
}
exports.pushHowToUse = pushHowToUse;
/**
 * 予約番号or電話番号のボタンを送信する
 */
function pushButtonsReserveNumOrTel(userId, message) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(userId, message);
        const datas = message.split('-');
        const theater = datas[0];
        const reserveNumOrTel = datas[1];
        // キュー実行のボタン表示
        yield request.post({
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
    });
}
exports.pushButtonsReserveNumOrTel = pushButtonsReserveNumOrTel;
/**
 * 日付選択を求める
 */
function askFromWhenAndToWhen(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield request.post({
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
    });
}
exports.askFromWhenAndToWhen = askFromWhenAndToWhen;
/**
 * 取引CSVダウンロードURIを発行する
 */
// tslint:disable-next-line:max-func-body-length
function publishURI4transactionsCSV(userId, dateFrom, dateTo) {
    return __awaiter(this, void 0, void 0, function* () {
        // 取引検索
        const transactionRepo = new sskts.repository.Transaction(mongoose.connection);
        const transactionDocs = yield transactionRepo.transactionModel.find({
            typeOf: sskts.factory.transactionType.PlaceOrder,
            startDate: {
                $gte: moment(dateFrom, 'YYYYMMDD').toDate(),
                $lt: moment(dateTo, 'YYYYMMDD').add(1, 'days').toDate()
            }
        }).exec();
        debug('transactionDocs:', transactionDocs);
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    { type: 'text', text: `creating a csv ${transactionDocs.length.toString()} transactions...` }
                ]
            }
        }).promise();
        // 取引ごとに詳細を検索し、csvを作成する
        // tslint:disable-next-line:max-func-body-length
        const transactionDetails = yield Promise.all(transactionDocs.map((transactionDoc) => __awaiter(this, void 0, void 0, function* () {
            const transaction = transactionDoc.toObject();
            if (transaction.result !== undefined) {
                const order = transaction.result.order;
                const paymentMethodCredit = order.paymentMethods.find((paymentMethod) => paymentMethod.paymentMethod === 'CreditCard');
                const mvtkDiscounts = order.discounts.filter((discount) => discount.name === 'ムビチケカード');
                return {
                    id: transaction.id,
                    status: transaction.status,
                    startDate: moment(transaction.startDate).format('YYYY-MM-DD HH:mm:ss'),
                    endDate: (transaction.endDate !== undefined) ? moment(transaction.endDate).format('YYYY-MM-DD HH:mm:ss') : '',
                    theater: transaction.seller.name,
                    reserveNum: order.orderInquiryKey.confirmationNumber,
                    name: order.customer.name,
                    email: order.customer.email,
                    telephone: order.customer.telephone,
                    price: order.price,
                    gmoOrderId: `${(paymentMethodCredit !== undefined) ? paymentMethodCredit.paymentMethodId : ''}`,
                    mvtkKnyknrNos: `${mvtkDiscounts.map((mvtkDiscount) => mvtkDiscount.discountCode).join('|')}`,
                    mvtkPrice: order.discounts.reduce((a, b) => a + b.discount, 0)
                };
            }
            else {
                const name = (transaction.object.customerContact !== undefined)
                    ? `${transaction.object.customerContact.familyName} ${transaction.object.customerContact.givenName}`
                    : '';
                return {
                    id: transaction.id,
                    status: transaction.status,
                    startDate: moment(transaction.startDate).format('YYYY-MM-DD HH:mm:ss'),
                    endDate: (transaction.endDate !== undefined) ? moment(transaction.endDate).format('YYYY-MM-DD HH:mm:ss') : '',
                    theater: transaction.seller.name,
                    // reserveNum: (<any>transaction.object.seatReservation).result.tmpReserveNum,
                    reserveNum: '',
                    name: name,
                    email: (transaction.object.customerContact !== undefined) ? transaction.object.customerContact.email : '',
                    telephone: (transaction.object.customerContact !== undefined) ? transaction.object.customerContact.telephone : '',
                    price: '',
                    gmoOrderId: '',
                    mvtkKnyknrNos: '',
                    mvtkPrice: ''
                };
            }
        })));
        debug('transactionDetails:', transactionDetails);
        // tslint:disable-next-line:no-require-imports
        const jconv = require('jconv');
        const columns = {
            id: 'transaction ID',
            status: 'transaction status',
            startDate: 'transaction start at',
            endDate: 'transaction end at',
            theater: 'seller(theater)',
            reserveNum: 'COA reserve number',
            name: 'customer name',
            email: 'customer email',
            telephone: 'customer telephone',
            price: 'price',
            gmoOrderId: 'GMO orderId',
            mvtkKnyknrNos: 'mvtk No',
            mvtkPrice: 'mvtk price'
        };
        const sasUrl = yield new Promise((resolve, reject) => {
            csvStringify(transactionDetails, {
                header: true,
                columns: columns
            }, (err, output) => {
                if (err instanceof Error) {
                    reject(err);
                }
                else {
                    // save to blob
                    debug('output:', output);
                    const blobService = azureStorage.createBlobService();
                    const CONTAINER = 'transactions-csvs';
                    blobService.createContainerIfNotExists(CONTAINER, {}, (createContainerError) => {
                        if (createContainerError instanceof Error) {
                            reject(createContainerError);
                            return;
                        }
                        const blob = `sskts-line-assistant-transactions-${moment().format('YYYYMMDDHHmmss')}.csv`;
                        blobService.createBlockBlobFromText(CONTAINER, blob, jconv.convert(output, 'UTF8', 'SJIS'), (createBlockBlobError, result, response) => {
                            debug(createBlockBlobError, result, response);
                            if (createBlockBlobError instanceof Error) {
                                reject(createBlockBlobError);
                                return;
                            }
                            // 期限つきのURLを発行する
                            const startDate = new Date();
                            const expiryDate = new Date(startDate);
                            // tslint:disable-next-line:no-magic-numbers
                            expiryDate.setMinutes(startDate.getMinutes() + 10);
                            // tslint:disable-next-line:no-magic-numbers
                            startDate.setMinutes(startDate.getMinutes() - 10);
                            const sharedAccessPolicy = {
                                AccessPolicy: {
                                    Permissions: azureStorage.BlobUtilities.SharedAccessPermissions.READ,
                                    Start: startDate,
                                    Expiry: expiryDate
                                }
                            };
                            // tslint:disable-next-line:max-line-length
                            const token = blobService.generateSharedAccessSignature(result.container, result.name, sharedAccessPolicy);
                            resolve(blobService.getUrl(result.container, result.name, token));
                        });
                    });
                }
            });
        });
        yield request.post({
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
    });
}
exports.publishURI4transactionsCSV = publishURI4transactionsCSV;
