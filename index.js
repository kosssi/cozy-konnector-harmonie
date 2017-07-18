const konnector = require('./konnector')
const { log } = require('cozy-konnector-libs')

const cozyFields = JSON.parse(process.env.COZY_FIELDS)

konnector.fetch({account: cozyFields.account, folderPath: cozyFields.folder_to_save}, err => {
  log('info', 'The konnector has been run')
  if (err) {
    log('error', err.message, 'Error caught by index.js')
    process.exit(1)
  }
})
