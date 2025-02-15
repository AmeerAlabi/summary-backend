# parse-pdf
[![NPM Version](http://img.shields.io/npm/v/parse-pdf.svg?style=flat-square)](https://npmjs.com/package/parse-pdf)
[![License](http://img.shields.io/npm/l/parse-pdf.svg?style=flat-square)](http://opensource.org/licenses/MIT)
[![Build Status](https://travis-ci.org/bjrmatos/parse-pdf.png?branch=master)](https://travis-ci.org/bjrmatos/parse-pdf)

> **Get text content and metadata about pdf**

## Usage
```js
const fs = require('fs')
const parsePdf = require('parse-pdf')

const parsed = await parsePdf(fs.readFileSync('some-pdf-file.pdf'))

console.log(parsed.pages[0].text)
```

## License
See [license](https://github.com/bjrmatos/parse-pdf/blob/master/LICENSE)
