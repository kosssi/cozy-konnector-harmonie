'use strict'

const {baseKonnector, filterExisting, saveDataAndFile, models} = require('cozy-konnector-libs')
const requestJson = require('request-json')
//const request = require('request')
const request = require('request-debug')(require('request'))

const Bill = models.bill

const logger = require('printit')({
  prefix: 'Harmonie',
  date: true
})

module.exports = baseKonnector.createNew({
  name: 'Harmonie',
  vendorLink: 'www.harmonie-mutuelle.fr',

  category: 'health',
  color: {
    hex: '#48D5B5',
    css: '#48D5B5'
  },

  dataType: ['bill'],

  models: [Bill],

  fetchOperations: [
    login,
  ]

})

const fileOptions = {
  vendor: 'Harmonie',
  dateFormat: 'YYYYMMDD'
}

const baseUrl = 'https://www.harmonie-mutuelle.fr/'
const client = requestJson.createClient(baseUrl)
const userAgent = 'Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:37.0) ' +
                  'Gecko/20100101 Firefox/37.0'

client.headers['user-agent'] = userAgent
function login (requiredFields, entries, data, next) {
  console.log('loging in')
}