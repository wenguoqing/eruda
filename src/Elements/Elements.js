import Tool from '../DevTools/Tool'
import CssStore from './CssStore'
import stringify from '../lib/stringify'
import Highlight from './Highlight'
import Select from './Select'
import Settings from '../Settings/Settings'
import {
  evalCss,
  $,
  keys,
  MutationObserver,
  each,
  isErudaEl,
  toStr,
  isEl,
  isStr,
  map,
  escape,
  startWith,
  isFn,
  isBool,
  safeGet,
  pxToNum,
  isNaN,
  isNum
} from '../lib/util'

export default class Elements extends Tool {
  constructor() {
    super()

    this._style = evalCss(require('./Elements.scss'))

    this.name = 'elements'
    this._tpl = require('./Elements.hbs')
    this._rmDefComputedStyle = true
    this._highlightElement = false
    this._selectElement = false
    this._observeElement = true
  }
  init($el, container) {
    super.init($el)

    this._container = container

    $el.html('<div class="eruda-show-area"></div>')
    this._$showArea = $el.find('.eruda-show-area')
    $el.append(require('./BottomBar.hbs')())

    this._htmlEl = document.documentElement
    this._highlight = new Highlight(this._container.$container)
    this._select = new Select()
    this._bindEvent()
    this._initObserver()
    this._initCfg()
  }
  show() {
    super.show()

    if (this._observeElement) this._enableObserver()
    if (!this._curEl) this._setEl(this._htmlEl)
    this._render()
  }
  hide() {
    this._disableObserver()

    return super.hide()
  }
  set(e) {
    this._setEl(e)
    this.scrollToTop()
    this._render()

    return this
  }
  overrideEventTarget() {
    let winEventProto = getWinEventProto()

    let origAddEvent = (this._origAddEvent = winEventProto.addEventListener)
    let origRmEvent = (this._origRmEvent = winEventProto.removeEventListener)

    winEventProto.addEventListener = function(type, listener, useCapture) {
      addEvent(this, type, listener, useCapture)
      origAddEvent.apply(this, arguments)
    }

    winEventProto.removeEventListener = function(type, listener, useCapture) {
      rmEvent(this, type, listener, useCapture)
      origRmEvent.apply(this, arguments)
    }
  }
  scrollToTop() {
    let el = this._$showArea.get(0)

    el.scrollTop = 0
  }
  restoreEventTarget() {
    let winEventProto = getWinEventProto()

    if (this._origAddEvent) winEventProto.addEventListener = this._origAddEvent
    if (this._origRmEvent) winEventProto.removeEventListener = this._origRmEvent
  }
  destroy() {
    super.destroy()

    evalCss.remove(this._style)
    this._select.disable()
    this._highlight.destroy()
    this._disableObserver()
    this.restoreEventTarget()
    this._rmCfg()
  }
  _back() {
    if (this._curEl === this._htmlEl) return

    let parentQueue = this._curParentQueue
    let parent = parentQueue.shift()

    while (!isElExist(parent)) parent = parentQueue.shift()

    this.set(parent)
  }
  _bindEvent() {
    let self = this
    let container = this._container
    let select = this._select

    this._$el
      .on('click', '.eruda-child', function() {
        let idx = $(this).data('idx')
        let curEl = self._curEl
        let el = curEl.childNodes[idx]

        if (el && el.nodeType === 3) {
          let curTagName = curEl.tagName
          let type

          switch (curTagName) {
            case 'SCRIPT':
              type = 'js'
              break
            case 'STYLE':
              type = 'css'
              break
            default:
              return
          }

          let sources = container.get('sources')

          if (sources) {
            sources.set(type, el.nodeValue)
            container.showTool('sources')
          }

          return
        }

        !isElExist(el) ? self._render() : self.set(el)
      })
      .on('click', '.eruda-listener-content', function() {
        let text = $(this).text()
        let sources = container.get('sources')

        if (sources) {
          sources.set('js', text)
          container.showTool('sources')
        }
      })
      .on('click', '.eruda-breadcrumb', () => {
        let data = this._elData

        if (!data) {
          data = stringify(this._curEl, { getterVal: true })
          data = JSON.parse(data)
        }
        let sources = container.get('sources')

        this._elData = data

        if (sources) {
          sources.set('json', data)
          container.showTool('sources')
        }
      })
      .on('click', '.eruda-parent', function() {
        let idx = $(this).data('idx')
        let curEl = self._curEl
        let el = curEl.parentNode

        while (idx-- && el.parentNode) el = el.parentNode

        !isElExist(el) ? self._render() : self.set(el)
      })
      .on('click', '.eruda-toggle-all-computed-style', () =>
        this._toggleAllComputedStyle()
      )

    let $bottomBar = this._$el.find('.eruda-bottom-bar')

    $bottomBar
      .on('click', '.eruda-refresh', () => this._render())
      .on('click', '.eruda-highlight', () => this._toggleHighlight())
      .on('click', '.eruda-select', () => this._toggleSelect())
      .on('click', '.eruda-reset', () => this.set(this._htmlEl))

    select.on('select', target => this.set(target))
  }
  _toggleAllComputedStyle() {
    this._rmDefComputedStyle = !this._rmDefComputedStyle

    this._render()
  }
  _enableObserver() {
    this._observer.observe(this._htmlEl, {
      attributes: true,
      childList: true,
      subtree: true
    })
  }
  _disableObserver() {
    this._observer.disconnect()
  }
  _toggleHighlight() {
    if (this._selectElement) return

    this._$el.find('.eruda-highlight').toggleClass('eruda-active')
    this._highlightElement = !this._highlightElement

    this._render()
  }
  _toggleSelect() {
    let select = this._select

    this._$el.find('.eruda-select').toggleClass('eruda-active')
    if (!this._selectElement && !this._highlightElement) this._toggleHighlight()
    this._selectElement = !this._selectElement

    if (this._selectElement) {
      select.enable()
      this._container.hide()
    } else {
      select.disable()
    }
  }
  _setEl(el) {
    this._curEl = el
    this._elData = null
    this._curCssStore = new CssStore(el)
    this._highlight.setEl(el)
    this._rmDefComputedStyle = true

    let parentQueue = []

    let parent = el.parentNode
    while (parent) {
      parentQueue.push(parent)
      parent = parent.parentNode
    }
    this._curParentQueue = parentQueue
  }
  _getData() {
    let ret = {}

    let el = this._curEl
    let cssStore = this._curCssStore

    let { className, id, attributes, tagName } = el

    ret.parents = getParents(el)
    ret.children = formatChildNodes(el.childNodes)
    ret.attributes = formatAttr(attributes)
    ret.name = formatElName({ tagName, id, className, attributes })

    let events = el.erudaEvents
    if (events && keys(events).length !== 0) ret.listeners = events

    if (needNoStyle(tagName)) return ret

    let computedStyle = cssStore.getComputedStyle()

    function getBoxModelValue(type) {
      let keys = ['top', 'left', 'right', 'bottom']
      if (type !== 'position') keys = map(keys, key => `${type}-${key}`)
      if (type === 'border') keys = map(keys, key => `${key}-width`)

      return {
        top: boxModelValue(computedStyle[keys[0]], type),
        left: boxModelValue(computedStyle[keys[1]], type),
        right: boxModelValue(computedStyle[keys[2]], type),
        bottom: boxModelValue(computedStyle[keys[3]], type)
      }
    }

    let boxModel = {
      margin: getBoxModelValue('margin'),
      border: getBoxModelValue('border'),
      padding: getBoxModelValue('padding'),
      content: {
        width: boxModelValue(computedStyle['width']),
        height: boxModelValue(computedStyle['height'])
      }
    }

    if (computedStyle['position'] !== 'static') {
      boxModel.position = getBoxModelValue('position')
    }
    ret.boxModel = boxModel

    if (this._rmDefComputedStyle) {
      computedStyle = rmDefComputedStyle(computedStyle)
    }
    ret.rmDefComputedStyle = this._rmDefComputedStyle
    processStyleRules(computedStyle)
    ret.computedStyle = computedStyle

    let styles = cssStore.getMatchedCSSRules()
    styles.unshift(getInlineStyle(el.style))
    styles.forEach(style => processStyleRules(style.style))
    ret.styles = styles

    return ret
  }
  _render() {
    if (!isElExist(this._curEl)) return this._back()

    this._highlight[this._highlightElement ? 'show' : 'hide']()
    this._renderHtml(this._tpl(this._getData()))
  }
  _renderHtml(html) {
    if (html === this._lastHtml) return
    this._lastHtml = html
    this._$showArea.html(html)
  }
  _initObserver() {
    this._observer = new MutationObserver(mutations => {
      each(mutations, mutation => this._handleMutation(mutation))
    })
  }
  _handleMutation(mutation) {
    let i, len, node

    if (isErudaEl(mutation.target)) return

    if (mutation.type === 'attributes') {
      if (mutation.target !== this._curEl) return
      this._render()
    } else if (mutation.type === 'childList') {
      if (mutation.target === this._curEl) return this._render()

      let addedNodes = mutation.addedNodes

      for (i = 0, len = addedNodes.length; i < len; i++) {
        node = addedNodes[i]

        if (node.parentNode === this._curEl) return this._render()
      }

      let removedNodes = mutation.removedNodes

      for (i = 0, len = removedNodes.length; i < len; i++) {
        if (removedNodes[i] === this._curEl) return this.set(this._htmlEl)
      }
    }
  }
  _rmCfg() {
    let cfg = this.config

    let settings = this._container.get('settings')

    if (!settings) return

    settings
      .remove(cfg, 'overrideEventTarget')
      .remove(cfg, 'observeElement')
      .remove('Elements')
  }
  _initCfg() {
    let cfg = (this.config = Settings.createCfg('elements', {
      overrideEventTarget: true,
      observeElement: true
    }))

    if (cfg.get('overrideEventTarget')) this.overrideEventTarget()
    if (cfg.get('observeElement')) this._observeElement = false

    cfg.on('change', (key, val) => {
      switch (key) {
        case 'overrideEventTarget':
          return val ? this.overrideEventTarget() : this.restoreEventTarget()
        case 'observeElement':
          this._observeElement = val
          return val ? this._enableObserver() : this._disableObserver()
      }
    })

    let settings = this._container.get('settings')
    settings
      .text('Elements')
      .switch(cfg, 'overrideEventTarget', 'Catch Event Listeners')

    if (this._observer) settings.switch(cfg, 'observeElement', 'Auto Refresh')

    settings.separator()
  }
}

