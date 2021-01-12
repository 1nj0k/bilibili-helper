import { util_init } from "../../util/initiator"
import { log, util_warn } from "../../util/log"
import { _ } from "../../util/react"
import { ifNotNull } from "../../util/utils"
import { balh_config, isClosed } from "../config"
import { util_page } from "../page"
import pageTemplate from './bangumi-play-page-template.html' // 不用管这个报错

export function modifyGlobalValue<T = any>(
    name: string,
    options: {
        // onWrite可以修改写入的值
        onWrite: (value: T | undefined) => T | undefined,
        // onRead可以用来打断点...
        onRead?: (value: T | undefined) => void
    },
) {
    const _window = window as StringAnyObject
    const name_origin = `${name}_origin`
    _window[name_origin] = _window[name]
    let value: T | undefined = undefined
    Object.defineProperty(_window, name, {
        configurable: true,
        enumerable: true,
        get: () => {
            options?.onRead?.(value)
            return value
        },
        set: (val) => {
            value = options.onWrite(val)
        }
    })
    if (_window[name_origin]) {
        _window[name] = _window[name_origin]
    }
}

let callbackCount = 1000
function appendScript(
    node: Node,
    innerHTML: string,
    props: {
        type: string | '',
        src: string | '',
        crossOrigin: string | null,
    },
) {
    // log(`fuck: ${JSON.stringify(props)}`)
    return new Promise((resolve, reject) => {
        let onLoad
        if (props.src) {
            onLoad = resolve
        } else if (!props.type || props.type === 'text/javascript') {
            const anyWindow = window as any
            const key: string = `balh_appendScript_${callbackCount++}`
            anyWindow[key] = resolve
            innerHTML = `try { ${innerHTML} } finally { window['${key}'](); } `
        } else {
            setTimeout(resolve, 0)
        }
        node.appendChild(_('script', {
            // 所有属性为null/''时都替换成undefined
            type: props.type || undefined,
            src: props.src || undefined,
            crossOrigin: props.crossOrigin || undefined,
            event: { load: onLoad },
        }, innerHTML))
    })
}
async function cloneChildNodes(fromNode: Node, toNode: Node) {
    // 坑1: 一定要倒序遍历, forEach内部使用的顺序遍历实现, 直接remove()会让顺序混乱
    for (let i = toNode.childNodes.length - 1; i >= 0; i--) {
        toNode.childNodes[i].remove()
    }

    for (let i = 0; i < fromNode.childNodes.length; i++) {
        const it = fromNode.childNodes[i]
        if (it instanceof HTMLScriptElement) {
            // 坑2: 要让script内容正常执行, 一定要重新构建script标签
            await appendScript(toNode, it.innerHTML, { type: it.type, src: it.src, crossOrigin: it.crossOrigin })
        } else {
            // 坑3: 不clone可能导致forEach方法出问题...
            toNode.appendChild(it.cloneNode(true))
        }
    }
}

function fixBangumiPlayPage() {
    util_init(async () => {
        const $app = document.getElementById('app')
        if (!$app) {
            const template = new DOMParser().parseFromString(pageTemplate, 'text/html')
            await cloneChildNodes(template.getElementsByTagName('head')[0], document.head)
            await cloneChildNodes(template.getElementsByTagName('body')[0], document.body)
            // TODO: 构造正确的window.__INITIAL_STATE__
        }
        let $eplist_module = document.getElementById('eplist_module')
        if (!$eplist_module) {
            const $danmukuBox = document.getElementById('danmukuBox')
            if (!$danmukuBox) {
                util_warn('danmukuBox not found!')
                return
            }
            // 插入eplist_module的位置和内容一定要是这样... 不能改...
            // 写错了会导致Vue渲染出错, 比如视频播放窗口消失之类的(╯°口°)╯(┴—┴
            const $template = _('template', {}, `<div id="eplist_module" class="ep-list-wrapper report-wrap-module"><div class="list-title clearfix"><h4 title="正片">正片</h4> <span class="mode-change" style="position:relative"><i report-id="click_ep_switch" class="iconfont icon-ep-list-detail"></i> <!----></span> <!----> <span class="ep-list-progress">8/8</span></div> <div class="list-wrapper" style="display:none;"><ul class="clearfix" style="height:-6px;"></ul></div></div>`.trim())
            $danmukuBox.parentElement?.replaceChild($template.content.firstElementChild!, $danmukuBox.nextSibling!.nextSibling!)
        }

    })
}

export function area_limit_for_vue() {
    if (isClosed()) return

    if (!(
        (util_page.av() && balh_config.enable_in_av) || util_page.new_bangumi()
    )) {
        return
    }
    function replacePlayInfo() {
        log("window.__playinfo__", window.__playinfo__)
        window.__playinfo__origin = window.__playinfo__
        let playinfo: any = undefined
        // 将__playinfo__置空, 让播放器去重新加载它...
        Object.defineProperty(window, '__playinfo__', {
            configurable: true,
            enumerable: true,
            get: () => {
                log('__playinfo__', 'get')
                return playinfo
            },
            set: (value) => {
                // debugger
                log('__playinfo__', 'set')
                // 原始的playinfo为空, 且页面在loading状态, 说明这是html中对playinfo进行的赋值, 这个值可能是有区域限制的, 不能要
                if (!window.__playinfo__origin && window.document.readyState === 'loading') {
                    log('__playinfo__', 'init in html', value)
                    window.__playinfo__origin = value
                    return
                }
                playinfo = value
            },
        })
    }

    function replaceUserState() {
        modifyGlobalValue('__PGC_USERSTATE__', {
            onWrite: (value) => {
                if (value) {
                    // 区域限制
                    // todo      : 调用areaLimit(limit), 保存区域限制状态
                    // 2019-08-17: 之前的接口还有用, 这里先不保存~~
                    value.area_limit = 0
                    // 会员状态
                    if (balh_config.blocked_vip && value.vip_info) {
                        value.vip_info.status = 1
                        value.vip_info.type = 2
                    }
                }
                return value
            }
        })
    }
    function replaceInitialState() {
        modifyGlobalValue('__INITIAL_STATE__', {
            onWrite: (value) => {
                if (value && value.epInfo && value.epList && balh_config.blocked_vip) {
                    for (let ep of [value.epInfo, ...value.epList]) {
                        // 13貌似表示会员视频, 2为普通视频
                        if (ep.epStatus === 13) {
                            log('epStatus 13 => 2', ep)
                            ep.epStatus = 2
                        }
                    }
                }
                if (value?.mediaInfo?.rights?.appOnly === true) {
                    value.mediaInfo.rights.appOnly = false
                    window.__balh_app_only__ = true
                }
                ifNotNull(value?.epInfo?.rights, (it) => it.area_limit = 0)
                value?.epList?.forEach((it: any) => ifNotNull(it?.rights, (it) => it.area_limit = 0))
                return value
            }
        })
    }
    replaceInitialState()
    replaceUserState()
    replacePlayInfo()
    if (util_page.new_bangumi()) {
        fixBangumiPlayPage()
    }

    modifyGlobalValue('BilibiliPlayer', {
        onWrite: (value) => {
            return value
        },
        onRead: (value) => {

        }
    })
}