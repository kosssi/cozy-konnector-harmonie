const { BaseKonnector } = require('cozy-konnector-libs')
const request = require('request-promise')
const moment = require('moment')
const cheerio = require('cheerio')
const { login, releves, paiements, repayments, customSaveBills } = require('./lib')

const reducePromises = function(promises, that /* , args... */) {
  return promises.reduce((agg, promiseMaker) => {
    promiseMaker = promiseMaker.bind(that)
    const args = Array.from(arguments).slice(2)
    args.forEach(function(arg) {
      promiseMaker = promiseMaker.bind(null, arg)
    })
    return agg ? agg.then(promiseMaker) : promiseMaker()
  }, null)
}

class Konnector extends BaseKonnector {
  constructor(fetch, options) {
    super(fetch, options)
    this.items = []
    this.files = []
    this.fetchers = []
    this.exporters = []
  }

  yield(file) {
    this.files.push(file)
  }

  runFetchers() {
    return reducePromises(this.fetchers, this, this.fields)
  }

  runExporters() {
    return reducePromises(this.exporters, this, this.fields)
  }

  run() {
    return this.runFetchers().then(() => this.runExporters()).catch(err => {
      console.log(err.stack)
    })
  }
}

module.exports = new Konnector(function fetch(fields) {
  this.fields = fields
  this.fetchers = [login, releves, paiements, repayments]
  this.exporters = [customSaveBills]
  return this.run()
})
