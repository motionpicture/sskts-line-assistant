"use strict";
/**
 * webhookルーター
 *
 * @ignore
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
const createDebug = require("debug");
const express = require("express");
const http_status_1 = require("http-status");
const WebhookController = require("../conrtollers/webhook");
const router = express.Router();
const debug = createDebug('sskts-linereport:router:webhook');
router.all('/', (req, res) => __awaiter(this, void 0, void 0, function* () {
    debug('body:', JSON.stringify(req.body));
    try {
        const event = (req.body.events !== undefined) ? req.body.events[0] : undefined;
        if (event !== undefined) {
            switch (event.type) {
                case 'message':
                    yield WebhookController.message(event);
                    break;
                case 'postback':
                    yield WebhookController.postback(event);
                    break;
                case 'follow':
                    yield WebhookController.follow(event);
                    break;
                case 'unfollow':
                    yield WebhookController.unfollow(event);
                    break;
                case 'join':
                    yield WebhookController.join(event);
                    break;
                case 'leave':
                    yield WebhookController.leave(event);
                    break;
                case 'beacon':
                    yield WebhookController.postback(event);
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
