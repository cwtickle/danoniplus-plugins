# danoniplus-plugins

[Dancing☆Onigiri (CW Edition)](https://github.com/cwtickle/danoniplus) 向けの、カスタムJS・スキンをまとめたリポジトリです。

English: [README.en.md](./README.en.md)

## カスタムJS一覧

各カスタムJSは用途名のフォルダごとに管理しています。導入方法や設定項目は、一覧の「Wiki」から確認できます。

<!-- 下の表は自動更新されます。CUSTOM-JS-LIST マーカーの内側は手動で編集しないでください。 -->
<!-- CUSTOM-JS-LIST:START -->
| 用途名 | 種別 | 概要 | 対応バージョン | 作者 | 最新バージョン | 詳細 |
|---|---|---|---|---|---|---|
| [_launcher](./_launcher) | 基盤, js | カスタムJSの設定とボタンを、1 つの画面にまとめる基盤です。対応したカスタムJSは、設定を「宣言」（データ）として書いておくだけで、遊ぶ人がランチャーの画面から設定を変えられます。 | v27.8.1 以降 | [@kwbredda3](https://github.com/kwbredda3) | [2026-11-24](https://github.com/cwtickle/danoniplus-plugins/releases/tag/2026-11-24) ([ZIP](https://github.com/cwtickle/danoniplus-plugins/releases/download/2026-11-24/_launcher-2026-11-24.zip)) | [Wiki](https://github.com/cwtickle/danoniplus-plugins/wiki/launcher) |
<!-- CUSTOM-JS-LIST:END -->

## フォルダ構成

```
<用途名>/        … 用途ごとのフォルダ(wikiのページ名にも使われます)
  js/            … カスタムJS
  skin/          … スキン用のCSS・JS
```

## 追加・更新の方法(Pull Request)

1. 用途名のフォルダを作り、その中に `js/` や `skin/` を置いてファイルを追加します。
2. PRのタイトルを次の形式にします。用途名はタイトルに書かなくても、変更したフォルダから自動で判定されます。
   - 新規追加: `add: 説明`
   - 更新: `update: 説明` / `fix: 説明` / `refactor: 説明` など(`add:` と `chore:` 以外。`chore:` は下の注意を参照)
3. `add:` のPRは、PRテンプレートの見出し(概要 / 対応バージョン / 導入方法 / 設定項目 / 注意点 / スクリーンショット。日英併記なので、見出しは書き換えずそのまま使ってください)を埋めてください。マージすると、wikiのページとこの一覧が自動で作られます。
4. 更新のPRは、マージするとwikiページの「更新履歴」にPRタイトルが追記され、この一覧の最新バージョン(リリースタグとzipへのリンク)が更新されます。

注意:

- 1つのPRで変更できる用途フォルダは1つだけです。
- ランチャーなどの共通部品(基盤)は、フォルダ名を `_` で始めます(例: `_launcher`)。追加・更新のルールは通常の用途フォルダと同じ(1PR 1フォルダ、wikiページと一覧への反映も同様)で、一覧とwikiの種別欄の先頭に「基盤」と表示され、リリースノートにも「基盤 / Common」と付きます。wikiのページ名は、先頭の `_` を除いた名前(`_launcher` なら `launcher`)です。
- `remove:`(削除)は現在未対応です。
- `chore:` のPRと Dependabot のPRは、検証と wiki・README の更新の対象外です(用途フォルダを変更しても反映されません)。

## リリース

毎日 0:15(JST)ごろに、前日にマージされたPRを自動で確認します。用途フォルダ(基盤フォルダを含む)を変更するPR(`chore:` と Dependabot のPRは除く)があった日だけ、その日付のタグ `YYYY-MM-DD` でリリースが作られます。リリースノートには、その日にマージされたPRが用途ごとに「追加 / 更新」に分けて載ります。基盤フォルダ(`_` 始まり)の行には「基盤 / Common」と付きます。

- タグは、その日の終わり(JST 24:00)時点の main のコミットに付きます。1日に何度マージしても、リリースは1つで、タグの付け替えはありません。
- 該当するPRがない日は、何も作られません。READMEやCIだけを変更するPRも対象外です。
- 実行が抜けた日があっても、直近7日分は次回の実行でまとめて補います。
- Actions の「Daily release」を手動で実行すると、日付(JST)を指定して1日分を作成できます。
