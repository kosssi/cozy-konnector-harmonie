'use strict'

const {baseKonnector, saveBills} = require('cozy-konnector-libs')
let request = require('request-promise-native')
const moment = require('moment')
// require('request-debug')(request)

const cheerio = require('cheerio')

module.exports = baseKonnector.createNew({
  name: 'Harmonie',
  models: [],
  fetchOperations: [
    login,
    releves,
    paiements,
    reimbursements,
    customSaveBills
  ]
})

const j = request.jar()

const fileOptions = {
  vendor: 'Harmonie',
  requestoptions: {
    jar: j
  }

}

const baseUrl = 'https://www.harmonie-mutuelle.fr/'
const userAgent = 'Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:37.0) ' +
                  'Gecko/20100101 Firefox/37.0'
const defaultOptions = {
  method: 'GET',
  url: `${baseUrl}`,
  headers: {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  },
  jar: j
}

function login (requiredFields, entries, data, next) {
  request(defaultOptions)
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
      url: actionUrl,
      formData: formData,
      simple: false,
      resolveWithFullResponse: true
    })

    return request(options)
  })
  .then((response) => {
    // this is a bit strange: if the status code is 302, it means the login was successful. If it's 200, it actually means there was an error. This may change in the future if the form's action is changed.
    if (response.statusCode === 302) next()
    else {
      next(new Error('LOGIN_FAILED'))
    }
  })
  .catch(err => {
    return next(err)
  })
}

function releves (requiredFields, entries, data, next) {
  let url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-releves'

  let options = Object.assign(defaultOptions, {
    url: url,
    resolveWithFullResponse: false
  })

  request(options)
  .then(body => {
    let $ = cheerio.load(body)
    let releveList = new Map()

    $('#decompte_table tbody tr').each((index, tr) => {
      let $tr = $(tr)

      let link = $tr.find('a').attr('href')
      let date = $tr.find('td').first().text()
      date = new Date(date.split('/').reverse().join('/'))

      releveList.set(date, link)
    })

    data.releves = releveList

    return next()
  })
  .catch(err => {
    return next(err)
  })
}

function paiements (requiredFields, entries, data, next) {
  let url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-remboursements'

  let options = Object.assign(defaultOptions, {
    url,
    resolveWithFullResponse: false
  })

  request(options)
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
    formvalues.dateDebutAnnee = (formvalues.dateFinAnnee - 1) + ''

    let options = {
      url: $form.attr('action'),
      method: 'POST',
      form: formvalues,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      jar: j
    }
    return request(options)
  })
  .then(body => {
    let $ = cheerio.load(body)
    let paimentList = {}

    $('img.loupe').each((index, elem) => {
      let onclick = elem.attribs.onclick
      if (!onclick) return
      let chunks = onclick.split("'")
      paimentList[chunks[1]] = chunks[3]
    })

    data.paiments = paimentList

    return next()
  })
  .catch(err => {
    return next(err)
  })
}

function reimbursements (requiredFields, entries, data, next) {
  let url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-remboursements'
  let promises = []

  for (let paiementCounter in data.paiments) {
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
      counter: paiementCounter,
      numPaiement: data.paiments[paiementCounter]
    }

    let options = Object.assign(defaultOptions, {
      url: url,
      qs: qs
    })

    promises.push(request(options))
  }

  Promise.all(promises)
  .then(documents => {
    entries.fetched = []

    documents.forEach(document => {
      let doc = JSON.parse(document)

      doc.decompteList.forEach(reimbursement => {
        let bill = {
          type: 'health_costs',
          subtype: reimbursement.labelActe,
          vendor: 'Harmonie',
          amount: parseFloat(reimbursement.montantRC),
          date: moment(new Date(reimbursement.dateSoin.split('/').reverse().join('/'))),
          isRefund: true
        }

        // find the corresponding pdf file
        // releves is ordered in reverse chronological order
        for (let [dateReleve, url] of data.releves) {
          if (dateReleve > bill.date) {
            bill.pdfurl = url
            // we prefer to use the date of the releve in the file name and not the bill date
            bill.uniqueId = moment(dateReleve).format('YYYYMMDD')
          }
        }

        entries.fetched.push(bill)

        // champs inutilisés:
        // honoraires : montant dépensé
        // montantRO : remboursement sécu
        // nom et prénom
        // numeroPaiement (sur objet parent)
      })
    })

    next()
  })
  .catch(err => {
    return next(err)
  })
}

function customSaveBills (requiredFields, entries, data, next) {
  const bankOptions = {
    identifiers: 'Harmonie',
    minDateDelta: 0.1,
    maxDateDelta: 40,
    amountDelta: 0.1
  }

  const filterOptions = {
    keys: ['date', 'amount']
  }

  saveBills(filterOptions, fileOptions, bankOptions)(requiredFields, entries, data, next)
}
