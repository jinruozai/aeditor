import { generateApiDocs } from './api-docs.mjs'

const payload = generateApiDocs()
console.log('generated ' + payload.entries.length + ' API docs')
