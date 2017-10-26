const request = require('request-promise')
const cheerio = require('cheerio')
const moment = require('moment')
const { saveBills } = require('cozy-konnector-libs')

const j = request.jar()

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

const login = module.exports.login = function (requiredFields) {
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
        this.terminate('LOGIN_FAILED')
      }
    })
}

const releves = module.exports.releves = function (requiredFields) {
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

    throw new Error('TEST')

    this.releves = releveList
  })
}

const paiements = module.exports.paiements = function paiements(requiredFields) {
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

      const $payments = $('tr').filter((i,x) => {
        return x.attribs.id && x.attribs.id.indexOf('remboursement') > -1
      })

      $payments.each(function (i, node) {
        const $node = $(node)
        const loupe = $node.find('img.loupe')[0]
        let onclick = loupe.attribs.onclick
        if (!onclick) return
        let chunks = onclick.split("'")
        paymentList[chunks[1]] = {
          id: chunks[3],
          paymentDate: $($node.find('td')[1]).text()
        }
      })

      this.payments = paymentList
    })
}

const parseAmount = function(amount) {
  return parseFloat(
    amount.replace('&nbsp;', '').replace('&euro;', '').replace(',', '.')
  )
}

const repayments = module.exports.repayments = function(requiredFields) {
  const url = 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-remboursements'
  const promises = []
  const payments = []

  for (let paymentCounter in this.payments) {
    const payment = this.payments[paymentCounter]
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
      numPaiement: payment.id
    }

    let options = Object.assign(defaultOptions, {
      uri: url,
      qs: qs
    })

    promises.push(request(options))
    payments.push(payment)
  }

  return Promise.all(promises).then(documents => {
    documents.forEach((document, i) => {
      let doc = JSON.parse(document)

      doc.decompteList.forEach(reimbursement => {
        const paymentInfo = payments[i]
        let bill = {
          type: 'health_costs',
          subtype: reimbursement.labelActe,
          vendor: 'Harmonie',
          originalAmount: parseAmount(reimbursement.honoraires),
          amount: parseAmount(reimbursement.montantRC),
          originalDate: moment(paymentInfo.paymentDate, 'DD/MM/YYYY'),
          date: moment(reimbursement.dateSoin, 'DD/MM/YYYY'),
          isRefund: true,
          beneficiary: `${reimbursement.nom} ${reimbursement.prenom}`,
          socialSecurityRefund: parseAmount(reimbursement.montantRO)
        }

        // find the corresponding pdf file
        // releves is ordered in reverse chronological order
        for (let [dateReleve, url] of this.releves) {
          if (dateReleve > bill.date) {
            bill.fileurl = url
            // we prefer to use the date of the releve in the file name and not the bill date
            bill.uniqueId = moment(dateReleve).format('[Facture] YYYY[/]MM[/]DD MMM YYYY')
            bill.filename = `${bill.uniqueId}.pdf`
            bill.requestOptions = {
              jar: j
            }
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

module.exports.customSaveBills = function (requiredFields, entries) {
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
    Object.assign({}, bankOptions, filterOptions, {
      identifiers: ['date']
    })
  )
}
