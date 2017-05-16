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
const debug = createDebug('sskts-linereport:controller:webhook:message');
/**
 * 予約番号or電話番号のボタンを送信する
 */
function pushButtonsReserveNumOrTel(userId, message) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(userId, message);
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
                                    data: `action=searchTransactionByReserveNum&reserveNum=${message}`
                                },
                                {
                                    type: 'postback',
                                    label: '電話番号',
                                    data: `action=searchTransactionByTel&tel=${message}`
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
        const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
        const transactionDocs = yield transactionAdapter.transactionModel.find({
            status: sskts.factory.transactionStatus.CLOSED,
            closed_at: {
                $gte: moment(dateFrom, 'YYYYMMDD').toDate(),
                $lte: moment(dateTo, 'YYYYMMDD').toDate()
            }
        }).populate('owners').exec();
        debug('transactionDocs:', transactionDocs);
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    { type: 'text', text: `${transactionDocs.length.toString()}取引のcsvを作成しています...` }
                ]
            }
        }).promise();
        // 取引ごとに詳細を検索し、csvを作成する
        const transactionDetails = yield Promise.all(transactionDocs.map((transactionDoc) => __awaiter(this, void 0, void 0, function* () {
            const transaction = sskts.factory.transaction.create(transactionDoc.toObject());
            const anonymousOwnerObject = transaction.owners.find((owner) => owner.group === sskts.factory.ownerGroup.ANONYMOUS);
            if (anonymousOwnerObject === undefined) {
                throw new Error('owner not found');
            }
            const anonymousOwner = sskts.factory.owner.anonymous.create(anonymousOwnerObject);
            const authorizations = yield transactionAdapter.findAuthorizationsById(transaction.id);
            // GMOオーソリを取り出す
            const gmoAuthorizationObject = authorizations.find((authorization) => {
                return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.GMO);
            });
            const gmoAuthorization = (gmoAuthorizationObject !== undefined) ? sskts.factory.authorization.gmo.create(gmoAuthorizationObject) : undefined;
            // ムビチケオーソリを取り出す
            const mvtkAuthorizationObject = authorizations.find((authorization) => {
                return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.MVTK);
            });
            const mvtkAuthorization = (mvtkAuthorizationObject !== undefined) ? sskts.factory.authorization.mvtk.create(mvtkAuthorizationObject) : undefined;
            // 座席予約オーソリを取り出す
            const coaSeatReservationAuthorizationObject = authorizations.find((authorization) => {
                return (authorization.owner_to === anonymousOwner.id &&
                    authorization.group === sskts.factory.authorizationGroup.COA_SEAT_RESERVATION);
            });
            const coaSeatReservationAuthorization = 
            // tslint:disable-next-line:max-line-length
            (coaSeatReservationAuthorizationObject !== undefined) ? sskts.factory.authorization.coaSeatReservation.create(coaSeatReservationAuthorizationObject) : undefined;
            if (coaSeatReservationAuthorization === undefined) {
                throw new Error('seat reservation not found');
            }
            return {
                id: transaction.id,
                closedAt: moment(transaction.closed_at).format('YYYY-MM-DD HH:mm:ss'),
                name: `${anonymousOwner.name_first} ${anonymousOwner.name_last}`,
                email: anonymousOwner.email,
                tel: anonymousOwner.tel,
                price: coaSeatReservationAuthorization.assets.reduce((a, asset) => a + asset.sale_price, 0),
                gmoOrderId: `${(gmoAuthorization !== undefined) ? gmoAuthorization.gmo_order_id : ''}`,
                gmoPrice: `${(gmoAuthorization !== undefined) ? gmoAuthorization.price.toString() : ''}`,
                // tslint:disable-next-line:max-line-length
                mvtkKnyknrNos: `${(mvtkAuthorization !== undefined) ? mvtkAuthorization.knyknr_no_info.map((knyknrNoInfo) => knyknrNoInfo.knyknr_no).join(',') : ''}`,
                mvtkPrice: `${(mvtkAuthorization !== undefined) ? mvtkAuthorization.price.toString() : ''}`
            };
        })));
        debug('transactionDetails:', transactionDetails);
        // tslint:disable-next-line:no-require-imports
        const jconv = require('jconv');
        const columns = {
            id: '取引ID',
            closedAt: '成立日時',
            name: '名前',
            email: 'メールアドレス',
            tel: '電話番号',
            price: '金額',
            gmoOrderId: 'GMOオーダーID',
            gmoPrice: 'GMO金額',
            mvtkKnyknrNos: 'ムビチケ購入管理番号',
            mvtkPrice: 'ムビチケ金額'
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
                        const blob = 'sskts-linereport-transactions-csv-' + moment().format('YYYYMMDDHHmmss') + '.csv';
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
                    { type: 'text', text: `download -> ${sasUrl}` }
                ]
            }
        }).promise();
    });
}
exports.publishURI4transactionsCSV = publishURI4transactionsCSV;
