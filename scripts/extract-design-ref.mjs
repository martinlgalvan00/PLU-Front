import fs from 'node:fs'
import path from 'node:path'

const file = path.join(
  process.cwd(),
  'design-reference/PLU ARG - Sitio Publico (standalone).html',
)
const raw = fs.readFileSync(file, 'utf8')

// Embedded design HTML is JSON-escaped on line ~180
const match = raw.match(/"<!DOCTYPE html>\\n[\s\S]*?"\s*,?\s*\n/)
let html = match ? match[0].slice(1, -3) : raw
html = html.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\u002F/g, '/')

fs.writeFileSync('design-reference/extracted-design.html', html)
console.log('extracted length:', html.length)

const colors = [...new Set(html.match(/#[0-9a-fA-F]{3,8}/g) ?? [])].slice(0, 40)
console.log('colors sample:', colors.join(', '))

const fonts = [...new Set([...(html.match(/font-family:\s*[^;}{]+/g) ?? [])].map((s) => s.trim()))].slice(0, 20)
console.log('fonts:', fonts.join('\n  '))

const sections = [...html.matchAll(/<(section|header|footer|nav)[^>]*(?:id|class|data-dc)[^>]*>/gi)].slice(0, 30)
console.log('sections count:', sections.length)

const textSnippets = [...html.matchAll(/>([A-ZÁÉÍÓÚÑ¿][^<]{8,80})</g)]
  .map((m) => m[1].trim())
  .filter((t) => !t.includes('{') && !t.startsWith('http'))
  .slice(0, 50)
console.log('text snippets:\n', textSnippets.join('\n'))
