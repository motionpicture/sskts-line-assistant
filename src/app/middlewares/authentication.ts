/**
 * oauthミドルウェア
 * @module middlewares.authentication
 * @see https://aws.amazon.com/blogs/mobile/integrating-amazon-cognito-user-pools-with-api-gateway/
 */

import * as sskts from '@motionpicture/sskts-domain';
import { NextFunction, Request, Response } from 'express';
import { OK } from 'http-status';
// tslint:disable-next-line:no-require-imports no-var-requires

import * as LINE from '../controllers/line';
import User from '../user';

export default async (req: Request, res: Response, next: NextFunction) => {
    try {
        // RedisからBearerトークンを取り出す
        const event: any = (req.body.events !== undefined) ? req.body.events[0] : undefined;
        if (event === undefined) {
            throw new Error('Invalid request.');
        }

        const userId = event.source.userId;
        req.user = new User({
            host: req.hostname,
            userId: userId
        });

        if (await req.user.isAuthenticated()) {
            next();

            return;
        }

        // ログインボタンを送信
        await LINE.pushMessage(userId, req.user.generateAuthUrl());

        res.status(OK).send('ok');
    } catch (error) {
        next(new sskts.factory.errors.Unauthorized(error.message));
    }
};
