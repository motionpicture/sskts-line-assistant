# LINE Messaging APIを使ったシネマサンシャインチケット業務アプリ

LINE Messaging APIは、トークやアカウントに関するイベントに対するウェブフックの仕組みを持っています。
それを受けるウェブアプリです。


# Features

# Getting Started

## インフラ
基本的にnode.jsのウェブアプリケーション。
ウェブサーバーとしては、AzureのWebAppsあるいはGCPのAppEngineを想定。
両方で動くように開発していくことが望ましい。

## 言語
実態としては、linuxあるいはwindows上でのnode.js。
プログラミング言語としては、alternative javascriptのひとつであるTypeScript。

* TypeScript(https://www.typescriptlang.org/)

## 開発方法
npmでパッケージをインストール。
`npm install`

* npm(https://www.npmjs.com/)

typescriptをjavascriptにコンパイル。
`npm run build`


監視させる場合はこちら。
`npm run build -- -w`


npmでローカルサーバーを起動。
`npm start`

(http://localhost:8080)にアクセスすると、ローカルでウェブアプリを確認できます。

以下指定するとデバッグモード。
`set DEBUG=sskts-linereport:*`


### tslint

コード品質チェックをtslintで行う。
* [tslint](https://github.com/palantir/tslint)
* [tslint-microsoft-contrib](https://github.com/Microsoft/tslint-microsoft-contrib)
`npm run check`でチェック実行。改修の際には、必ずチェックする。


### test

`npm test`でテストコード実行。テストをクリアしてからデプロイすること。



## Required environment variables
```shell
    set NODE_ENV=**********
    set LINE_BOT_CHANNEL_SECRET=**********
    set LINE_BOT_CHANNEL_ACCESS_TOKEN=**********
    set LINE_PAY_CHANNEL_ID=**********
    set LINE_PAY_CHANNEL_SECRET=**********
    set LINE_PAY_WEBHOOK_ENDPOINT=**********
```

only on Aure WebApps

```shell
    set WEBSITE_NODE_DEFAULT_VERSION=**********
    set WEBSITE_TIME_ZONE=Tokyo Standard Time
```




# JsDoc

`npm run jsdoc`でjsdocを作成できます。./docsに出力されます。


# 参考

## LINE Reference

* [LINE BUSSINESS CENTER]https://business.line.me/ja/
* [LINE@MANAGER]https://admin-official.line.me/
* [API Reference](https://devdocs.line.me/ja/)
* [LINE Pay技術サポート](https://pay.line.me/jp/developers/documentation/download/tech?locale=ja_JP)
* [LINE Pay Home](https://pay.line.me/jp/)


## Cognitive Services

* [Web Language Model API](https://westus.dev.cognitive.microsoft.com/docs/services/55de9ca4e597ed1fd4e2f104/operations/55de9ca4e597ed19b0de8a51)