function processStyleRules(style) {
  each(style, (val, key) => (style[key] = processStyleRule(val)))
}

let regColor = /rgba?\((.*?)\)/g,
  regCssUrl = /url\("?(.*?)"?\)/g

function processStyleRule(val) {
  // For css custom properties, val is unable to retrieved.
  val = toStr(val)

  return val
    .replace(
      regColor,
      '<span class="eruda-style-color" style="background-color: $&"></span>$&'
    )
    .replace(regCssUrl, (match, url) => `url("${wrapLink(url)}")`)
}

const isElExist = val => isEl(val) && val.parentNode

function formatElName(data, { noAttr = false } = {}) {
  let { id, className, attributes } = data

  let ret = `<span class="eruda-blue">${data.tagName.toLowerCase()}</span>`

  if (id !== '') ret += `#${id}`

  if (isStr(className)) {
    each(className.split(/\s+/g), val => {
      if (val.trim() === '') return
      ret += `.${val}`
    })
  }

  if (!noAttr) {
    each(attributes, attr => {
      let name = attr.name
      if (name === 'id' || name === 'class' || name === 'style') return
      ret += ` ${name}="${attr.value}"`
    })
  }

  return ret
}

let formatAttr = attributes =>
  map(attributes, attr => {
    let { name, value } = attr
    value = escape(value)

    let isLink =
      (name === 'src' || name === 'href') && !startWith(value, 'data')
    if (isLink) value = wrapLink(value)
    if (name === 'style') value = processStyleRule(value)

    return { name, value }
  })

