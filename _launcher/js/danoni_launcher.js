'use strict';
/**
 * Dancing☆Onigiri カスタムjs - ランチャー（v1.0.0）
 *
 * カスタムjsの設定とボタンを、1 つの画面にまとめる基盤。
 * 置き場所は danoniplus-plugins の _launcher フォルダ（基盤）。宣言の書き方は、wiki の launcher のページ。
 * id は launcher（基盤のフォルダは、先頭の _ を除いた名前を id にする）。
 *
 * 【使い方】ほかのカスタムjsと同じように読み込む。並べる順はどこでもよい（後から読まれても拾う）。
 *     |customjs=danoni_launcher.js,danoni_xxx.js|
 *
 * 【画面】
 *   カスタムjsの一覧（畳んだ形） → タップで 1 本を広げる → 設定の項目をタップすると、その値を決める欄が広がる。
 *   値は、ランチャーの中で決める。型は 4 つ: オン／オフ・決まった選択肢・決まった範囲の数・色コード
 *   色コードは、宣言に alpha: true があれば不透明度も決められる（#rrggbbaa）。
 *   設定に when: { key, is } があれば、その設定の値が is のどれかのときだけ項目を出す（値はそのまま働く）
 *   宣言に quiet: true があるカスタムjsは、それだけではボタンを出さない（いつも登録されるもの向け。ほかがあれば一緒に並ぶ）
 *   画面の高さは決まった大きさ（枠の 94%・600px まで）。広げた所・画面ごとのボタンで変わらない。
 *   ランチャー自身の設定（一覧の最後）: ボタンの位置・画面の色（ダーク・ライト・端末に合わせる。既定はダーク）
 *
 * 【やること】
 *   - 配列 window.g_danoniPlugins に登録されたカスタムjsの、設定とボタンを画面に出す
 *   - 選んだ値を、そのカスタムjsの values に入れ、onChange で知らせる
 *   - 人が変えた値だけを保存する（そのサイトの localStorage。保存先は差し替えられる）
 * 【やらないこと】
 *   - カスタムjsを取ってくる・入れる・外す（読み込むのは今までどおり、作品の customjs など）
 *   - 対応したカスタムjsが 1 本も無いページに、ボタンを出す
 *   - 本体のファイル・変数を書き換える（見るのは #canvas-frame・g_currentPage・g_localeObj だけ）
 *   - プレイ中に画面を出す
 */
