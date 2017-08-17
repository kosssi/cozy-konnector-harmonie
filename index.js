const { BaseKonnector, saveBills } = require('cozy-konnector-libs')
let request = require('request-promise-native')
const moment = require('moment')
const cheerio = require('cheerio')

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

const parseAmount = function(amount) {
  return parseFloat(
    amount.replace('&nbsp;', '').replace('&euro;', '').replace(',', '.')
  )
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
  this.fetchers = [login, releves, paiements, reimbursements]
  this.exporters = [customSaveBills]
  return this.run()
})

const j = request.jar()

const fileOptions = {
  vendor: 'Harmonie',
  requestOptions: {
    jar: j
  }
}

const baseUrl = 'https://www.harmonie-mutuelle.fr/'
const userAgent =
  'Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:37.0) ' +
  'Gecko/20100101 Firefox/37.0'
const defaultOptions = {
  method: 'GET',
  uri: `${baseUrl}`,
  headers: {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  },
  jar: j
}

function login(requiredFields) {
  return request(defaultOptions)
    .then(body => {
      let $ = cheerio.load(body)
      let actionUrl = $('#_58_fm').prop('action')

      $('#_58_login').val(requiredFields.login)
      $('#_58_password').val(requiredFields.password)

      let formDataArray = $('#_58_fm').serializeArray()
      let formData = {}

      formDataArray.forEach(pair => {
        formData[pair.name] = pair.value
      })

      let options = Object.assign(defaultOptions, {
        method: 'POST',
        uri: actionUrl,
        formData: formData,
        simple: false,
        resolveWithFullResponse: true
      })

      return request(options)
    })
    .then(response => {
      // this is a bit strange: if the status code is 302, it means the login was successful. If it's 200, it actually means there was an error. This may change in the future if the form's action is changed.
      if (response.statusCode !== 302) {
        throw new Error('LOGIN_FAILED')
      }
    })
}

function releves(requiredFields) {
  let url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-releves'

  let options = Object.assign(defaultOptions, {
    uri: url,
    resolveWithFullResponse: false
  })

  return request(options).then(body => {
    let $ = cheerio.load(body)
    let releveList = new Map()

    $('#decompte_table tbody tr').each((index, tr) => {
      let $tr = $(tr)

      let link = $tr.find('a').attr('href')
      let date = $tr.find('td').first().text()
      date = new Date(date.split('/').reverse().join('/'))

      releveList.set(date, link)
    })

    this.releves = releveList
  })
}

function paiements(requiredFields) {
  let url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-remboursements'

  let options = Object.assign(defaultOptions, {
    uri: url,
    resolveWithFullResponse: false
  })

  return request(options)
    .then(body => {
      let $ = cheerio.load(body)
      const $form = $('[name=remboursementForm]')
      const formvalues = $form.serializeArray().reduce((memo, item) => {
        memo[item.name] = item.value
        return memo
      }, {})

      // run a request from one year ago
      formvalues.dateDebutJour = formvalues.dateFinJour
      formvalues.dateDebutMois = formvalues.dateFinMois
      formvalues.dateDebutAnnee = formvalues.dateFinAnnee - 1 + ''

      const url = $form.attr('action')
      let options = {
        uri: url,
        method: 'POST',
        form: formvalues,
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        jar: j
      }
      return request(options)
    })
    .then(body => {
      let $ = cheerio.load(body)
      let paymentList = {}

      $('img.loupe').each((index, elem) => {
        let onclick = elem.attribs.onclick
        if (!onclick) return
        let chunks = onclick.split("'")
        paymentList[chunks[1]] = chunks[3]
      })

      this.payments = paymentList
    })
}

function reimbursements(requiredFields) {
  let url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-remboursements'
  let promises = []

  for (let paymentCounter in this.payments) {
    let qs = {
      p_p_id: 'mhmRemboursement_WAR_mhmportalapplication',
      p_p_lifecycle: 2,
      p_p_state: 'normal',
      p_p_mode: 'view',
      p_p_cacheability: 'cacheLevelPage',
      p_p_col_id: 'column-2',
      p_p_col_pos: 1,
      p_p_col_count: 3,
      _mhmRemboursement_WAR_mhmportalapplication_action: 'detailPaiement',
      counter: paymentCounter,
      numPaiement: this.payments[paymentCounter]
    }

    let options = Object.assign(defaultOptions, {
      uri: url,
      qs: qs
    })

    promises.push(request(options))
  }

  return Promise.all(promises).then(documents => {
    documents.forEach(document => {
      let doc = JSON.parse(document)

      doc.decompteList.forEach(reimbursement => {
        let bill = {
          type: 'health_costs',
          subtype: reimbursement.labelActe,
          vendor: 'Harmonie',
          originalAmount: parseAmount(reimbursement.honoraires),
          amount: parseAmount(reimbursement.montantRC),
          date: moment(
            new Date(reimbursement.dateSoin.split('/').reverse().join('/'))
          ),
          isRefund: true
        }

        // find the corresponding pdf file
        // releves is ordered in reverse chronological order
        for (let [dateReleve, url] of this.releves) {
          if (dateReleve > bill.date) {
            bill.fileurl = url
            // we prefer to use the date of the releve in the file name and not the bill date
            bill.uniqueId = moment(dateReleve).format('YYYYMMDD')
          }
        }

        this.yield(bill)

        // champs inutilisés:
        // honoraires : montant dépensé
        // montantRO : remboursement sécu
        // nom et prénom
        // numeroPaiement (sur objet parent)
      })
    })
  })
}

function customSaveBills(requiredFields, entries) {
  const bankOptions = {
    identifiers: 'Harmonie',
    minDateDelta: 0.1,
    maxDateDelta: 40,
    amountDelta: 0.1
  }

  const filterOptions = {
    keys: ['date', 'amount']
  }

  return saveBills(
    this.files,
    this.fields.folderPath,
    Object.assign({}, bankOptions, filterOptions, fileOptions, {
      identifiers: ['date']
    })
  )
}
