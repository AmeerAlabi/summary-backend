'use strict'

const path = require('path')
const fs = require('fs')
const should = require('should')
const parsePdf = require('../')

const invoicePdfPath = path.join(__dirname, 'Invoice.pdf')

describe('parse-pdf', () => {
  it('should parse pdf', async () => {
    const parsed = await parsePdf(fs.readFileSync(invoicePdfPath))

    should(parsed.pages[0].text).containEql('Invoice #: 123')
    should(parsed.pages[0].text).containEql('Total: $300')
  })
})
