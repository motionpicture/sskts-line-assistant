"use strict";
/**
 * ルーター
 *
 * @ignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const router = express.Router();
// middleware that is specific to this router
// router.use((req, res, next) => {
//   debug('Time: ', Date.now())
//   next()
// })
router.get('/environmentVariables', (__, res) => {
    res.json({
        data: {
            type: 'envs',
            attributes: process.env
        }
    });
});
exports.default = router;
