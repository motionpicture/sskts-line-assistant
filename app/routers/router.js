"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ルーター
 *
 * @ignore
 */
const createDebug = require("debug");
const express = require("express");
const router = express.Router();
const debug = createDebug('sskts-linereport:*');
// middleware that is specific to this router
// router.use((req, res, next) => {
//   debug('Time: ', Date.now())
//   next()
// })
router.get('/environmentVariables', (req, res) => {
    debug('ip:', req.ip);
    res.json({
        data: {
            type: 'envs',
            attributes: process.env
        }
    });
});
exports.default = router;
