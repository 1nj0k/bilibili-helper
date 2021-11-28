// ==UserScript==
// @name         Fuck ZhiHu Mobile Style
// @namespace    https://github.com/ipcjs
// @version      2.1.6
// @description  日他娘的逼乎手机网页版 样式ver; 针对电脑版进行修改，适配手机屏幕;
// @author       ipcjs
// @compatible   chrome
// @compatible   firefox
// @include      https://www.zhihu.com/*
// @include      https://zhuanlan.zhihu.com/*
// @require      https://greasemonkey.github.io/gm4-polyfill/gm4-polyfill.js
// @grant        GM_addStyle
// @grant        GM.addStyle
// @run-at       document-start
// ==/UserScript==

// @template-content

function main ({ log }) {
    removeThankButton(document);
    new MutationObserver((mutations, observer) => {
        // log(mutations)
        for (let m of mutations) {
            for (let node of m.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    removeThankButton(node);
                }
            }
        }
    }).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    function removeThankButton(node) {
        let count = 0;
        node.querySelectorAll('button.ContentItem-action')
            .forEach(btn => {
                let $text = btn.childNodes[1];
                let group;
                if ($text && $text.nodeType === Node.TEXT_NODE) {
                    let text = $text.textContent;
                    count++;
                    if (text === '感谢' || text === '取消感谢') {
                        btn.style.display = 'none';
                    } else if (text === '举报' || text === '收藏') {
                        $text.textContent = '';
                    } else if ((group = text.match(/(\d+) 条评论/))) {
                        $text.textContent = `${group[1]}`;
                    } else {
                        count--;
                    }
                }
            });
        if (count > 0) {
            log(`modify: ${count}`);
        }
    }
}

log = GM_info.script.name.endsWith('.dev') ? console.debug.bind(console) : () => { };

GM.addStyle(css);
main({ log });
