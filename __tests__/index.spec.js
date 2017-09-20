// Replay config
const replay = require('replay')

// Cannot get replay to work in replay mode :/
// replay.mode = 'record'
replay.fixtures = __dirname + '/fixtures'

const libs = require('../lib')
const moment = require('moment')
const login = libs.login
const fetchReleves = libs.releves
const fetchPaiements = libs.paiements
const fetchRepayments = libs.repayments

const fields = require('../konnector-dev-config.json').fields

const data = {}

expect.extend({
  toEqualMoment: function (received, argument) {
    const pass = received.isSame(argument)
    if (pass) {
      return {
        message: `expected ${received} not to equal moment ${argument}`,
        pass
      }
    } else {
      return {
        message: `expected ${received} to equal moment ${argument}`,
        pass
      }
    }
  }
})

test('login', function () {
  return login(fields)
})

test('releves', function () {
  return fetchReleves.bind(data)(fields).then(function (response) {
    const releves = Array.from(data.releves)
    expect(releves.length).toBe(10)
    expect(releves[0][0]).toEqual(new Date('2017-09-17T22:00:00.000Z'))
    expect(releves[0][1]).toBe('https://www.harmonie-mutuelle.fr/web/mon-compte/mes-releves?p_p_id=decomptes_WAR_MHMportlet&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=decompteFile201709&p_p_cacheability=cacheLevelPage&p_p_col_id=column-4&p_p_col_pos=1&p_p_col_count=3&_decomptes_WAR_MHMportlet_fileChoice=SrcSyst_9%2F02832334%2F02832334_22057529_HAUP00_PS001_ADH____PSREIA01_10000400_20170918_P_________BA_PCGSALARI_DM_QUO-RAS____00000_PCSM3031D.pdf')
  })
})

test('paiements', function () {
  return fetchPaiements.bind(data)().then(function () {
    expect(data.payments[0]).toEqual({
      'id': '147828884',
      'paymentDate': '11/09/2017'
    })
  })
})

test('repayments', function () {
  const results = []
  data.yield = function (item) {
    results.push(item)
  }
  return fetchRepayments.bind(data)().then(function () {
    const bill = results[0]
    expect(bill).toMatchObject({
      type: 'health_costs',
      subtype: 'Consultation dentaire',
      vendor: 'Harmonie',
      originalAmount: 23,
      amount: 6.9,
      isRefund: true,
      beneficiary: 'name girl',
      socialSecurityRefund: 16.1,
      fileurl: 'https://www.harmonie-mutuelle.fr/web/mon-compte/mes-releves?p_p_id=decomptes_WAR_MHMportlet&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=decompteFile201709&p_p_cacheability=cacheLevelPage&p_p_col_id=column-4&p_p_col_pos=1&p_p_col_count=3&_decomptes_WAR_MHMportlet_fileChoice=SrcSyst_9%2F02832334%2F02832334_22057529_HAUP00_PS001_ADH____PSREIA01_10000400_20170918_P_________BA_PCGSALARI_DM_QUO-RAS____00000_PCSM3031D.pdf',
      uniqueId: 'Facture 2017/09/18 Sep 2017',
      filename: 'Facture 2017/09/18 Sep 2017.pdf'
    })

    expect(bill.originalDate).toEqualMoment("2017-09-11")
    expect(bill.date).toEqualMoment("2017-09-06")
  })
})