function formatChildNodes(nodes) {
  let ret = []

  for (let i = 0, len = nodes.length; i < len; i++) {
    let child = nodes[i],
      nodeType = child.nodeType

    if (nodeType === 3 || nodeType === 8) {
      let val = child.nodeValue.trim()
      if (val !== '')
        ret.push({
          text: val,
          isCmt: nodeType === 8,
          idx: i
        })
      continue
    }

    let isSvg = !isStr(child.className)

    if (
      nodeType === 1 &&
      child.id !== 'eruda' &&
      (isSvg || child.className.indexOf('eruda') < 0)
    ) {
      ret.push({
        text: formatElName(child),
        isEl: true,
        idx: i
      })
    }
  }

  return ret
}

function getParents(el) {
  let ret = []
  let i = 0
  let parent = el.parentNode

  while (parent && parent.nodeType === 1) {
    ret.push({
      text: formatElName(parent, { noAttr: true }),
      idx: i++
    })

    parent = parent.parentNode
  }

  return ret.reverse()
}

function getInlineStyle(style) {
  let ret = {
    selectorText: 'element.style',
    style: {}
  }

  for (let i = 0, len = style.length; i < len; i++) {
    let s = style[i]

    ret.style[s] = style[s]
  }

  return ret
}

let defComputedStyle = require('./defComputedStyle.json')

function rmDefComputedStyle(computedStyle) {
  let ret = {}

  each(computedStyle, (val, key) => {
    if (val === defComputedStyle[key]) return

    ret[key] = val
  })

  return ret
}

let NO_STYLE_TAG = ['script', 'style', 'meta', 'title', 'link', 'head']

let needNoStyle = tagName => NO_STYLE_TAG.indexOf(tagName.toLowerCase()) > -1

function addEvent(el, type, listener, useCapture = false) {
  if (!isEl(el) || !isFn(listener) || !isBool(useCapture)) return

  let events = (el.erudaEvents = el.erudaEvents || {})

  events[type] = events[type] || []
  events[type].push({
    listener: listener,
    listenerStr: listener.toString(),
    useCapture: useCapture
  })
}

function rmEvent(el, type, listener, useCapture = false) {
  if (!isEl(el) || !isFn(listener) || !isBool(useCapture)) return

  let events = el.erudaEvents

  if (!(events && events[type])) return

  let listeners = events[type]

  for (let i = 0, len = listeners.length; i < len; i++) {
    if (listeners[i].listener === listener) {
      listeners.splice(i, 1)
      break
    }
  }

  if (listeners.length === 0) delete events[type]
  if (keys(events).length === 0) delete el.erudaEvents
}

let getWinEventProto = () => {
  return safeGet(window, 'EventTarget.prototype') || window.Node.prototype
}

let wrapLink = link => `<a href="${link}" target="_blank">${link}</a>`

function boxModelValue(val, type) {
  if (isNum(val)) return val

  if (!isStr(val)) return '‒'

  let ret = pxToNum(val)
  if (isNaN(ret)) return val

  if (type === 'position') return ret

  return ret === 0 ? '‒' : ret
}
