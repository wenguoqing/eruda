import Log from './Log'
import {
  Emitter,
  evalCss,
  isNum,
  isUndef,
  perfNow,
  startWith,
  escapeRegExp,
  isStr,
  extend,
  uniqId,
  isRegExp,
  isFn,
  stripHtmlTag,
  loadJs,
  $
} from '../lib/util'

export default class Logger extends Emitter {
  constructor($el, container) {
    super()
    this._style = evalCss(require('./Logger.scss'))

    this._$el = $el
    this._container = container
    this._logs = []
    this._timer = {}
    this._count = {}
    this._lastLog = {}
    this._filter = 'all'
    this._maxNum = 'infinite'
    this._displayHeader = false

    this._bindEvent()
  }
  displayHeader(flag) {
    this._displayHeader = flag
  }
  maxNum(val) {
    let logs = this._logs

    this._maxNum = val
    if (isNum(val) && logs.length > val) {
      this._logs = logs.slice(logs.length - val)
      this.render()
    }
  }
  displayUnenumerable(flag) {
    Log.showUnenumerable = flag
  }
  displayGetterVal(flag) {
    Log.showGetterVal = flag
  }
  lazyEvaluation(flag) {
    Log.lazyEvaluation = flag
  }
  viewLogInSources(flag) {
    Log.showSrcInSources = flag
  }
  destroy() {
    evalCss.remove(this._style)
  }
  filter(val) {
    this._filter = val
    this.emit('filter', val)

    return this.render()
  }
  count(label) {
    let count = this._count

    !isUndef(count[label]) ? count[label]++ : (count[label] = 1)

    return this.html(`<div class="eruda-blue">${label}: ${count[label]}</div>`)
  }
  assert(...args) {
    if (args.length === 0) return

    let exp = args.shift()

    if (!exp) {
      args.unshift('Assertion failed: ')
      return this.insert('error', args)
    }
  }
  log(...args) {
    this.insert('log', args)

    return this
  }
  debug(...args) {
    this.insert('debug', args)

    return this
  }
  dir(...args) {
    this.insert('dir', args)

    return this
  }
  table(...args) {
    this.insert('table', args)

    return this
  }
  time(name) {
    this._timer[name] = perfNow()

    return this
  }
  timeEnd(name) {
    let startTime = this._timer[name]

    if (!startTime) return
    delete this._timer[name]

    return this.html(
      `<div class="eruda-blue">${name}: ${perfNow() - startTime}ms</div>`
    )
  }
  clear() {
    this._logs = []
    this._lastLog = {}

    return this.render()
  }
  info(...args) {
    return this.insert('info', args)
  }
  error(...args) {
    return this.insert('error', args)
  }
  warn(...args) {
    return this.insert('warn', args)
  }
  input(jsCode) {
    if (startWith(jsCode, ':')) {
      this._runCmd(jsCode.slice(1))

      return this
    } else if (startWith(jsCode, '/')) {
      return this.filter(new RegExp(escapeRegExp(jsCode.slice(1))))
    }

    this.insert({
      type: 'input',
      args: [jsCode],
      ignoreFilter: true
    })

    try {
      this.output(evalJs(jsCode))
    } catch (e) {
      this.insert({
        type: 'error',
        ignoreFilter: true,
        args: [e]
      })
    }

    return this
  }
  output(val) {
    return this.insert({
      type: 'output',
      args: [val],
      ignoreFilter: true
    })
  }
  html(...args) {
    return this.insert('html', args)
  }
  help() {
    return this.insert({
      type: 'html',
      args: [helpMsg],
      ignoreFilter: true
    })
  }
  render() {
    let html = '',
      logs = this._logs

    logs = this._filterLogs(logs)

    for (let i = 0, len = logs.length; i < len; i++) {
      html += logs[i].formattedMsg
    }

    this._$el.html(html)
    this.scrollToBottom()

    return this
  }
  insert(type, args) {
    let logs = this._logs
    let $el = this._$el
    let el = $el.get(0)

    let isAtBottom = el.scrollTop === el.scrollHeight - el.offsetHeight

    let options = isStr(type) ? { type, args } : type
    extend(options, {
      id: uniqId('log'),
      displayHeader: this._displayHeader
    })

    let log = new Log(options)

    let lastLog = this._lastLog
    if (
      log.type !== 'html' &&
      lastLog.type === log.type &&
      lastLog.value === log.value
    ) {
      let $container = $el.find(`div[data-id="${lastLog.id}"]`)
      if ($container.length > 0) {
        lastLog.addCount()
        if (log.time) lastLog.updateTime(log.time)
        $container.parent().remove()
        log = lastLog
      } else {
        logs.push(log)
        this._lastLog = log
      }
    } else {
      logs.push(log)
      this._lastLog = log
    }

    if (this._maxNum !== 'infinite' && logs.length > this._maxNum) {
      const firstLog = logs[0]
      let $container = $el.find(`div[data-id="${firstLog.id}"`)
      if ($container.length > 0) {
        $container.parent().remove()
      }
      logs.shift()
    }

    if (this._filterLog(log) && this._container.active) {
      $el.append(log.formattedMsg)
    }

    this.emit('insert', log)

    if (isAtBottom) this.scrollToBottom()

    return this
  }
  scrollToBottom() {
    let el = this._$el.get(0)

    el.scrollTop = el.scrollHeight - el.offsetHeight
  }
  _filterLogs(logs) {
    let filter = this._filter

    if (filter === 'all') return logs

    let isFilterRegExp = isRegExp(filter)
    let isFilterFn = isFn(filter)

    return logs.filter(log => {
      if (log.ignoreFilter) return true
      if (isFilterFn) return filter(log)
      if (isFilterRegExp) return filter.test(stripHtmlTag(log.formattedMsg))
      return log.type === filter
    })
  }
  _filterLog(log) {
    let filter = this._filter

    if (filter === 'all') return true

    let isFilterRegExp = isRegExp(filter),
      isFilterFn = isFn(filter)

    if (log.ignoreFilter) return true
    if (isFilterFn) return filter(log)
    if (isFilterRegExp) return filter.test(stripHtmlTag(log.formattedMsg))

    return log.type === filter
  }
  _loadJs(name) {
    loadJs(libraries[name], result => {
      if (result) return this.log(`${name} is loaded`)

      this.warn(`Failed to load ${name}`)
    })
  }
  _runCmd(cmd) {
    switch (cmd.trim()) {
      case '$':
        return this._loadJs('jQuery')
      case '_':
        return this._loadJs('underscore')
      default:
        this.warn('Unknown command').help()
    }
  }
  _bindEvent() {
    let self = this

    this._$el.on('click', '.eruda-log-item', function() {
      let $el = $(this)
      let id = $el.data('id')
      let type = $el.data('type')
      let logs = self._logs
      let log

      for (let i = 0, len = logs.length; i < len; i++) {
        log = logs[i]
        if (log.id === id) break
      }
      if (!log) return

      Log.click(type, log, $el, self)
    })
  }
}

let cmdList = require('./cmdList.json'),
  helpMsg = require('./help.hbs')({ commands: cmdList }),
  libraries = require('./libraries.json')

let evalJs = jsInput => {
  let ret

  try {
    ret = eval.call(window, `(${jsInput})`)
  } catch (e) {
    ret = eval.call(window, jsInput)
  }

  return ret
}
