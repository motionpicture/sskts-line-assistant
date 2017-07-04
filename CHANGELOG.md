# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased
### Added
- 予約番号検索を、成立以外の取引にも対応。
- 処理中のステータスをメッセージとして送信するように対応。

### Changed
- タスク仕様に合わせて調整。

## v1.2.0 - 2017-06-26
### Changed
- 予約照会条件に劇場コード追加

### Security
- [typescript@^2.4.0](https://github.com/Microsoft/TypeScript)

## v1.1.5 - 2017-06-12
### Added
- 取引詳細にGMOショップ情報を追加。

### Changed
- 取引詳細テンプレート調整。

## v1.1.4 - 2017-06-01
### Added
- csvの項目に劇場コードと予約番号を追加。

### Fixed
- csvの検索日時toが結果に含まれないバグを修正。

## v1.1.3 - 2017-05-31
### Fixed
- 多言語スキーマを追加したことに対する互換性対応。

## v1.1.2 - 2017-05-17
### Fixed
- csvダウンロードにて、ムビチケ購入管理番号表示が崩れるバグを修正。

## v1.1.1 - 2017-05-17
### Fixed
- 座席予約資産の券種名取得方法を修正。

## v1.1.0 - 2017-05-16
### Added
- 取引csvダウンロード機能を追加。

## v1.0.12 - 2017-04-19
### Changed
- QRコード表示をリンクに変更。

## v1.0.11 - 2017-04-19
### Added
- 電話番号検索を実験的に追加。

## v1.0.5 - 2017-04-18
### Added
- ムビチケ座席予約の場合に対応。

## v1.0.4 - 2017-04-18
### Changed
- 予約番号照会の取引内容を調整。

## v1.0.2 - 2017-04-14
### Changed
- パッケージ依存関係を整理。

## v1.0.1 - 2017-04-14
### Added
- 取引検索結果の情報を強化。

## v1.0.0 - 2017-04-01
### Added
- initialize