(() => {

    const VERSION = `1.0.0`;

    /** 登録先の配列・作品側の指定・保存先（どれも仮の名前） */
    const LIST_NAME = `g_danoniPlugins`;
    const PRESET_NAME = `g_danoniPluginPreset`;
    const STORE_KEY = `danoni-plugins`;

    const list = Array.isArray(window[LIST_NAME]) ? window[LIST_NAME] : (window[LIST_NAME] = []);
    if (list.launcher !== undefined) {
        return;   // ランチャーは 1 つだけ
    }

    const LIMITS = { settings: 40, options: 40, actions: 20, text: 80, presets: 16 };
    const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
    const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;
    const COLOR_RE = /^#[0-9a-f]{6}$/;
    const COLOR_A_RE = /^#[0-9a-f]{8}$/;
    /** 透けた色の見本の下に敷く市松模様（色の値は、形を確かめた色コードだけを重ねる） */
    const CHECKER = `repeating-conic-gradient(#9aa3b8 0 25%, #e8ecf4 0 50%) 0 0 / 10px 10px`;
    /** 色コードの設定に、選びやすい色が書かれていないときに出す色 */
    const PALETTE = [`#ffffff`, `#c0c0c0`, `#808080`, `#000000`, `#ff4646`, `#ff9f43`,
        `#ffd93b`, `#28c878`, `#2ec4b6`, `#286eff`, `#8e6bff`, `#ff6bcb`];

    /* ============================================================
     * 本体から読むもの（無い版では、無いものとして動く）
     * ============================================================ */

    /** いまの画面の名前（title・option・main・result など）。分からなければ null */
    const page = () => {
        try {
            return typeof g_currentPage === `string` ? g_currentPage : null;
        } catch {
            return null;
        }
    };

    const lang = () => {
        try {
            if (typeof g_localeObj === `object` && typeof g_localeObj.val === `string`) {
                return g_localeObj.val.toLowerCase();
            }
        } catch {
            // 言語の設定が無い本体
        }
        return (navigator.language || ``).startsWith(`ja`) ? `ja` : `en`;
    };

    /** 文（文字か、{ ja, en } の形）を、いまの言語の文字にする */
    const text = _v => {
        let s = _v;
        if (s !== null && typeof s === `object`) {
            s = s[lang()] ?? s.en ?? s.ja ?? Object.values(s)[0];
        }
        return (typeof s === `string` || typeof s === `number`) ? String(s).slice(0, LIMITS.text) : ``;
    };

    const T = {
        title: { ja: `カスタムjsの設定`, en: `Custom JS settings` },
        open: { ja: `カスタムjsの設定`, en: `Custom JS settings` },
        close: { ja: `閉じる`, en: `Close` },
        empty: { ja: `対応したカスタムjsは、まだ読み込まれていません。`, en: `No compatible custom JS is loaded yet.` },
        affects: { ja: `判定・操作に関わる`, en: `Affects play` },
        locked: { ja: `作品の指定`, en: `Set by the work` },
        unsupported: { ja: `いまは使えません`, en: `Not available now` },
        ng: { ja: `使えません`, en: `N/A` },
        reset: { ja: `既定に戻す`, en: `Reset` },
        on: { ja: `ON`, en: `ON` },
        off: { ja: `OFF`, en: `OFF` },
        turnOn: { ja: `ON にすると、設定できます。`, en: `Turn it on to change the settings.` },
        noSettings: { ja: `設定する項目はありません。`, en: `There is nothing to set.` },
        colorCode: { ja: `色コード`, en: `Color code` },
        colorPick: { ja: `色を選ぶ`, en: `Pick a color` },
        alpha: { ja: `不透明度`, en: `Opacity` },
    };

    /* ============================================================
     * 設定の形と値
     * ============================================================ */

    /**
     * 色コードを #rrggbb の形にする（#rgb も受ける）。色コードでなければ undefined
     * _alpha が true なら #rrggbbaa の形にする（#rgb・#rgba・#rrggbb も受ける。不透明度の無いものは不透明）
     */
    const cleanColor = (_v, _alpha = false) => {
        if (typeof _v !== `string`) {
            return undefined;
        }
        const c = _v.trim().toLowerCase();
        const full = /^#[0-9a-f]{3,4}$/.test(c) ? `#${[...c.slice(1)].map(x => x + x).join(``)}` : c;
        if (_alpha) {
            return COLOR_RE.test(full) ? `${full}ff` : (COLOR_A_RE.test(full) ? full : undefined);
        }
        return COLOR_RE.test(full) ? full : undefined;
    };

    /** 不透明度（0〜100 の %）と、#rrggbbaa の末尾 2 桁を行き来する */
    const alphaPct = _hex2 => Math.round(parseInt(_hex2, 16) / 255 * 100);
    const alphaHex = _pct => Math.round(Math.min(Math.max(_pct, 0), 100) / 100 * 255).toString(16).padStart(2, `0`);

    /** 色の見本を塗る（透けた色は、市松模様の上に重ねて見せる） */
    const paint = (_el, _color) => {
        _el.style.background = `linear-gradient(${_color}, ${_color}), ${CHECKER}`;
    };

    /**
     * 値を、その設定に入れてよい形にする。入れられない値は undefined
     *   オン／オフ … true / false だけ
     *   選択       … 選択肢にある値だけ
     *   数         … 範囲に収め、刻みに合わせる
     *   色コード   … #rrggbb だけ（alpha: true なら #rrggbbaa）
     */
    const cleanValue = (_s, _v) => {
        if (_s.type === `toggle`) {
            return typeof _v === `boolean` ? _v : undefined;
        }
        if (_s.type === `select`) {
            return _s.options.some(o => o.value === _v) ? _v : undefined;
        }
        if (_s.type === `color`) {
            return cleanColor(_v, _s.alpha);
        }
        if (typeof _v !== `number` || !Number.isFinite(_v)) {
            return undefined;
        }
        // 刻みの番号で丸める。最大が刻みに乗っていないときは、乗っている最後の刻みまで（つまみと同じ値になる）
        const inRange = Math.min(Math.max(_v, _s.min), _s.max);
        const index = Math.min(Math.round((inRange - _s.min) / _s.step), _s.lastStep);
        const snapped = Number((_s.min + index * _s.step).toFixed(_s.digits));
        return Math.min(Math.max(snapped, _s.min), _s.max);
    };

    /** 数の小数点以下の桁数（1e-7 のような書き方も数える） */
    const decimalsOf = _n => {
        const [mant, exp] = String(_n).toLowerCase().split(`e`);
        return Math.max((mant.split(`.`)[1] ?? ``).length - Number(exp ?? 0), 0);
    };
    /** 丸められる小数の桁数（toFixed の上限） */
    const DIGITS_MAX = 20;

    /** 出す条件（when: { key, is }。is は値 1 つか、値の並び）を確かめる。決まりに合わなければ null（いつも出す） */
    const normWhen = _w => {
        if (_w === null || typeof _w !== `object` || typeof _w.key !== `string` || !KEY_RE.test(_w.key)) {
            return null;
        }
        const values = (Array.isArray(_w.is) ? _w.is : [_w.is])
            .filter(v => [`string`, `number`, `boolean`].includes(typeof v)).slice(0, LIMITS.options);
        return values.length > 0 ? { key: _w.key, values } : null;
    };

    /** 設定の宣言を確かめる。決まりに合わないものは null */
    const normSetting = _s => {
        if (_s === null || typeof _s !== `object` || typeof _s.key !== `string` || !KEY_RE.test(_s.key)) {
            return null;
        }
        const base = { key: _s.key, type: _s.type, label: _s.label ?? _s.key, note: _s.note, locked: false, when: normWhen(_s.when) };
        if (_s.type === `toggle`) {
            return { ...base, default: _s.default === true };
        }
        if (_s.type === `select`) {
            const options = (Array.isArray(_s.options) ? _s.options : []).slice(0, LIMITS.options)
                .map(o => (o !== null && typeof o === `object` ? { value: o.value, label: o.label } : { value: o }))
                // ラベルの無い選択肢は、値をそのまま出す（true / false は、文字にならないので ON / OFF）
                .map(o => ({ value: o.value, label: o.label ?? (typeof o.value === `boolean` ? (o.value ? T.on : T.off) : o.value) }))
                // 数は、保存して読み戻せるもの（Infinity・NaN は JSON で null になる）だけ
                .filter(o => ([`string`, `boolean`].includes(typeof o.value) || (typeof o.value === `number` && Number.isFinite(o.value)))
                    && String(o.value).length <= LIMITS.text)
                // 同じ値の選択肢は、最初の 1 つだけ（値で選ぶので、2 つあると見分けられない）
                .filter((o, j, all) => all.findIndex(v => v.value === o.value) === j);
            if (Array.isArray(_s.options) && options.length < Math.min(_s.options.length, LIMITS.options)) {
                console.warn(`[launcher] 使えない選択肢を外しました（文字列・true/false・有限の数だけ。同じ値は最初の 1 つ）: ${_s.key}`);
            }
            if (options.length < 2) {
                return null;
            }
            return { ...base, options, default: options.some(o => o.value === _s.default) ? _s.default : options[0].value };
        }
        if (_s.type === `number`) {
            const [min, max, stepIn] = [Number(_s.min), Number(_s.max), Number(_s.step)];
            const step = Number.isFinite(stepIn) && stepIn > 0 ? stepIn : 1;
            if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) {
                return null;
            }
            // 刻みの番号の最後（最大が刻みに乗っていなくても、範囲の中に収まる最後の刻み）と、丸める桁数
            const digits = Math.max(decimalsOf(min), decimalsOf(step));
            // 小数 20 桁より細かい最小・刻みは、受け付けない（丸めで刻みからずれて、つまみと数字の欄が食い違う）
            if (digits > DIGITS_MAX) {
                return null;
            }
            let lastStep = Math.floor((max - min) / step + 1e-9);
            // 範囲が大きすぎて刻みの数を数えられない（計算があふれる）宣言は、受け付けない
            if (!Number.isFinite(lastStep)) {
                return null;
            }
            // 上の 1e-9 は、割り算の誤差（0.3 / 0.1 が 2.99… になる）のため。その分で最大を超えた刻みは、数えない
            if (lastStep > 0 && Number((min + lastStep * step).toFixed(digits)) > max) {
                lastStep--;
            }
            // 刻みが細かすぎて、1 つ先の値を最小と区別できない宣言（数の精度を超える。1e20 に 1 を足す、など）は、受け付けない
            // 最後の刻みと、その 1 つ手前でも同じ（範囲が広すぎて、上のほうで刻みが効かなくなる宣言）
            const at = _n => Number((min + _n * step).toFixed(digits));
            if (lastStep > 0 && !(at(1) > min && at(lastStep) > at(lastStep - 1))) {
                return null;
            }
            const s = { ...base, min, max, step, lastStep, digits, unit: _s.unit };
            s.default = cleanValue(s, Number(_s.default)) ?? min;
            return s;
        }
        if (_s.type === `color`) {
            const alpha = _s.alpha === true;
            // 選びやすい色は、色だけを使う（不透明度の付く設定では、押してもいまの不透明度を保つ）
            const presets = [...new Set((Array.isArray(_s.presets) ? _s.presets : [])
                .map(c => cleanColor(c, alpha)?.slice(0, 7)).filter(c => c !== undefined))].slice(0, LIMITS.presets);
            return {
                ...base, alpha, presets: presets.length > 0 ? presets : PALETTE,
                default: cleanColor(_s.default, alpha) ?? (alpha ? `#ffffffff` : `#ffffff`),
            };
        }
        return null;
    };

    /** その設定を、いま一覧に出すか（when の条件に合うか） */
    const shownNow = (_p, _s) => _s.when === null || _s.when.values.includes(_p.def.values[_s.when.key]);

    /* ============================================================
     * 保存（人が変えた値だけ。既定のままの設定は、カスタムjsの既定が変わればそれに従う）
     * ============================================================ */

    /** 既定の保存先で、保存に失敗した変更（容量があふれたときなど）。次に保存できたとき、いっしょに書き足す */
    let unsaved = [];
    const UNSAVED_MAX = 200;
    const isChange = _c => isObj(_c) && typeof _c.id === `string` && ID_RE.test(_c.id)
        && (_c.reset === true || (typeof _c.key === `string` && KEY_RE.test(_c.key)));

    /**
     * 既定の保存先（localStorage）に、1 回ぶんを書く
     * @param {object} _data   保存する全部（{ v: 1, values: { id: { key: 値 } } }）
     * @param {object} _change 今回変わった所（{ id, key, value } か { id, reset: true }）。
     *                         ほかのタブの変更を消さないよう、いま保存されている中身に、この 1 か所だけを書き足す
     */
    const commitLocal = (_data, _change) => {
        // 前に保存できなかった変更に、今回の変更を足す。同じ設定の前の変更は、新しいほうで置き換える
        // （「既定に戻す」は、そのカスタムjsの前の変更を全部置き換える）
        let changes = unsaved;
        if (isChange(_change)) {
            changes = [...changes.filter(c => (_change.reset === true ? c.id !== _change.id
                : c.id !== _change.id || c.reset === true || c.key !== _change.key)), _change];
        }
        try {
            let next = _data;
            let latest = null;
            try {
                // 保存が無い（ほかのタブで消された・まだ 1 回も保存していない）ときは、空の中身に書き足す
                latest = JSON.parse(localStorage.getItem(STORE_KEY)) ?? { v: 1, values: {} };
            } catch {
                latest = null;   // 壊れた中身が入っていたら、全部を書き直す
            }
            if (isChange(_change) && isObj(latest) && latest.v === 1 && isObj(latest.values)) {
                const values = latest.values;
                changes.forEach(c => {
                    if (c.reset === true) {
                        delete values[c.id];
                    } else {
                        values[c.id] = isObj(values[c.id]) ? values[c.id] : {};
                        values[c.id][c.key] = c.value;
                    }
                });
                next = { v: 1, values };
            }
            localStorage.setItem(STORE_KEY, JSON.stringify(next));
            unsaved = [];
        } catch {
            // 保存できなくても、開いている間は動く。この変更は、次に保存できたときに書き足す
            unsaved = changes.slice(-UNSAVED_MAX);
        }
    };

    /**
     * 順番を待っている書き込み。
     * 「読む → 書き足す → 書く」の途中に、ほかのタブの書き込みが挟まらないよう、使えるブラウザでは Web Locks で 1 つずつにする
     * （使えないとき＝http のページ・古いブラウザでは、その場で書く）。
     * 順番が来る前にページを離れるときは、待たずに書く（変更を落とさないことを先にする）
     */
    const waiting = [];
    const flushWaiting = () => waiting.splice(0).forEach(job => job());
    window.addEventListener(`pagehide`, flushWaiting);

    const localStore = {
        read() {
            try {
                return JSON.parse(localStorage.getItem(STORE_KEY));
            } catch {
                return null;
            }
        },
        write(_data, _change) {
            waiting.push(() => commitLocal(_data, _change));
            try {
                // 順番が来たら、待っている分をまとめて書く（断られたときは、その場で書く）
                navigator.locks.request(`${STORE_KEY}:write`, flushWaiting).then(undefined, flushWaiting);
            } catch {
                flushWaiting();
            }
        },
    };
    let store = localStore;
    /** { カスタムjsの id: { 設定の key: 値 } } */
    let saved = Object.create(null);

    const isObj = _v => _v !== null && typeof _v === `object` && !Array.isArray(_v);

    /** 保存先から読んだ中身を、保存の控えの形にする（形が合わなければ空。読むと例外になる中身は、例外をそのまま投げる） */
    const savedFrom = _data => {
        const map = Object.create(null);
        if (!isObj(_data) || _data.v !== 1 || !isObj(_data.values)) {
            return map;
        }
        Object.keys(_data.values).forEach(id => {
            const values = _data.values[id];
            if (ID_RE.test(id) && isObj(values)) {
                map[id] = Object.assign(Object.create(null), values);
            }
        });
        return map;
    };
    /** 保存先から読む（読めなければ空） */
    const loadSaved = () => {
        try {
            saved = savedFrom(store.read());
        } catch (e) {
            console.error(`[launcher] 保存先から読めませんでした`, e);
            saved = Object.create(null);
        }
    };
    /**
     * 既定の保存先を読み直す（ほかのタブで変えた設定を、画面を開いたときに拾う）。
     * まだ書けていない変更があるときは、読み直さない（読み直すと、その変更が消える）。
     * 差し替えた保存先は、読み直さない（渡し直すのは、差し替えた側の役目）
     */
    const reloadLocal = () => {
        if (store !== localStore || waiting.length > 0 || unsaved.length > 0) {
            return;
        }
        try {
            const raw = localStorage.getItem(STORE_KEY);
            const data = raw === null ? null : JSON.parse(raw);
            // 消されていたら空に、決まった形ならその中身にする。ほかの形のときは、下の catch と同じで、いまの控えのまま
            if (data === null || (isObj(data) && data.v === 1 && isObj(data.values))) {
                saved = savedFrom(data);
            }
        } catch {
            // 読めない・壊れているときは、いまの控えを使い続ける（次の保存で、全部を書き直す）
        }
    };
    /** いまの保存の控えの写し（保存先があとで書く形でも、渡したあとの変更が混ざらないように） */
    const savedCopy = () => {
        const values = Object.create(null);
        Object.keys(saved).forEach(id => {
            values[id] = Object.assign(Object.create(null), saved[id]);
        });
        return { v: 1, values };
    };
    const writeSaved = _change => {
        try {
            const done = store.write(savedCopy(), _change);
            if (done !== null && typeof done === `object` && typeof done.then === `function`) {
                done.then(undefined, e => console.error(`[launcher] 保存でエラー`, e));
            }
        } catch (e) {
            console.error(`[launcher] 保存でエラー`, e);
        }
    };

    /* ============================================================
     * 登録されたカスタムjs
     * ============================================================ */

    /** id → { id, def, settings, actions } */
    const plugins = new Map();

    /** 作品側の指定（window.g_danoniPluginPreset[id] = { values: {…}, lock: [key, …] か true }） */
    const presetOf = _id => {
        const all = window[PRESET_NAME];
        return isObj(all) && Object.hasOwn(all, _id) && isObj(all[_id]) ? all[_id] : {};
    };
    const isLocked = (_preset, _key) =>
        _preset.lock === true || (Array.isArray(_preset.lock) && _preset.lock.includes(_key));

    /**
     * 変わった設定を、カスタムjsに知らせる（登録の途中で呼ばないよう、いまの処理が済んでから）
     * 知らせる値は、変わったときの値（同じ処理の中で続けて変わっても、途中の値を飛ばさない）
     */
    const notify = (_p, _keys) => {
        if (_keys.length === 0 || typeof _p.def.onChange !== `function`) {
            return;
        }
        const changes = _keys.map(key => [key, _p.def.values[key]]);
        queueMicrotask(() => changes.forEach(([key, value]) => {
            try {
                _p.def.onChange(key, value, _p.def.values);
            } catch (e) {
                console.error(`[launcher] ${_p.id} の onChange でエラー`, e);
            }
        }));
    };

    /**
     * 値を決めて values に入れる
     *   作品が固定した設定 … 作品の値
     *   それ以外           … 人が変えた値 → 作品の値 → カスタムjsの既定、の順
     */
    const applyValues = _p => {
        const preset = presetOf(_p.id);
        const presetValues = isObj(preset.values) ? preset.values : {};
        if (!isObj(_p.def.values)) {
            _p.def.values = {};
        }
        const changed = [];
        _p.settings.forEach(s => {
            s.locked = isLocked(preset, s.key);
            const fromWork = cleanValue(s, presetValues[s.key]);
            const fromUser = s.locked ? undefined : cleanValue(s, saved[_p.id]?.[s.key]);
            const value = fromUser ?? fromWork ?? s.default;
            if (_p.def.values[s.key] !== value) {
                _p.def.values[s.key] = value;
                changed.push(s.key);
            }
        });
        notify(_p, changed);
    };

    /** 人が画面で変えた */
    const setValue = (_p, _s, _value) => {
        const value = cleanValue(_s, _value);
        if (value === undefined || _s.locked || _p.def.values[_s.key] === value) {
            return false;
        }
        try {
            _p.def.values[_s.key] = value;
        } catch (e) {
            console.error(`[launcher] ${_p.id} の values に入れられませんでした`, e);
            return false;
        }
        (saved[_p.id] ??= Object.create(null))[_s.key] = value;
        writeSaved({ id: _p.id, key: _s.key, value });
        notify(_p, [_s.key]);
        return true;
    };

    const resetValues = _p => {
        delete saved[_p.id];
        writeSaved({ id: _p.id, reset: true });
        try {
            applyValues(_p);
        } catch (e) {
            console.error(`[launcher] ${_p.id} の値を既定に戻せませんでした`, e);
        }
    };

    const adopt = _def => {
        let p;
        // 宣言の形が崩れていても（読むと例外になる値など）、その 1 本を捨てるだけにして、ランチャーは動き続ける
        try {
            if (!isObj(_def) || typeof _def.id !== `string` || !ID_RE.test(_def.id) || plugins.has(_def.id)) {
                console.warn(`[launcher] 登録できませんでした（id が無い・決まりに合わない・同じ id がある）`, _def?.id);
                return;
            }
            const keys = new Map();
            const settings = (Array.isArray(_def.settings) ? _def.settings : []).slice(0, LIMITS.settings)
                .map(normSetting).filter(s => s !== null && !keys.has(s.key) && keys.set(s.key, s));
            // 出す条件は、同じカスタムjsのほかの設定だけを見られる（無い設定・自分を見る条件は外す）
            settings.forEach(s => {
                if (s.when !== null && (s.when.key === s.key || !keys.has(s.when.key))) {
                    s.when = null;
                }
                // 色コードを見る条件は、値と同じ書き方（#rrggbb・小文字）にそろえてから比べる
                const target = s.when !== null ? keys.get(s.when.key) : undefined;
                if (target?.type === `color`) {
                    const values = s.when.values.map(v => cleanColor(v, target.alpha)).filter(v => v !== undefined);
                    s.when = values.length > 0 ? { key: s.when.key, values } : null;
                }
            });
            const actions = (Array.isArray(_def.actions) ? _def.actions : []).slice(0, LIMITS.actions)
                .filter(a => isObj(a) && typeof a.key === `string` && KEY_RE.test(a.key) && typeof a.run === `function`);
            p = { id: _def.id, def: _def, settings, actions, quiet: _def.quiet === true };
        } catch (e) {
            console.warn(`[launcher] 宣言を読めなかったので、登録しませんでした`, e);
            return;
        }
        plugins.set(p.id, p);
        try {
            applyValues(p);
        } catch (e) {
            // 値を入れられない宣言（values が書き換えられない、など）は、登録しない
            plugins.delete(p.id);
            console.warn(`[launcher] 値を入れられなかったので、登録しませんでした`, e);
            return;
        }
        try {
            // 押している最中（つまみを動かしている途中など）に登録されたら、離してから作り直す
            renderWhenFree();
        } catch (e) {
            console.error(`[launcher] 画面を作れませんでした`, e);
        }
    };

    /** 全部のカスタムjsの値を決め直す（1 本で例外が出ても、ほかは続ける） */
    const applyAll = () => plugins.forEach(p => {
        try {
            applyValues(p);
        } catch (e) {
            console.error(`[launcher] ${p.id} の値を決め直せませんでした`, e);
        }
    });

    /* ============================================================
     * 画面の部品
     *   #canvas-frame の中に置く（疑似全画面などで枠が拡大・移動されても、一緒に動く）。
     *   サイトの CSS とぶつからないよう、中身は shadow DOM に入れる
     * ============================================================ */

    const h = (_tag, _props = {}, ..._kids) => {
        const el = document.createElement(_tag);
        Object.entries(_props).forEach(([k, v]) => {
            if (k === `class`) {
                el.className = v;
            } else if (k === `text`) {
                el.textContent = v;
            } else if (k.startsWith(`on`)) {
                el.addEventListener(k.slice(2), v);
            } else if (k === `hidden` || k === `disabled`) {
                el[k] = v;
            } else if (v !== undefined && v !== null) {
                el.setAttribute(k, v);
            }
        });
        el.append(..._kids.flat().filter(c => c !== null && c !== undefined));
        return el;
    };

    /**
     * 画面の色（ランチャー自身の設定「画面の色」で切り替える）
     *   ダークの値はいままでの色。ライトの値は、ダンおに＋の画面のライト（lib/theme.css）に合わせた
     */
    const DARK = `color-scheme: dark;
    --text: #e8ecf4; --sub: #8b96b0; --desc: #a4aec6; --cur: #9fd0ff; --focus: #9fd0ff; --bad: #ff6b6b;
    --accent: #58aef5; --accent-bg: #1f6fb5; --on-accent: #ffffff; --act: #173a5c; --act-hover: #1f6fb5;
    --veil: rgba(0, 0, 0, .45); --panel: #141926; --panel-line: #45506c; --shadow: rgba(0, 0, 0, .6);
    --line: #2c3550; --line-soft: #2a3350; --item: #1a2030; --hover: #222a3e; --edit: #111622; --x-hover: #2a3350; --scroll: #45506c;
    --ctl: #252c40; --ctl-line: #55607e; --ctl-hover: #323b56; --knob: #8b96b0; --field: #0c1019; --swatch-line: #8b96b0;
    --fab-bg: rgba(18, 23, 36, .78); --fab-line: #6b7896; --fab-icon: #e8ecf4; --fab-dot: #141926;
    --tag-play-bg: #5a3d12; --tag-play: #ffcf7a; --tag-lock-bg: #2d3a5c; --tag-lock: #a9c4ff; --tag-ng-bg: #3a3f52; --tag-ng: #b9c0d4;`;
    const LIGHT = `color-scheme: light;
    --text: #1c2030; --sub: #5d6478; --desc: #4b5368; --cur: #16679f; --focus: #1c78b8; --bad: #c0392b;
    --accent: #1c78b8; --accent-bg: #1c78b8; --on-accent: #ffffff; --act: #d9e8f8; --act-hover: #c2daf3;
    --veil: rgba(10, 15, 30, .35); --panel: #f3f4f8; --panel-line: #c3c9d6; --shadow: rgba(20, 30, 60, .28);
    --line: #dadfe8; --line-soft: #e0e4ec; --item: #ffffff; --hover: #edf3fb; --edit: #f7f9fc; --x-hover: #e2e6ee; --scroll: #c3c9d6;
    --ctl: #e7eaf1; --ctl-line: #c3c9d6; --ctl-hover: #dbe0ea; --knob: #8b91a1; --field: #ffffff; --swatch-line: #8b91a1;
    --fab-bg: rgba(255, 255, 255, .85); --fab-line: #9aa3b8; --fab-icon: #1c2030; --fab-dot: #ffffff;
    --tag-play-bg: #f6e3c4; --tag-play: #7a4d00; --tag-lock-bg: #dbe6fb; --tag-lock: #24508f; --tag-ng-bg: #e2e6ee; --tag-ng: #4d5568;`;
    /** 画面の色の選択肢（ランチャー自身の設定の値） */
    const THEMES = [`dark`, `light`, `auto`];

    const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.root { ${DARK} }
.root.light { ${LIGHT} }
@media (prefers-color-scheme: light) {
    .root.auto { ${LIGHT} }
}
.root { position: absolute; left: 0; top: 0; width: 100%; height: var(--h, 500px); pointer-events: none;
    font: 13px/1.5 "Hiragino Kaku Gothic ProN", "Yu Gothic Medium", Meiryo, sans-serif; color: var(--text); -webkit-text-size-adjust: 100%;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
button { font: inherit; color: inherit; margin: 0; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
button:disabled { cursor: default; }
input { font: inherit; color: inherit; user-select: text; -webkit-user-select: text; }
.fab { position: absolute; width: 36px; height: 36px; padding: 0; border: 1px solid var(--fab-line); border-radius: 18px; color: var(--fab-icon);
    background: var(--fab-bg); opacity: .7; pointer-events: auto; display: flex; align-items: center; justify-content: center; }
.fab:hover, .fab:focus-visible { opacity: 1; border-color: var(--focus); }
.fab.tr { right: 6px; top: 6px; } .fab.tl { left: 6px; top: 6px; }
.fab.br { right: 6px; bottom: 6px; } .fab.bl { left: 6px; bottom: 6px; }
.fab svg { width: 20px; height: 20px; }
.fab svg circle { fill: var(--fab-dot); }
.veil { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background: var(--veil); pointer-events: auto; touch-action: manipulation;
    display: flex; align-items: center; justify-content: center; }
/* 高さは決まった大きさ（中身・広げた所・画面ごとのボタンで変わらない）。入りきらない分は一覧の中で送る */
.panel { width: min(94%, 540px); height: min(94%, 600px); display: flex; flex-direction: column; background: var(--panel);
    border: 1px solid var(--panel-line); border-radius: 10px; box-shadow: 0 6px 28px var(--shadow); }
.head { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-bottom: 1px solid var(--line); }
.head b { flex: 1; font-size: 14px; }
.head small { color: var(--sub); font-size: 11px; }
.x { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 18px; background: transparent; font-size: 20px; line-height: 1; }
.x:hover, .x:focus-visible { background: var(--x-hover); }
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain;
    scrollbar-width: thin; scrollbar-color: var(--scroll) transparent; }
.body:focus { outline: none; }
.body > * { flex: none; }
.empty { padding: 18px 8px; color: var(--sub); text-align: center; }
.chev { flex: none; width: 16px; color: var(--sub); font-size: 11px; text-align: center; transition: transform .12s; }
[aria-expanded="true"] > .chev { transform: rotate(90deg); }
.tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 9px; font-size: 10px; line-height: 16px; vertical-align: 1px; white-space: nowrap; }
.tag.play { background: var(--tag-play-bg); color: var(--tag-play); }
.tag.lock { background: var(--tag-lock-bg); color: var(--tag-lock); }
.tag.ng { background: var(--tag-ng-bg); color: var(--tag-ng); }

/* カスタムjs 1 本（畳んだ形が基本） */
.item { border: 1px solid var(--line); border-radius: 8px; background: var(--item); }
.item.open { border-color: var(--accent); }
.item.dim .hd { opacity: .6; }
.hdrow { display: flex; align-items: center; gap: 6px; padding-right: 8px; }
.hd { flex: 1; min-width: 0; min-height: 44px; display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 8px;
    border: 0; border-radius: 8px; background: transparent; text-align: left; }
.hd:hover { background: var(--hover); }
.name { flex: 1; min-width: 0; }
.name b { font-size: 13px; }
.name small { color: var(--sub); font-size: 11px; margin-left: 6px; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px 8px 30px; }
.content { padding: 0 10px 8px; }
.desc { margin: 0 0 6px 20px; color: var(--desc); font-size: 11.5px; }

/* 設定の項目（タップすると、下に値を決める欄が広がる） */
.set { border-top: 1px dashed var(--line-soft); }
.row { width: 100%; min-height: 40px; display: flex; align-items: center; gap: 8px; padding: 4px 2px 4px 4px;
    border: 0; border-radius: 6px; background: transparent; text-align: left; }
.row[role="switch"] { padding-left: 28px; }
.row:hover:not(:disabled) { background: var(--hover); }
.row:disabled { opacity: .75; }
.label { flex: 1; min-width: 0; }
.label small { display: block; color: var(--sub); font-size: 11px; }
.cur { flex: none; max-width: 46%; display: flex; align-items: center; gap: 6px; color: var(--cur); font-variant-numeric: tabular-nums;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { flex: none; width: 16px; height: 16px; border: 1px solid var(--swatch-line); border-radius: 4px; }
.edit { margin: 0 0 6px 20px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--edit); }

/* オン／オフ */
.sw { flex: none; position: relative; display: inline-block; width: 50px; height: 30px; padding: 0; border: 1px solid var(--ctl-line); border-radius: 15px; background: var(--ctl); }
.sw::after { content: ""; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 11px; background: var(--knob); transition: left .12s; }
.sw.on { background: var(--accent-bg); border-color: var(--accent); }
.sw.on::after { left: 23px; background: var(--on-accent); }
button.sw:disabled { opacity: .55; }

/* 決まった選択肢 */
.opts { display: flex; flex-wrap: wrap; gap: 6px; }
.opt { min-width: 64px; min-height: 36px; padding: 4px 12px; border: 1px solid var(--ctl-line); border-radius: 6px; background: var(--ctl); font-size: 12.5px; }
.opt:hover { background: var(--ctl-hover); }
.opt[aria-checked="true"] { background: var(--accent-bg); border-color: var(--accent); color: var(--on-accent); }

/* 決まった範囲の数 */
.num { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.step { flex: none; min-width: 36px; min-height: 36px; padding: 0 6px; border: 1px solid var(--ctl-line); border-radius: 6px; background: var(--ctl); font-size: 16px; line-height: 1; }
.step:hover:not(:disabled) { background: var(--ctl-hover); }
.step:disabled { opacity: .4; }
input[type="range"] { flex: 1; min-width: 60px; height: 32px; margin: 0 2px; accent-color: var(--accent); touch-action: pan-y; }
.field { flex: none; height: 36px; padding: 2px 8px; border: 1px solid var(--ctl-line); border-radius: 6px; background: var(--field); font-size: 16px;
    font-variant-numeric: tabular-nums; }
.field:focus { outline: 2px solid var(--focus); outline-offset: 1px; }
.field.bad { border-color: var(--bad); }
.field.n { width: 76px; text-align: right; }
.field.c { width: 108px; font-family: Consolas, Menlo, monospace; }
.unit { flex: none; min-width: 18px; color: var(--desc); }

/* 色コード */
.col { display: flex; align-items: center; gap: 8px; }
.big { flex: none; width: 36px; height: 36px; border: 1px solid var(--swatch-line); border-radius: 6px; }
input[type="color"] { flex: none; width: 44px; height: 36px; padding: 0; border: 1px solid var(--ctl-line); border-radius: 6px; background: var(--ctl); cursor: pointer; }
.num.alpha { margin-top: 8px; }
.num.alpha .unit:last-child { min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
.pal { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip { width: 32px; height: 32px; padding: 0; border: 1px solid var(--swatch-line); border-radius: 6px; }
.chip[aria-pressed="true"] { outline: 2px solid var(--focus); outline-offset: 1px; }

/* ボタン（その画面で使えるもの）と、既定に戻す */
.act { min-height: 32px; padding: 3px 12px; border: 1px solid var(--accent); border-radius: 16px; background: var(--act); font-size: 12px; }
.act:hover, .act:focus-visible { background: var(--act-hover); }
.foot { display: flex; justify-content: flex-end; padding-top: 4px; border-top: 1px dashed var(--line-soft); }
.reset { min-height: 30px; padding: 2px 8px; border: 0; background: transparent; color: var(--sub); font-size: 11px; text-decoration: underline; }
.reset:hover { color: var(--text); }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
`;

    const host = h(`div`, { id: `danoniLauncherHost` });
    host.style.cssText = `all:initial;display:block;position:relative;width:100%;height:0;z-index:2147483000;`;
    const shadow = host.attachShadow({ mode: `open` });

    const ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">`
        + `<path d="M3 5.5h14M3 10h14M3 14.5h14"/><circle cx="7.5" cy="5.5" r="2"/>`
        + `<circle cx="13" cy="10" r="2"/><circle cx="6" cy="14.5" r="2"/></svg>`;

    const el = {};
    el.fab = h(`button`, { type: `button`, class: `fab tr`, onclick: () => openPanel() });
    el.fab.innerHTML = ICON;   // 決まった文字だけ（外から来た文字は入らない）
    el.title = h(`b`, { id: `title` });
    el.ver = h(`small`, { text: `launcher ${VERSION}` });
    el.close = h(`button`, { type: `button`, class: `x`, text: `×`, onclick: () => closePanel() });
    el.body = h(`div`, { class: `body`, tabindex: `-1` });
    // 開いている間、後ろ（本体の画面）は幕で押せず、キーも渡さない。読み上げにも、そう伝える（本体の部品には手を入れない）
    el.panel = h(`div`, { class: `panel`, role: `dialog`, 'aria-modal': `true`, 'aria-labelledby': `title` }, h(`div`, { class: `head` }, el.title, el.ver, el.close), el.body);
    let veilPressed = false;
    el.veil = h(`div`, {
        class: `veil`, hidden: true,
        onpointerdown: ev => { veilPressed = ev.target === el.veil; },
        onpointerup: ev => { veilPressed &&= ev.target === el.veil; },
        onclick: ev => { if (ev.target === el.veil && veilPressed) closePanel(); },
    }, el.panel);
    el.root = h(`div`, { class: `root`, hidden: true }, el.fab, el.veil);
    shadow.append(h(`style`, { text: CSS }), el.root);

    // 自分の部品の上での操作を、本体やサイトのスクリプトへ伝えない
    [`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `touchstart`, `touchmove`, `touchend`, `touchcancel`,
        `mousedown`, `mouseup`, `click`, `dblclick`, `contextmenu`, `wheel`, `input`, `change`].forEach(type =>
            host.addEventListener(type, ev => ev.stopPropagation()));

    let opened = false;

    /** 広げているカスタムjs（id）と、値を決める欄を広げている設定（key）。どちらも 1 つまで */
    const ui = { plugin: null, setting: null };

    /** 開いている間に押されたキー（離したときも本体へ渡さない。開く前から押していたキーの離しは、本体へ渡す） */
    const heldKeys = new Set();

    /** 画面の中で、キーボードで選べる部品（Tab で回る順。選択肢のまとまりは、選んでいる 1 つだけ） */
    const focusables = () => [el.close, ...el.body.querySelectorAll(`button, input`)]
        .filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length > 0);

    /** 選択肢のまとまりの中を、矢印キーで動く（動いた先を選ぶ。端まで行ったら反対の端へ） */
    const ARROWS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const moveOption = (_from, _dir) => {
        const group = [..._from.parentNode.querySelectorAll(`[role="radio"]`)];
        const to = group[(group.indexOf(_from) + _dir + group.length) % group.length];
        to.focus();
        to.click();
    };

    /**
     * 開いている間は、キーを本体のショートカットへ渡さない（Esc で閉じる・Tab は画面の中だけを回る）
     * 閉じている間も、ランチャーのボタンを選んで押した Enter・Space は、本体へ渡さない（本体が「始める」などに使うため）
     */
    const onKey = ev => {
        const key = ev.code || ev.key;
        if (!opened) {
            if (ev.type === `keydown`) {
                if ((ev.key === `Enter` || ev.key === ` `) && shadow.activeElement === el.fab && !el.root.hidden) {
                    ev.stopImmediatePropagation();
                    heldKeys.add(key);
                } else if (ev.repeat && heldKeys.has(key)) {
                    // 開いている間に押したキーを押したまま閉じたときの、押しっぱなしの繰り返しも渡さない
                    ev.stopImmediatePropagation();
                } else {
                    // 本体へ渡した押しは、離しも必ず渡す（開いている間の押しが、離されないまま残っていた場合に備える）
                    heldKeys.delete(key);
                }
            } else if (heldKeys.delete(key)) {
                ev.stopImmediatePropagation();
            }
            return;
        }
        if (ev.type === `keyup`) {
            // 開く前から押していたキーの離しは、本体へ渡す（渡さないと、本体はそのキーを押したままだと思う）
            if (heldKeys.delete(key)) {
                ev.stopImmediatePropagation();
            }
            return;
        }
        ev.stopImmediatePropagation();
        // 開いた直後は「×」に選択がある。開いたときの Enter・Space を押し続けた繰り返しで、すぐ閉じないようにする
        if (ev.repeat && (ev.key === `Enter` || ev.key === ` `) && shadow.activeElement === el.close) {
            ev.preventDefault();
        }
        // 押しっぱなしの繰り返しは数えない（開く前から押していたキーの繰り返しを覚えると、その離しを本体へ渡せなくなる）
        if (!ev.repeat) {
            heldKeys.add(key);
        }
        if (ev.key === `Escape`) {
            ev.preventDefault();
            closePanel();
            return;
        }
        if (Object.hasOwn(ARROWS, ev.key) && shadow.activeElement?.getAttribute(`role`) === `radio`) {
            ev.preventDefault();
            moveOption(shadow.activeElement, ARROWS[ev.key]);
            return;
        }
        if (ev.key === `Tab`) {
            const list = focusables();
            const active = shadow.activeElement;
            const at = list.indexOf(active);
            // 画面の外に選択があるときと、端にいるときだけ、行き先を決める（画面の中のほかの所なら、ブラウザに任せる）
            const outside = at === -1 && !(active instanceof Element && el.panel.contains(active));
            if (list.length > 0 && (outside || (at !== -1 && (ev.shiftKey ? at === 0 : at === list.length - 1)))) {
                ev.preventDefault();
                (ev.shiftKey ? list[list.length - 1] : list[0]).focus();
            }
        }
    };
    window.addEventListener(`keydown`, onKey, true);
    window.addEventListener(`keyup`, onKey, true);
    // ほかのウィンドウへ移ると、離しが届かない。押したままの覚えを残さない
    window.addEventListener(`blur`, () => {
        heldKeys.clear();
        releaseAll();
    });

    /**
     * 指やマウスで押している間は、画面を作り直さない。
     * 押している部品が入れ替わると、その押しが無かったことになる（数字を打ったあと、ほかの部品を押して確定したときなど）。
     * 離して、その押しの処理が済んでから作り直す
     */
    /** ランチャーの上で押している指・マウス（pointerId）。2 本の指で押しているとき、別の指を離しただけでは作り直さない */
    const pressed = new Set();
    let renderWaiting = false;
    const renderWhenFree = () => {
        if (pressed.size > 0) {
            renderWaiting = true;
        } else {
            render();
        }
    };
    /** 押している指・マウスが無くなったら、待たせていた作り直しをする（その間に次の押しが始まっていたら、また待つ） */
    const flushRender = () => {
        if (pressed.size === 0 && renderWaiting) {
            renderWaiting = false;
            setTimeout(renderWhenFree, 0);   // 離したあとの click の処理が済んでから
        }
    };
    const released = ev => {
        if (pressed.delete(ev.pointerId)) {
            flushRender();
        }
    };
    const releaseAll = () => {
        pressed.clear();
        flushRender();
    };
    host.addEventListener(`pointerdown`, ev => { pressed.add(ev.pointerId); }, true);
    window.addEventListener(`pointerup`, released, true);
    window.addEventListener(`pointercancel`, released, true);

    /* ---- いまの値の見せ方 ---- */

    /** 設定の値を、項目の右に出す形にする */
    const showValue = (_p, _s) => {
        const v = _p.def.values[_s.key];
        if (_s.type === `select`) {
            return text(_s.options.find(o => o.value === v)?.label ?? v);
        }
        if (_s.type === `number`) {
            return `${v}${text(_s.unit)}`;
        }
        return String(v);
    };

    /** 項目の右の「いまの値」（色コードは、色の見本も付ける） */
    const curOf = (_p, _s) => {
        const dot = _s.type === `color` ? h(`span`, { class: `dot` }) : null;
        const label = h(`span`);
        const cur = h(`span`, { class: `cur` }, dot, label);
        const sync = () => {
            label.textContent = showValue(_p, _s);
            if (dot !== null) {
                paint(dot, _p.def.values[_s.key]);
            }
        };
        sync();
        return { cur, sync };
    };

    /* ---- 値を決める欄（型ごと） ---- */

    /**
     * 画面の形（出している設定の並びと、「既定に戻す」を出すか）。数・色の欄で値が変わってこれが変わったら、画面を作り直す。
     * 作り直すのは、操作が一区切りついたとき（ボタンを押した・つまみを離した・打ち終えた）だけ。
     * 打っている途中やつまみを動かしている途中に作り直すと、欄やつまみが手から離れるため
     */
    const shapeOf = _p => _p.settings.filter(s => shownNow(_p, s)).map(s => s.key).join();

    /** 保存した値があるか（「既定に戻す」を出すか） */
    const hasSaved = _p => saved[_p.id] !== undefined && Object.keys(saved[_p.id]).length > 0;
    /** 「既定に戻す」を、画面を作り直さずに出し入れする（数・色の欄で値を変えたとき） */
    const syncFoot = _p => {
        const foot = [...el.body.querySelectorAll(`[data-foot]`)].find(e => e.dataset.foot === _p.id);
        if (foot !== undefined) {
            foot.hidden = !hasSaved(_p);
        }
    };
    const shaper = _p => {
        let shape = shapeOf(_p);
        let stale = false;
        return {
            /** 値が変わったあとに呼ぶ（形が変わったかを覚えるだけ） */
            note() {
                const now = shapeOf(_p);
                stale ||= now !== shape;
                shape = now;
            },
            /** 一区切りついたときに呼ぶ（形が変わっていたら作り直す。押している最中なら、離してから） */
            settle() {
                if (stale) {
                    stale = false;
                    setTimeout(renderWhenFree, 0);   // 選択の移動や、タッチのあとの click が済んでから
                }
            },
        };
    };

    /** 決まった選択肢: 並んだボタンから選ぶ（Tab で止まるのは、選んでいる 1 つ。その中は矢印キーで動く） */
    const selectEdit = (_p, _s) => {
        // 選んでいるものが選択肢に無いとき（カスタムjsが values を直に書き換えた、など）は、最初の 1 つで Tab を受ける
        const at = Math.max(_s.options.findIndex(o => o.value === _p.def.values[_s.key]), 0);
        return h(`div`, { class: `opts`, role: `radiogroup`, 'aria-label': text(_s.label) },
            _s.options.map((o, j) => h(`button`, {
                type: `button`, class: `opt`, role: `radio`, text: text(o.label), 'data-fk': `${_p.id}:${_s.key}:o${j}`,
                'aria-checked': String(o.value === _p.def.values[_s.key]), tabindex: j === at ? `0` : `-1`,
                onclick: () => { setValue(_p, _s, o.value); render(); },
            })));
    };

    /** 決まった範囲の数: − ＋・つまみ・数字の欄 */
    const numberEdit = (_p, _s, _syncRow) => {
        const now = () => _p.def.values[_s.key];
        const shape = shaper(_p);
        const dec = h(`button`, {
            type: `button`, class: `step`, text: `−`, 'data-fk': `${_p.id}:${_s.key}:dec`,
            onclick: () => { put(now() - _s.step); shape.settle(); },
        });
        const inc = h(`button`, {
            type: `button`, class: `step`, text: `＋`, 'data-fk': `${_p.id}:${_s.key}:inc`,
            onclick: () => { put(now() + _s.step); shape.settle(); },
        });
        const range = h(`input`, {
            type: `range`, min: _s.min, max: _s.max, step: _s.step, 'aria-label': text(_s.label), 'data-fk': `${_p.id}:${_s.key}:range`,
            oninput: () => put(Number(range.value), range),
            onchange: () => shape.settle(),   // つまみを離した
        });
        const field = h(`input`, {
            type: `number`, class: `field n`, min: _s.min, max: _s.max, step: _s.step, inputmode: `decimal`, 'aria-label': text(_s.label),
            'data-fk': `${_p.id}:${_s.key}:field`,
            // 打っている途中は触らない。打ち終えたら（Enter・ほかを押した）、範囲と刻みに合わせて入れる
            onchange: () => { put(field.value === `` ? NaN : Number(field.value)); shape.settle(); },
        });
        // 部品を作り直さずに、数字だけ合わせる（作り直すと、つまみや打っている欄が手から離れる）
        const sync = _from => {
            const v = now();
            if (_from !== range) {
                range.value = String(v);
            }
            field.value = String(v);
            dec.disabled = (cleanValue(_s, v - _s.step) ?? v) === v;
            inc.disabled = (cleanValue(_s, v + _s.step) ?? v) === v;
            _syncRow();
        };
        const put = (_v, _from) => {
            setValue(_p, _s, _v);
            sync(_from);
            shape.note();
            syncFoot(_p);
        };
        sync();
        return h(`div`, { class: `num` }, dec, range, inc, field, h(`span`, { class: `unit`, text: text(_s.unit) }));
    };

    /**
     * 色コード: 色の見本・コードの欄・色を選ぶ部品・選びやすい色
     * alpha: true の設定では、不透明度のつまみも出す（色を選ぶ部品と選びやすい色は、色だけを変えて不透明度を保つ）
     */
    const colorEdit = (_p, _s, _syncRow) => {
        const A = _s.alpha;
        const now = () => _p.def.values[_s.key];
        const rgb = () => now().slice(0, 7);
        const tail = () => (A ? now().slice(7, 9) : ``);
        const shape = shaper(_p);
        const big = h(`span`, { class: `big` });
        /**
         * 打った文字を色コードにして入れる（# は無くてもよい）
         *   打っている途中（_done が false）は、6 桁・8 桁の形になったときだけ入れる。
         *   3 桁・4 桁の略した形は、打ち終えたとき（_done が true）だけ受ける（#123456 を打つ途中の #1234 を、不透明度つきの色として入れないため）
         */
        const takeTyped = _done => {
            const typed = field.value.trim();
            const code = typed.startsWith(`#`) ? typed : `#${typed}`;
            if (!_done && ![7, 9].includes(code.length)) {
                field.classList.toggle(`bad`, cleanColor(code, A) === undefined);
                return;
            }
            let c = cleanColor(code, A);
            // 不透明度の付く設定で、色だけ（#rgb・#rrggbb）を打ったときは、いまの不透明度を保つ
            if (A && c !== undefined && cleanColor(code) !== undefined) {
                c = `${c.slice(0, 7)}${tail()}`;
            }
            field.classList.toggle(`bad`, c === undefined);
            if (c !== undefined) {
                put(c, field);
            }
        };
        const field = h(`input`, {
            type: `text`, class: `field c`, maxlength: A ? 9 : 7, placeholder: A ? `#RRGGBBAA` : `#RRGGBB`,
            autocapitalize: `off`, autocomplete: `off`, autocorrect: `off`,
            spellcheck: `false`, 'aria-label': text(T.colorCode), 'data-fk': `${_p.id}:${_s.key}:code`,
            oninput: () => takeTyped(false),
            // 打ち終えたら、略した形も受けてから、いまの値の書き方にそろえる
            onchange: () => { takeTyped(true); sync(); shape.settle(); },
        });
        const picker = h(`input`, {
            type: `color`, 'aria-label': text(T.colorPick), title: text(T.colorPick), 'data-fk': `${_p.id}:${_s.key}:pick`,
            oninput: () => put(`${picker.value}${tail()}`, picker),
            onchange: () => shape.settle(),   // 色を選び終えた
        });
        const chips = _s.presets.map((c, j) => {
            const chip = h(`button`, {
                type: `button`, class: `chip`, title: c, 'aria-label': c, 'data-fk': `${_p.id}:${_s.key}:c${j}`,
                onclick: () => { put(`${c}${tail()}`); shape.settle(); },
            });
            chip.style.backgroundColor = c;
            return chip;
        });
        const aRange = A ? h(`input`, {
            type: `range`, min: 0, max: 100, step: 1, 'aria-label': text(T.alpha), 'data-fk': `${_p.id}:${_s.key}:alpha`,
            oninput: () => put(`${rgb()}${alphaHex(Number(aRange.value))}`, aRange),
            onchange: () => shape.settle(),   // つまみを離した
        }) : null;
        const aOut = A ? h(`span`, { class: `unit` }) : null;
        const sync = _from => {
            const v = now();
            paint(big, v);
            if (_from !== field) {
                field.value = v;
                field.classList.remove(`bad`);
            }
            if (_from !== picker) {
                picker.value = rgb();
            }
            if (A) {
                if (_from !== aRange) {
                    aRange.value = String(alphaPct(tail()));
                }
                aOut.textContent = `${alphaPct(tail())}%`;
            }
            chips.forEach((chip, j) => chip.setAttribute(`aria-pressed`, String(_s.presets[j] === rgb())));
            _syncRow();
        };
        const put = (_v, _from) => {
            setValue(_p, _s, _v);
            sync(_from);
            shape.note();
            syncFoot(_p);
        };
        sync();
        return [
            h(`div`, { class: `col` }, big, field, picker),
            A ? h(`div`, { class: `num alpha` }, h(`span`, { class: `unit`, text: text(T.alpha) }), aRange, aOut) : null,
            h(`div`, { class: `pal` }, chips),
        ];
    };

    const editOf = (_p, _s, _syncRow) =>
        ({ select: selectEdit, number: numberEdit, color: colorEdit })[_s.type](_p, _s, _syncRow);

    /* ---- 設定の項目 1 つ ---- */

    const lockTag = _s => (_s.locked ? h(`span`, { class: `tag lock`, text: text(T.locked) }) : null);
    const labelOf = _s => h(`span`, { class: `label` }, text(_s.label), lockTag(_s),
        text(_s.note) !== `` ? h(`small`, { text: text(_s.note) }) : null);

    const settingRow = (_p, _s) => {
        const fk = `${_p.id}:${_s.key}`;
        // オン／オフは、項目そのものがスイッチ（押すと切り替わる）
        if (_s.type === `toggle`) {
            const on = _p.def.values[_s.key] === true;
            return h(`div`, { class: `set` }, h(`button`, {
                type: `button`, class: `row`, role: `switch`, 'aria-checked': String(on), 'data-fk': fk, disabled: _s.locked,
                onclick: () => { setValue(_p, _s, !on); render(); },
            }, labelOf(_s), h(`span`, { class: on ? `sw on` : `sw` })));
        }
        // ほかは、押すと下に「値を決める欄」が広がる
        const open = ui.plugin === _p.id && ui.setting === _s.key && !_s.locked;
        const { cur, sync } = curOf(_p, _s);
        const row = h(`button`, {
            type: `button`, class: `row`, 'aria-expanded': String(open), 'data-fk': fk, disabled: _s.locked,
            onclick: () => { ui.setting = open ? null : _s.key; render(); },
        }, h(`span`, { class: `chev`, text: `▶` }), labelOf(_s), cur);
        return h(`div`, { class: `set` }, row, open ? h(`div`, { class: `edit`, 'data-edit': fk }, editOf(_p, _s, sync)) : null);
    };

    /* ---- カスタムjs 1 本 ---- */

    /**
     * そのカスタムjs全体のスイッチ（「enabled」というオン／オフ）。when の条件に合わないときは、スイッチとして扱わない
     * （隠したスイッチがオフのままだと、設定の行も出せず、戻せなくなるため）
     */
    const mainSwitch = _p => {
        const sw = _p.settings.find(s => s.key === `enabled` && s.type === `toggle`);
        return sw !== undefined && shownNow(_p, sw) ? sw : undefined;
    };

    /** いまの画面で、そのボタンを押してよいか（読み込み中・プレイ中でない・出す画面に合う・使える・スイッチが入っている） */
    const actionUsable = (_p, _a) => {
        if (isBusyPage() || text(_p.def.unsupported) !== ``) {
            return false;
        }
        const main = mainSwitch(_p);
        if (main !== undefined && _p.def.values[main.key] !== true) {
            return false;
        }
        // 出す画面の決まったボタンは、その画面だと分かるときだけ（本体の画面が分からない版では、出さない）
        const pg = page();
        return !Array.isArray(_a.screens) || (pg !== null && _a.screens.includes(pg));
    };

    const runAction = (_p, _a) => {
        // 画面を作ってから本体の画面が変わっていたら、押さずに出し直す
        if (!actionUsable(_p, _a)) {
            render();
            return;
        }
        closePanel();
        const failed = e => console.error(`[launcher] ${_p.id} の ${_a.key} でエラー`, e);
        try {
            // run() があとから失敗する形（async）でも、同じように記録する
            const done = _a.run();
            if (done !== null && typeof done === `object` && typeof done.then === `function`) {
                done.then(undefined, failed);
            }
        } catch (e) {
            failed(e);
        }
    };

    const item = _p => {
        const def = _p.def;
        const ng = text(def.unsupported);
        const open = ui.plugin === _p.id;
        // 「enabled」というオン／オフは、そのカスタムjs全体のスイッチとして、畳んだままでも押せる所に出す
        // （when の条件に合わないときは、スイッチを出さず、オフの扱いもしない）
        const main = ng === `` ? mainSwitch(_p) : undefined;
        // when の条件に合わない設定は、出さない（値はそのまま働く）
        const rest = ng === `` ? _p.settings.filter(s => s !== main && shownNow(_p, s)) : [];
        const off = main !== undefined && def.values[main.key] !== true;
        // いまの画面で使えるボタンは、畳んだままでも押せる
        const acts = ng === `` && !off ? _p.actions.filter(a => actionUsable(_p, a)) : [];

        const head = h(`div`, { class: `hdrow` },
            h(`button`, {
                type: `button`, class: `hd`, 'aria-expanded': String(open), 'data-fk': _p.id,
                onclick: () => { ui.plugin = open ? null : _p.id; ui.setting = null; render(); },
            },
                h(`span`, { class: `chev`, text: `▶` }),
                h(`span`, { class: `name` },
                    h(`b`, { text: text(def.name) || _p.id }),
                    h(`small`, { text: text(def.version) }),
                    def.affectsPlay === true ? h(`span`, { class: `tag play`, text: text(T.affects) }) : null,
                    ng !== `` ? h(`span`, { class: `tag ng`, text: text(T.ng) }) : null,
                    main !== undefined ? lockTag(main) : null)),
            main !== undefined ? h(`button`, {
                type: `button`, class: off ? `sw` : `sw on`, role: `switch`, 'aria-checked': String(!off), 'aria-label': text(main.label),
                'data-fk': `${_p.id}:${main.key}`, disabled: main.locked,
                onclick: () => { setValue(_p, main, off); render(); },
            }) : null);

        const kids = [head];
        if (acts.length > 0) {
            kids.push(h(`div`, { class: `quick` }, acts.map(a => h(`button`, {
                type: `button`, class: `act`, text: text(a.label) || a.key, 'data-fk': `${_p.id}::${a.key}`, onclick: () => runAction(_p, a),
            }))));
        }
        if (open) {
            const body = [];
            if (text(def.description) !== ``) {
                body.push(h(`p`, { class: `desc`, text: text(def.description) }));
            }
            if (ng !== ``) {
                body.push(h(`p`, { class: `desc`, text: `${text(T.unsupported)}: ${ng}` }));
            } else if (off) {
                body.push(h(`p`, { class: `desc`, text: text(T.turnOn) }));
            } else if (rest.length === 0) {
                body.push(h(`p`, { class: `desc`, text: text(T.noSettings) }));
            } else {
                rest.forEach(s => body.push(settingRow(_p, s)));
            }
            body.push(h(`div`, { class: `foot`, 'data-foot': _p.id, hidden: !hasSaved(_p) }, h(`button`, {
                type: `button`, class: `reset`, text: text(T.reset), 'data-fk': `${_p.id}:#reset`,
                onclick: () => {
                    resetValues(_p);
                    render();
                    // 押したボタンは隠れるので、選択はそのカスタムjsの見出しへ移す（キーボードで続けて操作できるように）
                    [...el.body.querySelectorAll(`[data-fk]`)].find(e => e.dataset.fk === _p.id)?.focus({ preventScroll: true });
                },
            })));
            kids.push(h(`div`, { class: `content` }, body));
        }
        return h(`div`, { class: `item${open ? ` open` : ``}${ng !== `` || off ? ` dim` : ``}`, 'data-item': _p.id }, kids);
    };

    /** 前に作ったときに広げていた所（{ plugin, setting }。開いた直後は null） */
    let lastShowing = null;

    /** 画面を作り直す（開いているときだけ）。スクロールの位置と、キーボードで選んでいた部品は保つ */
    function render() {
        el.fab.title = text(T.open);
        el.fab.setAttribute(`aria-label`, text(T.open));
        el.fab.className = `fab ${selfDef.values.corner}`;
        el.root.className = `root ${THEMES.includes(selfDef.values.theme) ? selfDef.values.theme : THEMES[0]}`;
        // 出すカスタムjsが 1 本も無いページでは、ボタンを出さない（登録されたら出る。ランチャー自身と、quiet: true のものは数えない）
        const wasHidden = el.fab.hidden;
        el.fab.hidden = ![...plugins.values()].some(p => p.def !== selfDef && !p.quiet);
        if (wasHidden && !el.fab.hidden) {
            // あとから出たときも、本体のボタンとの重なりを見る
            dodge();
            clearTimeout(dodgeTimer);
            dodgeTimer = setTimeout(dodge, 600);
        }
        if (!opened) {
            return;
        }
        if (ui.plugin !== null && !plugins.has(ui.plugin)) {
            ui.plugin = null;
        }
        const focus = shadow.activeElement?.dataset?.fk;
        const scroll = el.body.scrollTop;
        el.title.textContent = text(T.title);
        el.close.setAttribute(`aria-label`, text(T.close));
        // 登録の順に並べ、ランチャー自身は最後
        const order = [...plugins.values()].filter(p => p.def !== selfDef);
        // 1 本の行を作る途中で例外が出ても（宣言の中身を読むと例外になる、など）、その 1 本を出さないだけにする
        const safeItem = _p => {
            try {
                return item(_p);
            } catch (e) {
                console.error(`[launcher] ${_p.id} の行を作れませんでした`, e);
                return null;
            }
        };
        el.body.replaceChildren(
            ...(order.length === 0 ? [h(`div`, { class: `empty`, text: text(T.empty) })] : order.map(safeItem).filter(e => e !== null)),
            ...[plugins.get(selfDef.id)].filter(p => p?.def === selfDef).map(safeItem).filter(e => e !== null));
        el.body.scrollTop = scroll;
        if (focus !== undefined) {
            [...el.body.querySelectorAll(`[data-fk]`)].find(e => e.dataset.fk === focus)?.focus({ preventScroll: true });
        }
        // 広げた所が、一覧の外にはみ出さないようにする（一覧の中だけを送る。ページは動かさない）。
        // 送るのは、新しく広げたときだけ。同じ所を広げたままの作り直しでは、いまの位置を保ち、選んでいる部品だけを見える所に置く
        // （欄が一覧より長いとき、下のほうの選択肢を選ぶたびに、欄の頭へ戻さないため）
        // 欄を畳んだとき（同じカスタムjsのまま、広げている設定が無くなった）も、位置を保つ
        const moved = lastShowing === null || lastShowing.plugin !== ui.plugin
            || (ui.setting !== null && lastShowing.setting !== ui.setting);
        const shown = moved
            ? (ui.setting !== null ? el.body.querySelector(`[data-edit]`) : null) ?? el.body.querySelector(`.item.open`)
            : (el.body.contains(shadow.activeElement) ? shadow.activeElement : null);
        lastShowing = { plugin: ui.plugin, setting: ui.setting };
        if (shown !== null) {
            const box = el.body.getBoundingClientRect();
            const r = shown.getBoundingClientRect();
            const scale = (box.height / el.body.offsetHeight) || 1;
            if (r.top < box.top) {
                el.body.scrollTop -= (box.top - r.top) / scale + 4;
            } else if (r.bottom > box.bottom) {
                el.body.scrollTop += Math.min(r.bottom - box.bottom, r.top - box.top) / scale + 4;
            }
        }
    }

    function openPanel() {
        if (opened || isBusyPage() || !host.isConnected) {
            return;
        }
        opened = true;
        lastShowing = null;   // 開いたときは、広げている所を見える位置へ送る
        el.veil.hidden = false;
        // 作品側の指定が後から置かれていても、ほかのタブで設定を変えていても拾えるよう、開くたびに値を決め直す
        reloadLocal();
        applyAll();
        fit();
        render();
        el.close.focus();
    }

    function closePanel() {
        if (!opened) {
            return;
        }
        opened = false;
        el.veil.hidden = true;
        // 閉じたら、キーは本体へ戻す（ランチャーのボタンに選択を残すと、次の Enter でまた開いてしまい、本体の「始める」に届かない）
        shadow.activeElement?.blur();
    }

    /* ============================================================
     * 画面の見張り（プレイ中・読み込み中は出さない）
     * ============================================================ */

    const HIDE_PAGES = [`initial`, `loading`, `loadingIos`, `main`];
    const isBusyPage = () => {
        const pg = page();
        return pg === null ? document.getElementById(`stepRoot0`) !== null : HIDE_PAGES.includes(pg);
    };

    /** 部品の高さを、本体の枠にそろえる */
    const fit = () => {
        const frame = host.parentNode;
        if (frame !== null && frame.offsetHeight > 0) {
            el.root.style.setProperty(`--h`, `${frame.offsetHeight}px`);
        }
    };

    /**
     * 本体のボタンと重なっていたら、ランチャーのボタンを縦にずらす
     * （リザルトの右上の画像コピーのボタンなど。作品が足したボタンも、本体のボタンの形なら同じようによける）
     */
    const dodge = () => {
        const frame = host.parentNode;
        if (frame === null || el.root.hidden) {
            return;
        }
        el.fab.style.transform = ``;
        const scale = (frame.getBoundingClientRect().width / frame.offsetWidth) || 1;
        const down = selfDef.values.corner.startsWith(`t`);
        const buttons = [
            ...frame.querySelectorAll(`#divRoot .button_common`),
            // 枠の外から重なってくるボタン（本体の疑似全画面の終了・一時停止、「タップでプレイ」の設定）
            document.getElementById(`danoniPseudoFullscreenExit`),
            document.getElementById(`danoniTapHost`)?.shadowRoot?.querySelector(`.gear`),
        ].filter(b => b instanceof Element && getComputedStyle(b).visibility !== `hidden`)
            .map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
        let shift = 0;
        for (let n = 0; n < 6; n++) {
            const f = el.fab.getBoundingClientRect();
            const hit = buttons.find(r => r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top);
            if (hit === undefined) {
                break;
            }
            shift += down ? (hit.bottom - f.top) / scale + 4 : (hit.top - f.bottom) / scale - 4;
            el.fab.style.transform = `translateY(${shift}px)`;
        }
    };

    let lastPage;
    let lastPlaced = ``;
    let dodgeTimer = null;
    const tick = () => {
        const frame = document.getElementById(`canvas-frame`);
        if (frame === null) {
            // 枠が無くなったら、開いていた画面は閉じる（開いたままだと、見えないのにキーを本体へ渡さない）
            if (opened) {
                closePanel();
            }
            return;
        }
        if (host.parentNode !== frame) {
            frame.insertBefore(host, frame.firstChild);
        }
        const busy = isBusyPage();
        el.root.hidden = busy;
        if (busy) {
            if (opened) {
                closePanel();
            }
            lastPage = page();
            return;   // プレイ中は、ここから先（画面の大きさを読むなど）を何もしない
        }
        const pg = page();
        if (pg !== lastPage) {
            lastPage = pg;
            fit();
            applyAll();
            render();   // 画面ごとに出すボタンが変わる
            // 本体のボタンは画面の組み立ての途中で足されることがあるので、少し待ってもう一度見る
            dodge();
            clearTimeout(dodgeTimer);
            dodgeTimer = setTimeout(dodge, 600);
        }
        // 枠が動いた・大きさが変わった（疑似全画面・窓の大きさ）ときも、重なりを見直す
        const placed = `${frame.style.transform}|${frame.style.left}|${frame.style.top}|${frame.style.width}|${frame.offsetHeight}|${innerWidth}|${innerHeight}`;
        if (placed !== lastPlaced) {
            lastPlaced = placed;
            fit();
            dodge();
            clearTimeout(dodgeTimer);
            dodgeTimer = setTimeout(dodge, 600);
        }
    };

    /* ============================================================
     * 始める
     * ============================================================ */

    /** ランチャー自身も、規格どおりの 1 本として登録する */
    const selfDef = {
        id: `launcher`,
        name: { ja: `ランチャー`, en: `Launcher` },
        version: VERSION,
        settings: [{
            key: `corner`, type: `select`, label: { ja: `ボタンの位置`, en: `Button position` }, default: `tr`,
            options: [
                { value: `tl`, label: { ja: `左上`, en: `Top left` } },
                { value: `tr`, label: { ja: `右上`, en: `Top right` } },
                { value: `bl`, label: { ja: `左下`, en: `Bottom left` } },
                { value: `br`, label: { ja: `右下`, en: `Bottom right` } },
            ],
        }, {
            // 既定はダーク（いままでの色。変えていない人の見た目を変えない）
            key: `theme`, type: `select`, label: { ja: `画面の色`, en: `Theme` }, default: `dark`,
            options: [
                { value: `dark`, label: { ja: `ダーク`, en: `Dark` } },
                { value: `light`, label: { ja: `ライト`, en: `Light` } },
                { value: `auto`, label: { ja: `端末に合わせる`, en: `Match system` } },
            ],
        }],
        values: { corner: `tr`, theme: `dark` },
        onChange: () => {
            render();
            dodge();
        },
    };

    loadSaved();

    /** ほかのスクリプト（拡張機能・試験）から使う口 */
    list.launcher = {
        version: VERSION,
        open: openPanel,
        close: closePanel,
        get isOpen() {
            return opened;
        },
        /** 登録されている id の一覧 */
        ids: () => [...[...plugins.keys()].filter(id => id !== selfDef.id), ...(plugins.has(selfDef.id) ? [selfDef.id] : [])],
        /** カスタムjsを広げる（_key を渡すと、その設定の値を決める欄も広げる）。_id を省くと全部畳む */
        show(_id = null, _key = null) {
            ui.plugin = _id !== null && plugins.has(_id) ? _id : null;
            ui.setting = ui.plugin !== null ? _key : null;
            render();
        },
        /** 設定を変える（画面で変えたのと同じ扱い） */
        set(_id, _key, _value) {
            const p = plugins.get(_id);
            const s = p?.settings.find(v => v.key === _key);
            const ok = s !== undefined && setValue(p, s, _value);
            render();
            return ok;
        },
        reset(_id) {
            const p = plugins.get(_id);
            if (p !== undefined) {
                resetValues(p);
                render();
            }
        },
        /**
         * 保存先を差し替える（拡張機能やユーザースクリプトが、どのサイトでも同じ設定にするための口）
         *   { read() → 全部, write(全部, 今回変わった所) }。同じ保存先をもう一度渡すと、読み直して値を決め直す
         *   read() は、その場で結果を返すこと（Promise を返す保存先は受け付けない）。
         *   read() が返すのは、write() で受け取った最新の全部（まだ確定していない分も含める）。
         *   同じ保存先を渡し直すと、ランチャーは read() の中身で値を置き換えるので、含めないと、確定を待っている変更が消える
         *   write() は、呼ばれた順に確定させること。ランチャーは write() の完了を待たない
         *   （Promise を返してもよいが、失敗を記録するだけ。あとの書き込みが先に確定すると、古い値が残る）
         */
        setStore(_store) {
            if (!isObj(_store) || typeof _store.read !== `function` || typeof _store.write !== `function`) {
                return false;
            }
            // 先に新しい保存先から読む。読めなければ、いまの保存先と値をそのまま使い続ける
            let data;
            let later;
            try {
                data = _store.read();
                later = data !== null && typeof data === `object` && typeof data.then === `function`;
            } catch (e) {
                console.error(`[launcher] 新しい保存先から読めなかったので、差し替えませんでした`, e);
                return false;
            }
            // 読んだ結果があとから届く形（Promise）の保存先は、受け付けない（空として読むと、全部が既定に戻る）
            if (later) {
                console.error(`[launcher] read() があとから結果を返す保存先は、使えません`);
                try {
                    data.then(undefined, () => { /* 断った保存先の失敗は、ページへ漏らさない */ });
                } catch {
                    // then が例外を投げても、差し替えないだけ
                }
                return false;
            }
            // 読んだ中身を控えの形にできてから、差し替える（中身を読むと例外になる保存先でも、いまの保存先と値を残す）
            let next;
            try {
                next = savedFrom(data ?? null);
            } catch (e) {
                console.error(`[launcher] 新しい保存先の中身を読めなかったので、差し替えませんでした`, e);
                return false;
            }
            store = _store;
            saved = next;
            applyAll();
            renderWhenFree();   // 押している最中（つまみを動かしている途中など）なら、離してから作り直す
            return true;
        },
    };

    // 自分を最初に受け付ける（同じ id のものが先に登録されていても、ランチャー自身の設定を出せるように）。
    // そのあと、すでに登録されているものを拾い、これから登録されるものも拾う
    adopt(selfDef);
    [...list].forEach(adopt);
    list.push = function (..._defs) {
        const length = Array.prototype.push.apply(this, _defs);
        _defs.forEach(adopt);
        return length;
    };
    Array.prototype.push.call(list, selfDef);   // 配列にも置く（受け付けは済んでいる）

    tick();
    setInterval(tick, 250);
})();
