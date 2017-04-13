"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ルーター
 *
 * @ignore
 */
const createDebug = require("debug");
const express = require("express");
const http_status_1 = require("http-status");
const webhookController = require("../conrtollers/webhook");
const router = express.Router();
const debug = createDebug('sskts-linereport:*');
// tslint:disable-next-line:max-func-body-length
router.all('/', (req, res) => __awaiter(this, void 0, void 0, function* () {
    debug('body:', JSON.stringify(req.body));
    // req.body = {
    //     "events": [
    //         {
    //             "message": {
    //                 "id": "5647872913345",
    //                 "text": "27",
    //                 "type": "text"
    //             },
    //             "replyToken": "26d0dd0923a94583871ecd7e6efec8e2",
    //             "source": {
    //                 "type": "user",
    //                 "userId": "U28fba84b4008d60291fc861e2562b34f"
    //             },
    //             "timestamp": 1487085535998,
    //             "type": "message"
    //         }
    //     ]
    // };
    // req.body = {
    //     "events": [
    //         {
    //             "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
    //             "type": "postback",
    //             "timestamp": 1462629479859,
    //             "source": {
    //                 "type": "user",
    //                 "userId": "U28fba84b4008d60291fc861e2562b34f"
    //             },
    //             "postback": {
    //                 "data": "action=transferCoaSeatReservationAuthorization&transaction=58eb2e2bf288760fe8bfb51d"
    //             }
    //         }
    //     ]
    // };
    try {
        const event = (req.body.events !== undefined) ? req.body.events[0] : undefined;
        if (event !== undefined) {
            switch (event.type) {
                case 'message':
                    yield webhookController.message(event);
                    break;
                case 'postback':
                    yield webhookController.postback(event);
                    break;
                case 'follow':
                    yield webhookController.follow(event);
                    break;
                case 'unfollow':
                    yield webhookController.unfollow(event);
                    break;
                case 'join':
                    yield webhookController.join(event);
                    break;
                case 'leave':
                    yield webhookController.leave(event);
                    break;
                case 'beacon':
                    yield webhookController.postback(event);
                    break;
                default:
                    break;
            }
        }
    }
    catch (error) {
        console.error(error);
    }
    res.status(http_status_1.OK).send('ok');
}));
exports.default = router;
