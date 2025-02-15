'use strict'

const pdfjs = require('pdfjs-dist')

async function getPageText (pageNum, doc) {
  const page = await doc.getPage(pageNum)
  const textContent = await page.getTextContent()
  return textContent.items.reduce((a, v) => a + v.str, '')
}

module.exports = async (contentBuffer, { customPdfjs } = {}) => {
  let pdfjsAPI = pdfjs

  if (customPdfjs) {
    pdfjsAPI = customPdfjs
  }

  const doc = await pdfjsAPI.getDocument(contentBuffer)

  const result = { pages: [] }

  for (let i = 1; i < doc.pdfInfo.numPages + 1; i++) {
    result.pages.push({
      text: await getPageText(i, doc)
    })
  }

  return result
}
